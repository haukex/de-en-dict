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

import {initPopups, addTitleTooltips, closeAllPopups} from './popups'
import {wrapTextNodeMatches, cleanSearchTerm} from './utils'
import {initInputFieldKeys} from './keyboard'
import {initScrollTop} from './scroll-top'
import {result2tbody} from './render'
import {searchDict} from './dict-search'
import {isMessage} from './types'
import {initFlags} from './flags'
import {loadDict} from './dict-load'
import {assert} from './utils'

if (module.hot) module.hot.accept()  // for the parcel development environment

const GIT_ID = '$Id$'

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module', scope: '/'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
  navigator.serviceWorker.addEventListener('message', event => console.debug('SW:', event.data))
} else console.warn('Service Workers are not supported')

/* Start loading the dictionary right away.
 * Note `dictLines` not being empty indicates the dictionary has loaded,
 * while `dictError` being a true value indicates there was an error loading the dictionary.
 * Also note that `loadDict()` may modify `dictLines` twice, see its documentation. */
const dictLines :string[] = []
let dictError :Error|unknown
let dictCallback :(()=>void)|null
loadDict(dictLines)
  .catch(error => dictError = error ? error : 'unknown error')
  .finally(() => { if (dictCallback) dictCallback() })

// when the HTML page has finished loading:
window.addEventListener('DOMContentLoaded', async () => {
  // get a few HTML elements from the page that we need
  const search_term = document.getElementById('search-term')
  const result_table = document.getElementById('result-table')
  const dict_status = document.getElementById('dict-status')
  const dict_upd_status = document.getElementById('dict-upd-status')
  const search_status = document.getElementById('search-status')
  const no_results = document.getElementById('no-results')
  const more_buttons = document.getElementById('more-buttons')
  const dict_prog_div = document.getElementById('dict-prog-div')
  const dict_progress = document.getElementById('dict-progress')
  assert( search_term instanceof HTMLInputElement && result_table && dict_status && dict_upd_status && search_status && no_results
    && more_buttons && dict_prog_div && dict_progress )
  const orig_title_text = document.title

  // utility function to clear the results table
  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach((elem) => elem.remove())
    // ensure all popups get hidden (apparently needed in some browsers?)
    closeAllPopups()
    // clear status
    search_status.innerText = ''
    more_buttons.replaceChildren()
  }

  // in doSearch below, we highlight the search term red for one character searches.
  // any user input in the field clears that:
  search_term.addEventListener('input', () => search_term.classList.remove('danger') )

  // this is our handler for running the search:
  let prevWhat = 'Something the user is really unlikely to enter on their own by chance, so after initialization the first search is always performed.'
  const doSearch = (raw_what: string, fromInputNotUrl :boolean) => {
    const what = cleanSearchTerm(raw_what)
    // updating the hash always forces a search:
    // (for example, this is important if the hash was changed during the dictionary load for some reason)
    if ( fromInputNotUrl && what===prevWhat ) return
    prevWhat = what

    if (what.length==1) {
      // NOTE initInputFieldKeys also removes 'danger'
      // one-letter search terms take too long and cause the app to hang, for now we simply refuse them
      search_term.classList.add('danger')
      return
    } else search_term.classList.remove('danger')

    // update page title with search term
    document.title = what.length ? `${orig_title_text}: ${what}` : orig_title_text
    if (fromInputNotUrl) {  // the term came from the input box, not hash, so update the hash
      const newHash = `#q=${encodeURIComponent(what)}`
      if ( window.location.hash !== newHash )
        window.history.pushState(null, '', newHash)
    }

    // actually run the search
    const [whatPat, matches] = searchDict(dictLines, what)

    clearResults()

    // there were no results
    if (!matches.length) {
      no_results.classList.remove('d-none')
      return
    }
    else no_results.classList.add('d-none')  // there are matches

    // function for rendering matches, which we set up here, then call below
    let displayedMatches = 0  // holds the state between invocations of this function:
    const renderMatches = (start :number, end :number) => {
      // loop over the chunk of lines to be displayed
      matches.slice(start, end).forEach((lineIndex) => {
        const matchLine = dictLines[lineIndex]
        assert(matchLine)
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
          addTitleTooltips(tbody.querySelectorAll('abbr'))
          displayedMatches++
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
        if ( matches.length-displayedMatches < 50 )
          make_btn_more(matches.length-displayedMatches)
        else {
          make_btn_more(50)
          if ( matches.length-displayedMatches < 200 )
            make_btn_more(matches.length-displayedMatches)
          else
            make_btn_more(200)
        }
      }
      else
        search_status.innerText = `Showing all ${matches.length} matches.`

    } // end of renderMatches

    // render the first chunk of results
    renderMatches(0, 50)

  } // end of do_search

  // Helper to run the search from the input field
  const searchFromInput = () => doSearch(search_term.value, true)

  // Install event listener for input field changes
  search_term.addEventListener('change', searchFromInput)

  // Starts a search using a value in the URL hash, if any
  const searchFromUrl = () => {
    // ?q=... overrides #q=... (see GitHub Issue #7: some links to the app use '?' instead of '#')
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
  // Install event listener for browser navigation updating the URL hash
  window.addEventListener('hashchange', searchFromUrl)

  // random entry link handler
  const rand_entry_link = document.getElementById('rand-entry-link')
  assert(rand_entry_link)
  rand_entry_link.addEventListener('click', event => {
    event.preventDefault()
    clearResults()
    if (!dictLines.length) return
    const randLine = dictLines[Math.floor(Math.random()*dictLines.length)]
    assert(randLine)
    const tbody = result2tbody(randLine)
    result_table.appendChild(tbody)
    addTitleTooltips(tbody.querySelectorAll('abbr'))
    search_status.innerText = 'Showing a random entry.'
  })

  // initialize various things
  initInputFieldKeys(search_term, searchFromInput)
  initScrollTop()
  initFlags()
  initPopups()

  // handle background progress updates from the dictionary loader
  dict_status.innerText = 'The dictionary is loading, please wait...'
  window.addEventListener('message', event => {
    // NOTE that messages may still arrive even after dictCallback!
    if (isMessage(event.data)) {
      if (event.data.type === 'dict-load') {
        dict_progress.setAttribute('value', event.data.percent.toString())
        dict_progress.setAttribute('max', '100')
        dict_progress.innerText = event.data.percent.toFixed(1)+'%'
        if (event.data.percent<100)
          dict_prog_div.classList.remove('d-none')
        else
          dict_prog_div.classList.add('d-none')
      }
      else if (event.data.type === 'dict-upd') {
        if (event.data.status === 'loading')
          dict_upd_status.innerText = '(Updating in background...)'
        else {
          dict_upd_status.innerText = ''
          if (event.data.status === 'done')
            dict_status.innerText = `Dictionary holds ${dictLines.length} entries (updated in background).`
        }
      }
    }
  })

  // what happens when the dictionary loads or a load error occurs:
  dictCallback = () => {
    if (dictLines.length) {
      dict_status.innerText = `Dictionary holds ${dictLines.length} entries.`
      search_term.removeAttribute('disabled')
      // Trigger a search upon loading (the input field was disabled until now)
      searchFromUrl()
      // Put the focus on the input field
      search_term.focus()
    }
    else {
      // error, display the corresponding message box
      const load_fail = document.getElementById('dict-load-fail')
      assert(load_fail)
      const error_log = document.getElementById('error-log')
      assert(error_log)
      error_log.innerText = navigator.userAgent + '\n' + GIT_ID + '\n' + ( dictError ? dictError : 'unknown error' )
      load_fail.classList.remove('d-none')
      dict_status.innerText = 'Dictionary load failure! See error message above.'
      dict_prog_div.classList.add('d-none')
    }
  }
  // call the callback immediately if the dict has already loaded by now
  if (dictLines.length || dictError) dictCallback()
})
