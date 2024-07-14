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

import escapeStringRegexp from 'escape-string-regexp'
import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst} from './common'
import {init_flags} from './flags'

// for the parcel development environment:
if (module.hot) module.hot.accept()

// register the Service Worker (if possible)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module'}).then(
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
      // these two replaces fix some oversights that I guess happened on conversion from CP1252 to UTF-8 (?)
      .replaceAll(String.fromCodePoint(0x92),'\u2019').replaceAll(String.fromCodePoint(0x96),'\u2013')
      // split the text into lines, trim the lines, remove blank lines and comments
      .split(/\r?\n|\r(?!\n)/g).map((line) => line.trim()).filter((line) => line.length && !line.startsWith('#'))
  } catch (error) {
    console.error(error)
    // our callers will see an empty response as an error:
    return []
  }
}

// when the HTML page has finished loading:
window.addEventListener('DOMContentLoaded', async () => {
  // get a few HTML elements from the page that we need
  const search_term = document.getElementById('search_term') as HTMLInputElement
  const result_rows = document.getElementById('result_rows') as HTMLElement
  const result_count = document.getElementById('result_count') as HTMLElement
  const load_fail = document.getElementById('dict-load-fail') as HTMLElement
  // the default HTML contains the "no results" table entry, we re-use that
  const no_results = (result_rows.children[0] as HTMLElement).cloneNode(true) as HTMLElement  // should be a tr

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

  // Starts a search using a value in the URL hash, if any
  const search_from_url = () => {
    let what = ''
    // ?q=... overrides #q=... (see GitHub Issue #7 for why)
    if ( window.location.search.length > 1 ) {
      const loc = new URL(''+window.location)
      loc.hash = '#' + loc.search.substring(1)
      loc.search = ''
      window.location.replace(loc)
    }
    // parse hash
    if (window.location.hash.startsWith('#q=')) {
      try {
        what = decodeURIComponent(window.location.hash.substring('#q='.length)).trim()
      }
      catch (error) {
        // for example, `decodeURIComponent('%97')` causes "URIError: malformed URI sequence"
        console.log('ignoring bad window.location.hash',error)
      }
    }
    search_term.value = what
    do_search(what)
  }

  // Updates the URL hash, if necessary, and runs a search when the input field changes
  const search_term_changed = () => {
    const what = search_term.value.trim()
    const newHash = `#q=${encodeURIComponent(what)}`
    if (window.location.hash !== newHash) {
      window.history.pushState(null, '', newHash)
    }
    do_search(what)
  }

  // this is our handler for running the search:
  const do_search = (what: string) => {
    // update page title with search term
    const titleSuffix = what ? `: ${what}` : ''
    document.title = TITLE_PREFIX + titleSuffix

    // escape special characters so it can be used in a regex
    const whatPat = escapeStringRegexp(what.replaceAll(/\s+/g, ' '))
    /* The following code generates a set of regular expressions used for scoring the matches.
     * For each regex that matches, one point is awarded. */
    const scoreRes :RegExp[] = [ '(?:^|::\\s*)', '(?:^|::\\s*|\\|\\s*)', '::\\s*to\\s+', '\\b' ]
      .map((re)=>re+whatPat)
      .flatMap((re)=>[re, re+'\\b', re+'(?:\\s*\\{[^}|]*\\}|\\s*\\[[^\\]|]*\\]|\\s*\\([^)]\\))*\\s*(?:$|\\||;)'])
      .flatMap((re)=>[new RegExp(re), new RegExp(re, 'i')])
    //console.debug(scoreRes)
    // generate a regex that matches the search term
    const whatRe = new RegExp(whatPat, 'ig')

    // generate a list of tuples of the match line and its score
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
    const searchEndRenderStartMs = new Date().getTime()
    console.debug(`Search for ${whatRe} found ${matches.length} matches in ${searchEndRenderStartMs-searchStartMs}ms.`)
    //console.debug(scoredMatches)

    // there were no results
    if (!matches.length) {
      result_count.innerText = `No matches found (dictionary holds ${dictLines.length} entries).`
      result_rows.replaceChildren(no_results.cloneNode(true) as HTMLElement)
      return
    }

    // function to add some formatting to result HTML
    const reformatHtml = (el :HTMLElement) => {
      el.innerHTML = el.innerHTML
        // highlight the search term in the match
        .replaceAll(whatRe, '<strong>$&</strong>')
        // we want to display annotations like `{f}` or `[...]` in different formatting
        .replaceAll(/\{[^}]+\}|\[[^\]]+\]/g, '<span class="annotation">$&</span>')
        // words in angle brackets are common misspellings or other cross-references that should be hidden from view
        .replaceAll(/&lt;.+?&gt;/g, '<span class="hidden">$&</span>')
    }

    // function for rendering matches
    let displayedMatches = 0
    const renderMatches = (start :number, end :number) => {
      matches.slice(start, end).forEach((lineIndex, mi) => {
        const matchLine = dictLines[lineIndex]
        if (!matchLine)
          throw new Error(`internal error: bad lineIndex ${lineIndex}, dictLines.length=${dictLines.length}`)

        // split the dictionary lines into "German :: English"
        const trans = matchLine.split(/::/)
        if (trans.length!=2) {
          console.error('unexpected database format on line', matchLine)
          return
        }
        // split each entry on "|"s, should have the same number of entries on each side
        const des = (trans[0] as string).split(/\|/)
        const ens = (trans[1] as string).split(/\|/)
        if (des.length!=ens.length) {
          console.error('unexpected database format on line', matchLine)
          return
        }

        // function for generating the feedback link HTML
        const makeFeedbackThing = () => {
          const fbIcon = document.createElement('div')
          fbIcon.classList.add('feedback-thing')
          const fbLink = document.createElement('a')
          fbLink.setAttribute('title', 'Send Feedback Email')
          // generate "mailto:" link with predefined subject and body
          fbLink.setAttribute('href', FEEDBACK_URL
            +'?subject='+encodeURIComponent(FEEDBACK_SUBJECT)
            +'&body='+encodeURIComponent(FEEDBACK_BODY.replace('$LINE', matchLine)))
          fbLink.innerText = '✉️'
          fbIcon.appendChild(fbLink)
          return fbIcon
        }

        // generate the HTML for each (sub-)result
        des.forEach((de, i) => {
          // generate the <tr> with the two <td> children
          const tr = document.createElement('tr');
          [de, ens[i] as string].forEach((ent) => {
            const td = document.createElement('td')
            td.innerText = ent.trim()
            reformatHtml(td)
            tr.appendChild(td)
          })
          // Add a few classes used for styling the table
          if (i) tr.classList.add('sub-result')
          else tr.classList.add('first-result')
          if (mi%2) tr.classList.add('odd-result')
          // the "feedback" button on each result
          if (!i && ENABLE_FEEDBACK)
            // prepend to the right <td> (<div> is floated right)
            tr.lastElementChild?.prepend(makeFeedbackThing())
          result_rows.appendChild(tr)
        }) // end of loop over each (sub-)result
        result_rows.lastElementChild?.classList.add('last-subresult')

        displayedMatches++
      }) // end of loop over this chunk of results

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

    // next, we build the HTML
    result_rows.replaceChildren()

    // show the first chunk of results
    renderMatches(0, RESULT_CHUNK_SZ)

    const renderEndMs = new Date().getTime()
    // Testing shows that searching takes way more time than rendering.
    console.debug(`Rendering took ${renderEndMs-searchEndRenderStartMs}ms.`)
  } // end of do_search

  // Install event listener for input field changes
  search_term.addEventListener('change', search_term_changed)

  // Install event listener for browser navigation updating the URL hash
  window.addEventListener('hashchange', search_from_url)

  // Trigger a search upon loading
  search_from_url()

  // Put the focus on the input field
  search_term.focus()

  // set up flag animations
  try { init_flags() }
  // but don't let bugs blow us up
  catch (error) { console.error(error) }
})
