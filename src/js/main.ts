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
import {globalErrorLogString} from './global'
import {initInputFieldKeys} from './keyboard'
import {initScrollTop} from './scroll-top'
import {result2tbody} from './render'
import {searchDict} from './dict-search'
import {initFlags} from './flags'
import {loadDict} from './dict-load'
import {assert} from './utils'

if (module.hot) module.hot.accept()  // for the parcel development environment

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module', scope: '/'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
  navigator.serviceWorker.addEventListener('message', event => console.debug('SW:', event.data))
} else console.warn('Service Workers are not supported')

// when the HTML page has finished loading:
window.addEventListener('DOMContentLoaded', async () => {
  // get a few HTML elements from the page that we need
  const search_term = document.getElementById('search-term')
  const result_table = document.getElementById('result-table')
  const result_count = document.getElementById('result-count')
  const no_results = document.getElementById('no-results')
  const title_el = document.querySelector('title')
  assert( search_term instanceof HTMLInputElement && result_table && result_count && no_results && title_el )
  const title_text = title_el.innerText

  // load the dictionary, disabling the input field while we do so
  search_term.setAttribute('disabled', 'disabled')
  const dictLines = await loadDict()
  if (!dictLines.length) {
    // error, display the corresponding message box
    const load_fail = document.getElementById('dict-load-fail')
    assert(load_fail)
    const error_log = document.getElementById('error-log')
    assert(error_log)
    error_log.innerText = navigator.userAgent
      +'\n$Id$\n'
      +globalErrorLogString()
    load_fail.classList.remove('d-none')
    return
  }
  console.debug(`Loaded ${dictLines.length} dictionary lines`)
  search_term.removeAttribute('disabled')

  // utility function to clear the results table
  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach((elem) => elem.remove())
    // ensure all popups get hidden (apparently needed in some browsers?)
    closeAllPopups()
  }

  // in doSearch below, we highlight the search term red for one character searches.
  // any user input in the field clears that:
  search_term.addEventListener('input', () => search_term.classList.remove('danger') )

  // this is our handler for running the search:
  // IMPORTANT: we expect callers to have done cleanSearchTerm(what)
  const doSearch = (what: string) => {
    if (what.length==1) {
      // NOTE initInputFieldKeys also removes 'danger'
      // one-letter search terms take too long and cause the app to hang, for now we simply refuse them
      search_term.classList.add('danger')
      return
    } else search_term.classList.remove('danger')

    // update page title with search term
    document.title = what.length ? `${title_text}: ${what}` : title_text

    // actually run the search
    const [whatPat, matches] = searchDict(dictLines, what)

    clearResults()

    // there were no results
    if (!matches.length) {
      result_count.innerText = 'No matches found (' + ( dictLines.length
        ? `dictionary holds ${dictLines.length} entries).` : 'dictionary has not loaded).' )
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
      // update the text below the search box
      if (displayedMatches<matches.length) {
        result_count.innerText = `Found ${matches.length} matches, showing the first ${displayedMatches}.`
        // we haven't shown all results, make buttons to show more
        const make_btn_more = (howMany :number) => {
          const btn_more = document.createElement('button')
          btn_more.classList.add('btn-more')
          btn_more.innerText = `Show ${howMany} More`
          btn_more.addEventListener('click', () => renderMatches(end, end+howMany) )
          result_count.appendChild(btn_more)
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
        result_count.innerText = `Showing all ${matches.length} matches.`
    } // end of renderMatches

    // render the first chunk of results
    renderMatches(0, 50)

  } // end of do_search

  // Updates the URL hash, if necessary, and runs a search when the input field changes
  let prevWhat = 'Something the user is really unlikely to enter on their own by chance, so after initialization the first search is always performed.'
  const searchTermMaybeChanged = () => {
    const what = cleanSearchTerm( search_term.value )
    if ( what==prevWhat ) return
    prevWhat = what
    const newHash = `#q=${encodeURIComponent(what)}`
    if ( window.location.hash !== newHash )
      window.history.pushState(null, '', newHash)
    doSearch(what)
  }
  // Install event listener for input field changes
  search_term.addEventListener('change', searchTermMaybeChanged)

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
    doSearch(what)
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
  })

  // initialize various things
  initInputFieldKeys(search_term, searchTermMaybeChanged)
  initScrollTop()
  initFlags()
  initPopups()

  // Trigger a search upon loading
  searchFromUrl()

  // Put the focus on the input field
  search_term.focus()
})
