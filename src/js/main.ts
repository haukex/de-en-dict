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

import {initFlags} from './flags'
import {makeSearchPattern} from './equiv'
import {initPopups, addTitleTooltips, closeAllPopups} from './popups'
import {loadDict} from './dict-load'
import {wrapTextNodeMatches, cleanSearchTerm} from './utils'
import {result2tbody} from './render'

// for the parcel development environment:
if (module.hot) module.hot.accept()

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module', scope: '/'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
  navigator.serviceWorker.addEventListener('message', event => console.debug('SW:', event.data))
} else console.warn('Service Workers are not supported')

// a couple of user-settable variables
const TITLE_PREFIX = 'German-English Dictionary'

// when the HTML page has finished loading:
window.addEventListener('DOMContentLoaded', async () => {
  // get a few HTML elements from the page that we need
  const search_term = document.getElementById('search-term') as HTMLInputElement
  const result_table = document.getElementById('result-table') as HTMLElement
  const result_count = document.getElementById('result-count') as HTMLElement
  const load_fail = document.getElementById('dict-load-fail') as HTMLElement
  const no_results = document.getElementById('no-results') as HTMLElement
  const rand_entry_link = document.getElementById('rand-entry-link') as HTMLElement

  // load the dictionary, disabling the input field while we do so
  search_term.setAttribute('disabled', 'disabled')
  const dictLines = await loadDict()
  if (!dictLines.length) {
    // error, display the corresponding message box
    load_fail.classList.remove('d-none')
    return
  }
  console.debug(`Loaded ${dictLines.length} dictionary lines`)
  search_term.removeAttribute('disabled')

  // set up flag animations and popups
  try {
    initFlags()
    initPopups()
  }
  // but don't let bugs blow us up
  catch (error) { console.error(error) }

  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach((elem) => elem.remove())
    // ensure all popups get hidden (apparently needed in some browsers?)
    closeAllPopups()
  }

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
        console.log('ignoring bad window.location.hash',error)
      }
    }
    search_term.value = what
    doSearch(what)
  }

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

  // this is our handler for running the search:
  const doSearch = (what: string) => {
    // we expect our callers to have done cleanSearchTerm(what)
    if (what.length==1) {
      // one-letter search terms take too long and cause the app to hang, for now we simply refuse them
      search_term.classList.add('danger')
      return
    } else search_term.classList.remove('danger')

    // update page title with search term
    document.title = what ? `${TITLE_PREFIX}: ${what}` : TITLE_PREFIX

    // turn the search term into a regex
    // NOTE `whatPat` must not contain anchors or capturing groups, for use in `wrapTextNodeMatches`
    const [whatPatStricter, whatPat] = makeSearchPattern(what)
    // compile the regex that matches the search term
    const whatRe = new RegExp(whatPat, 'ig')

    /* The following code generates a set of regular expressions used for scoring the matches.
     * For each regex that matches, one point is awarded. */
    const scoreRes :RegExp[] = [ '(?:^|::\\s*)', '(?:^|::\\s*|\\|\\s*)', '::\\s*to\\s+', '\\b' ]
      .flatMap((re)=>[re+whatPat, re+whatPatStricter])
      .flatMap((re)=>[re, re+'\\b', re+'(?:\\s*\\{[^}|]*\\}|\\s*\\[[^\\]|]*\\]|\\s*\\([^)]\\))*\\s*(?:$|\\||;)'])
      .flatMap((re)=>[new RegExp(re), new RegExp(re, 'i')])
    //console.debug(scoreRes)

    // this code performs the search
    const searchStartMs = new Date().getTime()
    // the `matches` array stores indices into the `dictLines` array for each matching line
    const matches :number[] = (() => {
      // if the search term is empty, don't produce any results
      if (!what.length) return []
      // build an array of tuples, each element being the matching line's index and its score
      const scoredMatches :[number,number][] = (
        // apply the regex to each dictionary line, returning the line's index if it matches
        dictLines.flatMap((line, i) => line.match(whatRe) ? [i] : [])
          // for each match, store the line's index...
          .map(li => [li,
            // ... and match it against each scoring regex, giving one point per match, and summing the scores
            scoreRes.map((re):number=>dictLines[li]?.match(re)?1:0).reduce((a,b)=>a+b,0) ]) )
      // sort the scored matches (note sort should be stable in modern JS)
      scoredMatches.sort((a,b) => b[1]-a[1])
      // now that we've sorted, we can strip the scores out of the returned values
      return scoredMatches.map(([li, _score]) => li)
    })()
    console.debug(`Search for ${whatRe} found ${matches.length} matches in ${new Date().getTime()-searchStartMs}ms.`)
    //console.debug(scoredMatches)

    clearResults()

    // there were no results
    if (!matches.length) {
      result_count.innerText = `No matches found (dictionary holds ${dictLines.length} entries).`
      no_results.classList.remove('d-none')
      return
    }
    // otherwise, there were matches
    else no_results.classList.add('d-none')

    // function for rendering matches, which we set up here, then call below
    let displayedMatches = 0  // holds the state between invocations of this function:
    const renderMatches = (start :number, end :number) => {
      // loop over the chunk of lines to be displayed
      matches.slice(start, end).forEach((lineIndex) => {
        const matchLine = dictLines[lineIndex]
        if (!matchLine)
          throw new Error(`internal error: bad lineIndex ${lineIndex}, dictLines.length=${dictLines.length}`)
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

  // Install event listener for input field changes
  search_term.addEventListener('change', searchTermMaybeChanged)

  // Install event listener for browser navigation updating the URL hash
  window.addEventListener('hashchange', searchFromUrl)

  // Trigger a search upon loading
  searchFromUrl()

  // random entry link handler
  rand_entry_link.addEventListener('click', event => {
    event.preventDefault()
    clearResults()
    const tbody = result2tbody( dictLines[Math.floor(Math.random()*dictLines.length)] as string )
    result_table.appendChild(tbody)
    addTitleTooltips(tbody.querySelectorAll('abbr'))
  })

  search_term.addEventListener('keyup', event => {
    // Escape key clears input
    if (event.key=='Escape')
      search_term.value = ''
    else if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
      searchTermMaybeChanged()
    }
  })
  /* 'Enter' is handled in keyup above, but we still need to prevent all of its default
   * behavior here so it doesn't fire the "change" event and cause the search to run twice. */
  search_term.addEventListener('keydown', event => {
    if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
    }
  })
  // keypress is deprecated, we'll include it anyway for now
  search_term.addEventListener('keypress', event => {
    if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
    }
  })

  // "scroll to top" button
  const btnScrollTop = document.createElement('button')
  btnScrollTop.setAttribute('id','btn-scroll-top')
  btnScrollTop.innerText = 'Top ↑'
  btnScrollTop.addEventListener('click', () => window.scrollTo(0,0) )
  //const searchBoxTop = search_term.getBoundingClientRect().y  // changes based on layout, I'll just use a fixed value
  const updateScrollBtnVis = () => {
    if ( window.scrollY > 60 )
      btnScrollTop.classList.remove('d-none')
    else
      btnScrollTop.classList.add('d-none')
  }
  window.addEventListener('scroll', updateScrollBtnVis)
  document.querySelector('main')?.appendChild(btnScrollTop)
  updateScrollBtnVis()

  // Put the focus on the input field
  search_term.focus()
})
