
import escapeStringRegexp from 'escape-string-regexp'
import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst} from '../src/common'

if (module.hot) module.hot.accept()  // for parcel dev env

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw/sw.ts', import.meta.url), {type: 'module'}).then(
    (registration) => console.debug('SW register ok', registration),
    (error) => console.error('Service Worker registration failed', error),
  )
} else console.warn('Service Workers are not supported')

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
    scoredMatches.slice(0, MAX_RESULTS).forEach((scoredMatch) => {
      const trans = scoredMatch[0].split(/::/)
      if (trans.length!=2)
        throw new Error(`unexpected database format on line "${scoredMatch[0]}"`)
      const des = (trans[0] as string).split(/\|/)
      const ens = (trans[1] as string).split(/\|/)
      if (des.length!=ens.length)
        throw new Error(`unexpected database format on line "${scoredMatch[0]}"`)
      //TODO: feedback mailto links
      const tr = document.createElement('tr')
      const td0 = document.createElement('td')
      const td1 = document.createElement('td')
      des.map((de, i) => {
        //TODO Later: if a line wraps, the following pairs will no longer be aligned
        const en = ens[i] as string
        const div0 = document.createElement('div')
        if (i) div0.classList.add('sub-result')
        div0.innerText = de.trim()
        div0.innerHTML = div0.innerHTML.replaceAll(whatRe, '<strong>$&</strong>')
        td0.appendChild(div0)
        const div1 = document.createElement('div')
        if (i) div1.classList.add('sub-result')
        div1.innerText = en.trim()
        div1.innerHTML = div1.innerHTML.replaceAll(whatRe, '<strong>$&</strong>')
        td1.appendChild(div1)
      })
      tr.appendChild(td0)
      tr.appendChild(td1)
      newChildren.push(tr)
    })
    if (!scoredMatches.length) {
      result_count.innerText = `No matches found (dictionary holds ${dictLines.length} entries).`
      newChildren.push(no_results.cloneNode(true) as HTMLElement)
    }
    else if (newChildren.length!=scoredMatches.length)
      result_count.innerText = `Found ${scoredMatches.length} matches, showing the first ${newChildren.length}.`
    else
      result_count.innerText = `Showing all ${scoredMatches.length} matches.`
    result_rows.replaceChildren(...newChildren)
  }

  search_term.addEventListener('change', do_search)
  do_search()
})
