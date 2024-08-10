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

import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst, cleanSearchTerm} from './common'
import {init_flags} from './flags'
import {makeSearchPattern} from './equiv'
import {initPopup} from './popup'

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
const FEEDBACK_URL = 'mailto:beolingus@tu-chemnitz.de'  // as requested by Frank Richter
const FEEDBACK_SUBJECT = 'De-En Word List Suggestion'
const FEEDBACK_BODY = 'Hello, Hallo,\n\n'
    +'I would like to make a suggestion about the following dictionary entry. [Please do not edit the following entry!]\n'
    +'Ich möchte einen Vorschlag zu dem folgenden Wörterbucheintrag machen. [Bitte den folgenden Eintrag nicht bearbeiten!]\n'
    +'\n$LINE\n'  // the code below replaces this with the dictionary line
    +'\nMy suggestion is:\nMein Vorschlag ist:\n'
const ENABLE_FEEDBACK = true
const RESULT_CHUNK_SZ = 50
const TITLE_PREFIX = 'German-English Dictionary'

// this function decodes a stream of bytes (Response body) first as a gzip stream, then as UTF-8 text
async function gunzipUTF8(stream :ReadableStream) {
  const reader = stream.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream('UTF-8')).getReader()
  if (!reader) throw new Error('Failed to get reader')
  // join the chunks provided by the reader
  let result = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    result += value
  }
  console.debug(`Decompressed ${result.length} chars`)
  return result
}

// this function does all the handling of the dictionary loading
async function loadDict() :Promise<string[]> {
  /* First, we need to determine whether the dictionary version on the server has changed,
   * we do this by fetching a relatively small file and seeing if it has changed. */
  let dictNeedsUpdate = false
  try {
    // get the small text file from the network
    const dictVerResp = await fetch(DB_VER_URL)
    if (dictVerResp.ok) {
      // need to save a clone of the response for the cache (body can only be read once per Response)
      const dictVerRespClone = dictVerResp.clone()
      // get the content of the text file
      const dictVerRespData = await dictVerResp.text()
      // next, check if we have a copy of the file in the cache
      const cache = await caches.open(DB_CACHE_NAME)
      const dictVerCache = await cache.match(DB_VER_URL)
      if (dictVerCache) {
        // we have a copy of the file in the cache, so get its contents
        const dictVerCacheData = await dictVerCache.text()
        //console.debug('The cached version data vs current version data', dictVerCacheData, dictVerRespData)
        // and then compare whether the two files are the same
        if (dictVerCacheData === dictVerRespData)
          console.debug('The dict version information has not changed.')
        else {
          // if the file on the server has changed, the dictionary needs to be updated too
          console.debug('The dict version information has changed.')
          dictNeedsUpdate = true
        }
      }
      /* Otherwise, we don't have a copy of the file in the cache, which probably means that
       * the cache is empty, meaning that the dictionary will have to be fetched anyway.
       * But it could also indicate an inconsistent state of the cache, so it makes sense to explicitly fetch. */
      else {
        console.debug('The dict version information is not in our cache.')
        dictNeedsUpdate = true
      }
      cache.put(DB_VER_URL, dictVerRespClone)
    }
    else
      // we couldn't get the file, which isn't a big problem, we'll try again next time
      // the same applies if an error occurs:
      console.debug('Failed to get dict version information.', dictVerResp)
  } catch (error) {
    console.log('Failed to get dict version information.', error)
  }
  // next, fetch the dictionary
  try {
    const dbReq = new Request(DB_URL)
    // if above we determined the dictionary needs an update, delete it from the cache
    if (dictNeedsUpdate) {
      console.debug('The dictionary needs an update, deleting it from cache.')
      const cache = await caches.open(DB_CACHE_NAME)
      await cache.delete(dbReq)
    } else console.debug('The dictionary does not appear to need an update.')
    // load the dictionary from the cache or the network
    const dictResp = await cacheFirst(caches, DB_CACHE_NAME, dbReq)
    if ( !dictResp.ok || !dictResp.body )
      throw new Error('Failed to load dict')
    // unpack the dictionary file
    return (await gunzipUTF8(dictResp.body))
      // this fixes an oversight that I guess happened on conversion from CP1252 to UTF-8 (?)
      .replaceAll(String.fromCodePoint(0x96),'\u2013')
      // split the text into lines, trim the lines, remove blank lines and comments
      .split(/\r?\n|\r(?!\n)/g).map((line) => line.trim()).filter((line) => line.length && !line.startsWith('#'))
  } catch (error) {
    console.error(error)
    // our callers will see an empty response as an error:
    return []
  }
}

