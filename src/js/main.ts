/**
 * German-English Dictionary
 * =========================
 *
 * Copyright © 2024 Hauke Dämpfling, haukex@zero-g.net
 *
 * Source code: https://github.com/haukex/de-en-dict
 *
 * This project is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This project is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this project; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import {assert, isWorkerMessage, MainState, MainMessageType, WorkerState, IDictStats} from './common'
import {initPopups, addTitleTooltips, closeAllPopups} from './popups'
import {wrapTextNodeMatches, cleanSearchTerm} from './utils'
import {initSearchBoxChange} from './searchbox'
import {initScrollTop} from './scroll-top'
import {result2tbody} from './render'
import {initFlags} from './flags'
import {LRUCache} from './lru'

if (module.hot) module.hot.accept()  // for the parcel development environment

const GIT_ID = '$Id$'
const INIT_TIMEOUT_MS = 2000
const SEARCH_TIMEOUT_MS = 2000
const SMALL_CHUNK_SZ = 50
const LARGE_CHUNK_SZ = 200

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../workers/sw.ts', import.meta.url), {type: 'module', scope: '/'}).then(
    registration => console.debug('SW register ok', registration),
    error => console.error('Service Worker registration failed', error),
  )
  navigator.serviceWorker.addEventListener('message', event => console.debug('SW:', event.data))
} else console.warn('Service Workers are not supported')

// variable for our state machine
// STATE MACHINE DOCUMENTATION is in States.md - keep in sync with code!
let state = MainState.Init

// initialize the worker
const worker = new Worker(new URL('../workers/worker.ts', import.meta.url), {type: 'module'})

// when the HTML page has finished loading:
window.addEventListener('DOMContentLoaded', async () => {
  // make sure we're in the correct state (i.e. that this handler isn't called twice)
  if ( state !== MainState.Init )
    throw new Error(`DOMContentLoaded in state ${MainState[state]}`)

  // get all of the HTML elements from the page that we need
  const search_term = document.getElementById('search-term')
  const search_progress = document.getElementById('search-progress')
  const search_timeout = document.getElementById('search-timeout')
  const result_table = document.getElementById('result-table')
  const dict_status = document.getElementById('dict-status')
  const dict_upd_status = document.getElementById('dict-upd-status')
  const search_status = document.getElementById('search-status')
  const no_results = document.getElementById('no-results')
  const more_buttons = document.getElementById('more-buttons')
  const dict_prog_div = document.getElementById('dict-prog-div')
  const dict_progress = document.getElementById('dict-progress')
  const rand_entry_link = document.getElementById('rand-entry-link')
  const dict_load_fail = document.getElementById('dict-load-fail')
  const error_log = document.getElementById('error-log')
  assert( search_term instanceof HTMLInputElement && result_table && dict_status && dict_upd_status && search_status && no_results
    && more_buttons && dict_prog_div && dict_progress && search_progress && search_timeout && rand_entry_link && dict_load_fail && error_log )
  const orig_title_text = document.title

  // variables to keep state
  let dictStats :IDictStats = { lines: 0, entries: 0, oneToOne: 0 }
  let dictWasUpdated = false
  let timerId :number
  const searchCache = new LRUCache<string, [string, string[]]>(10)

  // updates the state and UI correspondingly
  const updateState = (newState :MainState) => {
    console.debug(`updateState ${MainState[state]} to ${MainState[newState]}`)
    // enable/disable UI components depending on state
    if ( newState === MainState.Ready ) {
      rand_entry_link.classList.remove('busy-link')
      search_term.removeAttribute('readonly')
    }
    else {
      /* DON'T use `disabled`, because in the case where this code is going to the state `Searching` due to a search,
       * setting that attribute causes a recursive `change` event and search to be fired here! (Chrome and Edge) */
      search_term.setAttribute('readonly','readonly')
      // note the click handler must check the state too and ignore clicks when not Ready
      rand_entry_link.classList.add('busy-link')
    }
    if ( newState === MainState.Ready )
      dict_status.innerText = `Dictionary holds ${dictStats.entries} entries in ${dictStats.lines} lines`
        + ( dictStats.oneToOne ? ` (${dictStats.oneToOne} 1:1 translations)` : '' )
        + ( dictWasUpdated ? ' (updated in background).' : '.' )
    else if ( newState === MainState.AwaitingDict )
      dict_status.innerText = 'The dictionary is loading, please wait...'
    else if ( newState === MainState.Searching )
      dict_status.innerText = `Searching ${dictStats.entries} entries, please wait...`
    else if ( newState === MainState.Error )
      dict_status.innerText = state === MainState.AwaitingDict ? 'Dictionary load failure! See error message above.'
        : state === MainState.Searching ? 'Search timed out! See error message above.' : 'See error message above.'
    else if ( newState === MainState.Init )
      dict_status.innerText = 'Initializing, please wait...'
    // if transitioning to error state, make sure corresponding messages are shown
    // (though the code below should already be doing this, just play it safe)
    if ( newState === MainState.Error ) {
      if ( state === MainState.AwaitingDict )
        dict_load_fail.classList.remove('d-none')
      else if ( state === MainState.Searching )
        search_timeout.classList.remove('d-none')
    }
    search_progress.classList.add('d-none')
    state = newState
    //console.debug(`updateState done, state=${MainState[state]}`)
  }
  // call this immediately (note the input box should already be readonly in HTML, but there are other things to update)
  updateState(state)

  // utility function to clear the results table
  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach(elem => elem.remove())
    // ensure all popups get hidden (apparently needed in some browsers?)
    closeAllPopups()
    // clear status
    search_status.innerText = ''
    more_buttons.replaceChildren()
    search_progress.classList.add('d-none')
  }

  // handler for search results received from worker
  const gotSearchResults = (origWhat :string, whatPat :string, matches :string[]) => {
    // save results in cache
    searchCache.set(origWhat, [whatPat, matches])

    clearResults()
    // check if there were any matches
    no_results.classList.toggle('d-none', !!matches.length)
    if (!matches.length) {
      console.debug(`Search for '${origWhat}' had no matches, nothing to render`)
      return
    }

    // function for rendering matches, which we set up here, then call below
    let displayedMatches = 0  // holds the state between invocations of this function:
    const renderMatches = (start :number, end :number) => {
      // start inclusive, end exclusive
      console.debug(`Rendering matches ${start} to ${end}-1 of ${matches.length} (displayed=${displayedMatches})`)

      // loop over the chunk of lines to be displayed
      matches.slice(start, end).forEach( matchLine => {
        try {  // especially result2tbody may throw errors
          const tbody = result2tbody(matchLine)
          // highlight the search term in the match
          tbody.querySelectorAll('td').forEach( td => {
            wrapTextNodeMatches(td, whatPat, match => {
              const e = document.createElement('strong')
              e.innerText = match
              return e
            }, 'i')
          })
          result_table.appendChild(tbody)
          displayedMatches++
          addTitleTooltips(tbody.querySelectorAll('abbr'))
        }
        catch (error) { console.error(error) }
      })

      // update the status bar and "more" buttons
      more_buttons.replaceChildren()
      if (displayedMatches<matches.length) {
        search_status.innerText = `Found ${matches.length} matches, showing the first ${displayedMatches}.`
        // we haven't shown all results, make buttons to show more
        const make_btn_more = (howMany :number) => {
          const btn_more = document.createElement('button')
          btn_more.classList.add('btn-more')
          btn_more.innerText = `Show ${howMany} More`
          btn_more.addEventListener('click', () => renderMatches(end, end+howMany) )
          more_buttons.appendChild(btn_more)
        }
        if ( matches.length-displayedMatches < SMALL_CHUNK_SZ )
          make_btn_more(matches.length-displayedMatches)
        else {
          make_btn_more(SMALL_CHUNK_SZ)
          if ( matches.length-displayedMatches < LARGE_CHUNK_SZ )
            make_btn_more(matches.length-displayedMatches)
          else
            make_btn_more(LARGE_CHUNK_SZ)
        }
      }
      else
        search_status.innerText = `Showing all ${matches.length} matches.`

    } // end of renderMatches

    // render the first chunk of results
    renderMatches(0, SMALL_CHUNK_SZ)

  } // end of gotSearchResults

  // handler for when we get the random entry back
  const gotRandLine = (randLine :string) => {
    clearResults()
    const tbody = result2tbody(randLine)
    result_table.appendChild(tbody)
    addTitleTooltips(tbody.querySelectorAll('abbr'))
    search_status.innerText = 'Showing a random entry.'
  }

  // Get search term from URL and copy it to the search box
  const hashToSearchTerm = () => {
    // query overrides hash (see GitHub Issue #7: some links to the app use '?' instead of '#')
    if ( window.location.search.length > 1 ) {
      const loc = new URL(''+window.location)
      loc.hash = '#' + loc.search.substring(1)
      loc.search = ''
      window.location.replace(loc)
    }
    // parse hash
    let what = ''
    if (window.location.hash.startsWith('#q=')) {
      try {
        what = cleanSearchTerm( decodeURIComponent(window.location.hash.substring('#q='.length)) )
      }
      catch (error) {
        // for example, `decodeURIComponent('%97')` causes "URIError: malformed URI sequence"
        console.warn('ignoring bad window.location.hash',error)
      }
    }
    search_term.value = what
  }

  // Starts a search using a value in the URL hash, if any
  const searchFromUrl = () => {
    hashToSearchTerm()
    console.debug(`Search from URL for '${search_term.value}'`)
    doSearch(search_term.value, false)
  }

  // handler in case the worker does not get back to us with a search result
  const searchTimeout = () => {
    // ensure the corresponding message gets shown
    search_timeout.classList.remove('d-none')
    updateState(MainState.Error)
  }

  // this is our handler for running the search:
  const doSearch = (rawWhat: string, fromInputNotUrl :boolean) => {
    console.debug(`doSearch for '${rawWhat}' (fromInputNotUrl=${fromInputNotUrl}, state=${MainState[state]})`)
    if ( state !== MainState.Ready ) return

    const what = cleanSearchTerm(rawWhat)

    // update page title with search term
    document.title = what.length ? `${orig_title_text}: ${what}` : orig_title_text
    if (fromInputNotUrl) {  // the term came from the input box, not hash, so update the hash
      const newHash = what.length ? `#q=${encodeURIComponent(what)}` : ''
      const loc = new URL(''+window.location)
      loc.hash = newHash
      if ( window.location.hash !== newHash )
        window.history.pushState(null, '', loc)
    }

    // short-circuit empty search
    if (!what.length) {
      console.debug('Empty search term: clearing results, not searching')
      // the following is what gotSearchResults() does when it has no matches
      clearResults()
      no_results.classList.remove('d-none')
      return
    }

    // before going to dict, check our cache
    const cached = searchCache.get(what)
    if ( cached !== undefined ) {
      const [cachedWhatPat, cachedMatches] = cached
      console.log(`Search for /${cachedWhatPat}/gi had ${cachedMatches.length} results in cache.`)
      gotSearchResults(what, cachedWhatPat, cachedMatches)
      return
    }

    // request the search from our worker thread
    updateState(MainState.Searching)
    timerId = window.setTimeout(searchTimeout, SEARCH_TIMEOUT_MS)
    const m :MainMessageType = { type: 'search', what: what }
    worker.postMessage(m)
  }

  // random entry link handler
  rand_entry_link.addEventListener('click', event => {
    event.preventDefault()
    if ( state !== MainState.Ready ) return
    updateState(MainState.Searching)
    timerId = window.setTimeout(searchTimeout, SEARCH_TIMEOUT_MS)
    const m :MainMessageType = { type: 'get-rand' }
    worker.postMessage(m)
  })

  // Initialize event listener for input field changes
  initSearchBoxChange(search_term, () => doSearch(search_term.value, true))

  // initialize various things
  initScrollTop()
  initFlags()
  initPopups()
  hashToSearchTerm()  // just updates the text box, actual search is later

  // handler for dictionary load failures
  const dictLoadFail = (message :string) => {
    error_log.innerText = navigator.userAgent + '\n' + GIT_ID + '\n' + message
    dict_load_fail.classList.remove('d-none')
    updateState(MainState.Error)
  }

  // STATE MACHINE DOCUMENTATION is in States.md - keep in sync with code!

  // set up the handler for messages we get from the worker
  worker.addEventListener('message', event => {
    if (!isWorkerMessage(event.data)) return
    // -------------------------{ worker-status }-------------------------
    if ( event.data.type === 'worker-status' ) {
      dictStats = event.data.dictStats
      if (event.data.state !== WorkerState.LoadingDict)
        dict_prog_div.classList.add('d-none')
      if ( state === MainState.AwaitingDict )
        window.clearTimeout(timerId)
      // ---------------[ LoadingDict ]---------------
      if (event.data.state === WorkerState.LoadingDict) {
        if ( state === MainState.AwaitingDict ) {
          updateState(state)  // force update of the dictionary status message
          // We now know the dictionary is loading, and we don't know how often progress will be reported,
          // so we can't set a new timeout here.
        } else console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
      }
      // ---------------[ Ready ]---------------
      else if (event.data.state === WorkerState.Ready) {
        if ( state === MainState.AwaitingDict ) {
          updateState(MainState.Ready)
          // Install event listener for browser navigation updating the URL hash
          window.addEventListener('hashchange', searchFromUrl)
          // Trigger a search upon loading (the input field was readonly until now, so we know the user didn't enter anything there)
          searchFromUrl()  // may transition to `Searching`!
          // TypeScript doesn't realize that `state` will have changed here.
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          if ( state === MainState.Ready )
            search_term.focus()
        } else if ( state !== MainState.Ready )
          console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
      }
      // ---------------[ Error ]---------------
      else if (event.data.state === WorkerState.Error) {
        if ( state !== MainState.AwaitingDict )
          console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
        // error, display the corresponding message box
        dictLoadFail(new String(event.data.error).toString())
      }
    }
    // -------------------------{ dict-prog }-------------------------
    else if ( event.data.type == 'dict-prog' ) {
      // we received a dict loading status report, which we can ignore if we're not waiting for the dict
      if ( state === MainState.AwaitingDict ) {
        dict_progress.setAttribute('value', event.data.percent.toString())
        dict_prog_div.classList.toggle('d-none', event.data.percent>=100)
      } //else console.warn(`Unexpected dictionary progress in state ${MainState[state]}`)
    }
    // -------------------------{ search-prog }-------------------------
    else if ( event.data.type === 'search-prog' ) {
      // we received a search status report, which we can ignore if we're not actually searching
      if ( state === MainState.Searching ) {
        search_progress.setAttribute('value', event.data.percent.toString())
        search_progress.classList.toggle('d-none', event.data.percent>=100)
        clearTimeout(timerId)
        timerId = window.setTimeout(searchTimeout, SEARCH_TIMEOUT_MS)
      } //else console.warn(`Unexpected search progress in state ${MainState[state]}`)
    }
    // -------------------------{ dict-upd }-------------------------
    else if ( event.data.type === 'dict-upd' ) {
      // we received the information that the dictionary was asynchronously updated
      // since all we're doing is updating some texts, it doesn't matter what state we're in
      dictStats = event.data.dictStats
      if (event.data.status === 'loading')
        dict_upd_status.innerText = '(Updating in background...)'
      else if (event.data.status === 'error')
        dict_upd_status.innerText = '(Background dictionary update failed. Try reloading?)'
      else {
        dict_upd_status.innerText = ''
        if (event.data.status === 'done') {
          dictWasUpdated = true
          updateState(state)
        }
      }
    }
    // -------------------------{ results }-------------------------
    else if ( event.data.type === 'results' ) {
      // we got some search results
      if ( state === MainState.Searching ) {
        window.clearTimeout(timerId)
        gotSearchResults(event.data.what, event.data.whatPat, event.data.matches)
        updateState(MainState.Ready)
        search_term.focus()
      } else console.error(`Unexpected search results in state ${MainState[state]}`)
    }
    // -------------------------{ rand-line }-------------------------
    else if ( event.data.type === 'rand-line' ) {
      // we got a random line
      if ( state === MainState.Searching ) {
        window.clearTimeout(timerId)
        gotRandLine(event.data.line)
        updateState(MainState.Ready)
      } else console.error(`Unexpected random line in state ${MainState[state]}`)
    }
  })  // end of worker message handler

  // now that we're ready, ask the worker for its state
  let loadDictRetries = 0
  const timeoutHandler = () => {
    // try resending the request a few times
    if ( state === MainState.AwaitingDict && ++loadDictRetries<4 ) {
      timerId = window.setTimeout(timeoutHandler, INIT_TIMEOUT_MS)
      const m :MainMessageType = { type: 'status-req' }
      worker.postMessage(m)
    } else
      dictLoadFail('Timed out waiting for response from worker.')
  }
  updateState(MainState.AwaitingDict)
  timeoutHandler()  // reuse the timeout handler's code to set up the initial timeout
})
