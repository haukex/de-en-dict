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
import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst} from '../src/common'

if (module.hot) module.hot.accept()  // for parcel dev env

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
} else console.warn('Service Workers are not supported')

const FEEDBACK_URL = 'mailto:frank.richter@hrz.tu-chemnitz.de'
const FEEDBACK_SUBJECT = 'De-En Word List Suggestion'
const ENABLE_FEEDBACK = false
const MAX_RESULTS = 200

async function gunzipUTF8(stream :ReadableStream) {
  const reader = stream.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream('UTF-8')).getReader()
  if (!reader) throw new Error('Failed to get reader')
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

async function loadDict() :Promise<string[]> {
  let dictNeedsUpdate = false
  try {
    const dictVerResp = await fetch(DB_VER_URL)
    if (dictVerResp.ok) {
      const dictVerRespClone = dictVerResp.clone()
      const dictVerRespData = await dictVerResp.text()
      const cache = await caches.open(DB_CACHE_NAME)
      const dictVerCache = await cache.match(DB_CACHE_NAME)
      if (dictVerCache) {
        const dictVerCacheData = await dictVerCache.text()
        console.debug('The cached version data vs current version data', dictVerCacheData, dictVerRespData)
        if (dictVerCacheData !== dictVerRespData)
          dictNeedsUpdate = true
      } else dictNeedsUpdate = true
      cache.put(DB_CACHE_NAME, dictVerRespClone)
    }
  } catch (error) {
    console.log('Failed to get dict version info', error)
  }
  try {
    const dbReq = new Request(DB_URL)
    if (dictNeedsUpdate) {
      console.debug('The dictionary needs an update, deleting it from cache.')
      const cache = await caches.open(DB_CACHE_NAME)
      await cache.delete(dbReq)
    } else console.debug('The dictionary does not appear to need an update.')
    const dictResp = await cacheFirst(caches, DB_CACHE_NAME, dbReq)
    if ( !dictResp.ok || !dictResp.body )
      throw new Error('Failed to load dict')
    return (await gunzipUTF8(dictResp.body))
      // these two replaces fix some oversights that I guess happened on conversion from CP1252 to UTF-8 (?)
      .replaceAll(String.fromCodePoint(0x92),'\u2019').replaceAll(String.fromCodePoint(0x96),'\u2013')
      .split(/\r?\n|\r(?!\n)/g).map((line) => line.trim()).filter((line) => line.length && !line.startsWith('#'))
  } catch (error) {
    console.error(error)
    return []
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const search_term = document.getElementById('search_term') as HTMLInputElement
  const result_rows = document.getElementById('result_rows') as HTMLElement
  const result_count = document.getElementById('result_count') as HTMLElement
  const load_fail = document.getElementById('dict-load-fail') as HTMLElement
  const no_results = (result_rows.children[0] as HTMLElement).cloneNode(true) as HTMLElement  // should be a tr

  search_term.setAttribute('disabled', 'disabled')
  const dictLines = await loadDict()
  if (!dictLines.length) {
    load_fail.classList.remove('d-none')
    return
  }
  console.debug(`Loaded ${dictLines.length} dictionary lines`)
  search_term.removeAttribute('disabled')

  const do_search = () => {
    const whatPat = escapeStringRegexp(search_term.value.trim().replaceAll(/\s+/g,' '))
    //TODO: more code comments
    const scoreRes :RegExp[] = [ '(?:^|::\\s*)', '(?:^|::\\s*|\\|\\s*)', '::\\s*to\\s+', '\\b' ]
      .map((re)=>re+whatPat)
      .flatMap((re)=>[re, re+'\\b', re+'(?:\\s*\\{[^}|]*\\}|\\s*\\[[^\\]|]*\\]|\\s*\\([^)]\\))*\\s*(?:$|\\||;)'])
      .flatMap((re)=>[new RegExp(re), new RegExp(re, 'i')])
    //console.debug(scoreRes)
    const whatRe = new RegExp(whatPat, 'ig')
    const scoredMatches :[string,number][] = (
      search_term.value.trim().length ? dictLines.filter((line) => line.match(whatRe)) : [] )
      .map((matchedLine) => [matchedLine, scoreRes.map((re):number=>matchedLine.match(re)?1:0).reduce((a,b)=>a+b,0) ])
    scoredMatches.sort((a,b) => b[1]-a[1])  // should be stable in modern JS
    //console.debug(scoredMatches)
    const newChildren :HTMLElement[] = []
    let displayedMatches = 0
    scoredMatches.slice(0, MAX_RESULTS).forEach((scoredMatch, mi) => {
      const trans = scoredMatch[0].split(/::/)
      if (trans.length!=2)
        throw new Error(`unexpected database format on line "${scoredMatch[0]}"`)
      const des = (trans[0] as string).split(/\|/)
      const ens = (trans[1] as string).split(/\|/)
      if (des.length!=ens.length)
        throw new Error(`unexpected database format on line "${scoredMatch[0]}"`)
      des.map((de, i) => {
        const en = ens[i] as string
        const tr = document.createElement('tr')
        if (i) tr.classList.add('sub-result')
        else tr.classList.add('first-result')
        if (mi%2) tr.classList.add('odd-result')
        const td0 = document.createElement('td')
        td0.innerText = de.trim()
        td0.innerHTML = td0.innerHTML.replaceAll(whatRe, '<strong>$&</strong>')
        tr.appendChild(td0)
        const td1 = document.createElement('td')
        td1.innerText = en.trim()
        td1.innerHTML = td1.innerHTML.replaceAll(whatRe, '<strong>$&</strong>')
        if (!i && ENABLE_FEEDBACK) {
          const fbIcon = document.createElement('div')
          fbIcon.classList.add('feedback-thing')
          const fbLink = document.createElement('a')
          fbLink.setAttribute('title', 'Send Feedback Email')
          fbLink.setAttribute('href', FEEDBACK_URL
            +'?subject='+encodeURIComponent(FEEDBACK_SUBJECT)
            +'&body='+encodeURIComponent('Hello,\n\n'
            +'I would like to make a suggestion about the following dictionary entry. [Please do not edit the following entry!]\n'
            +'Ich möchte einen Vorschlag zu dem folgenden Wörterbucheintrag machen. [Bitte den folgenden Eintrag nicht bearbeiten!]\n\n'
            +scoredMatch[0]+'\n\nMy suggestion is:\nMein Vorschlag ist:\n'))
          fbLink.innerText = '✉️'
          fbIcon.appendChild(fbLink)
          td1.prepend(fbIcon)
        }
        tr.appendChild(td1)
        newChildren.push(tr)
      })
      newChildren.at(-1)?.classList.add('last-subresult')
      displayedMatches++
    })
    if (!scoredMatches.length) {
      result_count.innerText = `No matches found (dictionary holds ${dictLines.length} entries).`
      newChildren.push(no_results.cloneNode(true) as HTMLElement)
    }
    else if (displayedMatches!=scoredMatches.length)
      result_count.innerText = `Found ${scoredMatches.length} matches, showing the first ${displayedMatches}.`
    else
      result_count.innerText = `Showing all ${scoredMatches.length} matches.`
    result_rows.replaceChildren(...newChildren)
  }

  search_term.addEventListener('change', do_search)
  do_search()
})
