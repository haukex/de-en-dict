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

import {assert, isWorkerMessage, MainState, MainMessageType, WorkerState} from './common'
import {initPopups, addTitleTooltips, closeAllPopups} from './popups'
import {wrapTextNodeMatches, cleanSearchTerm} from './utils'
import {initInputFieldKeys} from './keyboard'
import {initScrollTop} from './scroll-top'
import {result2tbody} from './render'
import {initFlags} from './flags'

if (module.hot) module.hot.accept()  // for the parcel development environment

const GIT_ID = '$Id$'
const INIT_TIMEOUT_MS = 2000
const SEARCH_TIMEOUT_MS = 2000
const SMALL_CHUNK_SZ = 50
const LARGE_CHUNK_SZ = 200

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../workers/sw.ts', import.meta.url), {type: 'module', scope: '/'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
  navigator.serviceWorker.addEventListener('message', event => console.debug('SW:', event.data))
} else console.warn('Service Workers are not supported')

// variable for our state machine
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
  let dictLinesLen = 0
  let timerId :number

  // updates the state and UI correspondingly
  const updateState = (newState :MainState) => {
    // enable/disable UI components depending on state
    if ( newState === MainState.Ready ) {
      rand_entry_link.classList.remove('busy-link')
      search_term.removeAttribute('disabled')
      search_term.focus()
    }
    else {
      search_term.setAttribute('disabled','disabled')
      // note the click handler must check the state too and ignore clicks when not Ready
      rand_entry_link.classList.add('busy-link')
    }
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
  }
  // call this immediately (note the input box should already be disabled in HTML, but there are other things to update)
  updateState(state)

  // utility function to clear the results table
  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach((elem) => elem.remove())
    // ensure all popups get hidden (apparently needed in some browsers?)
    closeAllPopups()
    // clear status
    search_status.innerText = ''
    more_buttons.replaceChildren()
    search_progress.classList.add('d-none')
  }

  // handler for search results received from worker
  const gotSearchResults = (whatPat :string, matches :string[]) => {
    clearResults()
    // check if there were any matches
    no_results.classList.toggle('d-none', !!matches.length)
    if (!matches.length) return

    // function for rendering matches, which we set up here, then call below
    let displayedMatches = 0  // holds the state between invocations of this function:
    const renderMatches = (start :number, end :number) => {
      // start inclusive, end exclusive

      // loop over the chunk of lines to be displayed
      matches.slice(start, end).forEach((matchLine) => {
        try {  // especially result2tbody may throw errors
          const tbody = result2tbody(matchLine)
          // highlight the search term in the match
          tbody.querySelectorAll('td').forEach((td) => {
            wrapTextNodeMatches(td, whatPat, (match) => {
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

  // Starts a search using a value in the URL hash, if any
  const searchFromUrl = () => {
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
    doSearch(what, false)
  }

  // handler for when we get the random entry back
  const gotRandLine = (randLine :string) => {
    clearResults()
    const tbody = result2tbody(randLine)
    result_table.appendChild(tbody)
    addTitleTooltips(tbody.querySelectorAll('abbr'))
    search_status.innerText = 'Showing a random entry.'
  }

  // this is our handler for running the search:
  let prevWhat = 'Something the user is really unlikely to enter on their own by chance, so after initialization the first search is always performed.'
  const doSearch = (raw_what: string, fromInputNotUrl :boolean) => {
    if ( state !== MainState.Ready ) return

    const what = cleanSearchTerm(raw_what)
    // updating the hash always forces a search:
    // (for example, this is important if the hash was changed during the dictionary load for some reason)
    if ( fromInputNotUrl && what===prevWhat ) return
    prevWhat = what

    // update page title with search term
    document.title = what.length ? `${orig_title_text}: ${what}` : orig_title_text
    if (fromInputNotUrl) {  // the term came from the input box, not hash, so update the hash
      const newHash = `#q=${encodeURIComponent(what)}`
      if ( window.location.hash !== newHash )
        window.history.pushState(null, '', newHash)
    }

    // request the search from our worker thread
    updateState(MainState.Searching)
    timerId = window.setTimeout(() => updateState(MainState.Error), SEARCH_TIMEOUT_MS)
    const m :MainMessageType = { type: 'search', what: what }
    worker.postMessage(m)
  }

  // random entry link handler
  rand_entry_link.addEventListener('click', event => {
    event.preventDefault()
    if ( state !== MainState.Ready ) return
    updateState(MainState.Searching)
    timerId = window.setTimeout(() => updateState(MainState.Error), SEARCH_TIMEOUT_MS)
    const m :MainMessageType = { type: 'get-rand' }
    worker.postMessage(m)
  })

  // Helper to run the search from the input field
  const searchFromInput = () => doSearch(search_term.value, true)

  // Install event listener for input field changes
  search_term.addEventListener('change', searchFromInput)
  initInputFieldKeys(search_term, searchFromInput)

  // initialize various things
  initScrollTop()
  initFlags()
  initPopups()

  // set up the handler for messages we get from the worker
  worker.addEventListener('message', event => {
    if (!isWorkerMessage(event.data)) return
    // -------------------------{ worker-status }-------------------------
    if ( event.data.type === 'worker-status' ) {
      dictLinesLen = event.data.dictLinesLen
      if (event.data.state !== WorkerState.LoadingDict)
        dict_prog_div.classList.add('d-none')
      if ( state === MainState.AwaitingDict )
        window.clearTimeout(timerId)
      // ---------------[ LoadingDict ]---------------
      if (event.data.state === WorkerState.LoadingDict) {
        if ( state === MainState.AwaitingDict ) {
          dict_status.innerText = 'The dictionary is loading, please wait...'
          // We now know the dictionary is loading, and we don't know how often progress will be reported,
          // so we can't set a new timeout here.
        } else console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
      }
      // ---------------[ Ready ]---------------
      else if (event.data.state === WorkerState.Ready) {
        if ( state === MainState.AwaitingDict ) {
          dict_status.innerText = `Dictionary holds ${dictLinesLen} entries.`
          updateState(MainState.Ready)
          // Install event listener for browser navigation updating the URL hash
          window.addEventListener('hashchange', searchFromUrl)
          // Trigger a search upon loading (the input field was disabled until now)
          searchFromUrl()  // transitions to `Searching`!
        } else if ( state !== MainState.Ready )
          console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
      }
      // ---------------[ Error ]---------------
      else if (event.data.state === WorkerState.Error) {
        if ( state !== MainState.AwaitingDict )
          console.warn(`Unexpected worker state ${WorkerState[event.data.state]} in state ${MainState[state]}`)
        // error, display the corresponding message box
        error_log.innerText = navigator.userAgent + '\n' + GIT_ID + '\n' + event.data.error
        dict_load_fail.classList.remove('d-none')
        dict_status.innerText = 'Dictionary load failure! See error message above.'
        updateState(MainState.Error)
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
        timerId = window.setTimeout(() => updateState(MainState.Error), SEARCH_TIMEOUT_MS)
      } //else console.warn(`Unexpected search progress in state ${MainState[state]}`)
    }
    // -------------------------{ dict-upd }-------------------------
    else if ( event.data.type === 'dict-upd' ) {
      // we received the information that the dictionary was asynchronously updated
      // since all we're doing is updating some texts, it doesn't matter what state we're in
      dictLinesLen = event.data.dictLinesLen
      if (event.data.status === 'loading')
        dict_upd_status.innerText = '(Updating in background...)'
      else {
        dict_upd_status.innerText = ''
        if (event.data.status === 'done')
          dict_status.innerText = `Dictionary holds ${dictLinesLen} entries (updated in background).`
      }
    }
    // -------------------------{ results }-------------------------
    else if ( event.data.type === 'results' ) {
      // we got some search results
      if ( state === MainState.Searching ) {
        window.clearTimeout(timerId)
        gotSearchResults(event.data.whatPat, event.data.matches)
        updateState(MainState.Ready)
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
    if ( state === MainState.AwaitingDict && ++loadDictRetries<3 ) {
      timerId = window.setTimeout(timeoutHandler, INIT_TIMEOUT_MS)
      const m :MainMessageType = { type: 'status-req' }
      worker.postMessage(m)
    } else {
      error_log.innerText = navigator.userAgent + '\n' + GIT_ID + '\n' + 'Timed out waiting for response from worker.'
      updateState(MainState.Error)
    }
  }
  updateState(MainState.AwaitingDict)
  timerId = window.setTimeout(timeoutHandler, INIT_TIMEOUT_MS)
  const m :MainMessageType = { type: 'status-req' }
  worker.postMessage(m)
})