// function to turn a dictionary line into a rendered <tbody>
function result2tbody (dictLine :string) {
  // split the dictionary lines into "German :: English"
  const trans = dictLine.split(/::/)
  if (trans.length!=2)
    throw new Error(`unexpected database format on line ${dictLine}`)
  // split each entry on "|"s, should have the same number of entries on each side
  const des = (trans[0] as string).split(/\|/)
  const ens = (trans[1] as string).split(/\|/)
  if (des.length!=ens.length)
    throw new Error(`unexpected database format on line ${dictLine}`)

  // generate "mailto:" link with predefined subject and body (used below)
  const fbHref = FEEDBACK_URL
    + '?subject=' + encodeURIComponent(FEEDBACK_SUBJECT)
    + '&body=' + encodeURIComponent(FEEDBACK_BODY.replace('$LINE', dictLine))

  // function for generating the feedback link HTML
  const fbIcon = document.createElement('div')
  fbIcon.classList.add('feedback-thing')
  const fbLink = document.createElement('a')
  fbLink.setAttribute('title', 'Send Feedback Email')
  fbLink.setAttribute('href', fbHref)
  fbLink.innerText = '✉️'
  fbIcon.appendChild(fbLink)

  // each result is contained in a <tbody>
  const tbody = document.createElement('tbody')
  tbody.classList.add('result')
  tbody.setAttribute('data-feedback-href', fbHref)  // for later use by the popup code

  // generate the HTML for each (sub-)result
  des.forEach((de, i) => {
    // generate the <tr> with the two <td> children
    const tr = document.createElement('tr');
    [de, ens[i] as string].forEach((ent) => {
      const td = document.createElement('td')
      td.innerText = ent.trim()
      // add HTML markup to annotations
      td.innerHTML = td.innerHTML
        // we want to display annotations like `{f}` or `[...]` in different formatting
        .replaceAll(/\{[^}]+\}|\[[^\]]+\]/g, '<span class="annotation">$&</span>')
        // words in angle brackets are common misspellings or other cross-references that should be hidden from view
        .replaceAll(/&lt;.+?&gt;/g, '<span class="hidden">$&</span>')
      tr.appendChild(td)
    })
    // add the "feedback" button to the first <tr>
    if (!i && ENABLE_FEEDBACK)
      // prepend to the right <td> (<div> is floated right)
      tr.lastElementChild?.prepend(fbIcon)
    tbody.appendChild(tr)
  }) // end of loop over each (sub-)result
  return tbody
}

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

  // set up flag animations and selection popup handler
  let doHidePopup :()=>void
  try {
    init_flags()
    doHidePopup = initPopup()
  }
  // but don't let bugs blow us up
  catch (error) { console.error(error) }

  const clearResults = () => {
    // remove all existing results
    document.querySelectorAll('tbody.result').forEach((elem) => elem.remove())
    // ensure the popup gets hidden (apparently needed in some browsers?)
    if (doHidePopup) doHidePopup()
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
            // don't do highlighting if we'd potentially touch HTML characters
            // (This is overgeneralized; in theory it'd still be possible to highlight matches that
            // contain HTML special chars, but at the moment that's more effort than it's worth.)
            if ( what.search(/[&<>]/)<0 )
              td.innerHTML = td.innerHTML.replaceAll(whatRe, '<strong>$&</strong>')
          })
          result_table.appendChild(tbody)
          displayedMatches++
        }
        catch (error) { console.error(error) }
      })
      // update the text below the search box
      if (displayedMatches<matches.length) {
        result_count.innerText = `Found ${matches.length} matches, showing the first ${displayedMatches}.`
        // we haven't shown all results, show a button to load more
        const btn_more = document.createElement('button')
        btn_more.classList.add('btn-more')
        btn_more.innerText = 'Show More'
        btn_more.addEventListener('click', () => {
          renderMatches(end, end+RESULT_CHUNK_SZ)
        })
        result_count.appendChild(btn_more)
      }
      else
        result_count.innerText = `Showing all ${matches.length} matches.`
    } // end of renderMatches

    // render the first chunk of results
    renderMatches(0, RESULT_CHUNK_SZ)

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
    result_table.appendChild( result2tbody( dictLines[Math.floor(Math.random()*dictLines.length)] as string ) )
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
  search_term.addEventListener('keypress', event => {
    if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
    }
  })

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
