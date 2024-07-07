
if (module.hot) module.hot.accept()  // for parcel dev env

const MAX_RESULTS = 200

//TODO: make the whole app work offline with a service worker
// https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Service_workers

async function loadDict() {
  //const URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt'
  const URL = 'https://bl0.zero-g.net/db/de-en.txt'
  const CACHE_NAME = 'Blict'
  try {
    const cachedResponse = await window.caches.match(URL)
    if (cachedResponse) {
      console.debug('Cache hit on '+URL)
      return cachedResponse
    }
    console.log('Cache miss on '+URL)
    const networkResponse = await fetch(URL)
    if (networkResponse.ok) {
      console.debug('Cache store '+URL)
      const cache = await window.caches.open(CACHE_NAME)
      cache.put(URL, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    console.error(error)
    return Response.error()
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const search_term = document.getElementById('search_term') as HTMLInputElement
  const result_rows = document.getElementById('result_rows') as HTMLElement
  const result_count = document.getElementById('result_count') as HTMLElement
  const load_fail = document.getElementById('dict-load-fail') as HTMLElement
  const no_results = result_rows.children[0] as HTMLElement  // should be a tr

  const dictResp = await loadDict()
  if ( !dictResp || !dictResp.ok ) {
    load_fail.classList.remove('d-none')
    throw new Error('Could not load dictionary.')
  }

  // these two replaces fix some oversights that I guess happened on conversion from CP1252 to UTF-8 (?)
  const dictLines = (await dictResp.text()).replaceAll('\u0092','\u2019').replaceAll('\u0096','\u2013')
    .split(/\r?\n|\r(?!\n)/g).map((line) => line.trim()).filter((line) => line.length && !line.startsWith('#'))

  const do_search = () => {
    const what = search_term.value.trim().toLowerCase()
    result_rows.replaceChildren()
    let displayCount = 0
    //TODO: sort matches; prioritize matches at beginning of word
    const matches = what.length ? dictLines.filter((line) => line.toLowerCase().includes(what)) : []
    matches.slice(0,MAX_RESULTS).forEach((match) => {
      displayCount++
      const trans = match.split(/::/, 2)
      const des = (trans[0] as string).split(/\|/)
      const ens = (trans[1] as string).split(/\|/)
      //TODO: make results look better: group related results, highlight search term, ...
      const tr = document.createElement('tr')
      const td0 = document.createElement('td')
      const td1 = document.createElement('td')
      des.map((de, i) => {  // assume same length
        const en = ens[i] as string
        const div0 = document.createElement('div')
        if (i) div0.classList.add('sub-result')
        div0.innerText = de.trim()
        td0.appendChild(div0)
        const div1 = document.createElement('div')
        if (i) div1.classList.add('sub-result')
        div1.innerText = en.trim()
        td1.appendChild(div1)
      })
      tr.appendChild(td0)
      tr.appendChild(td1)
      result_rows.appendChild(tr)
    })
    if (!matches.length) {
      result_count.innerText = `No matches found (dictionary holds ${dictLines.length} entries).`
      result_rows.appendChild(no_results)
    }
    else if (displayCount!=matches.length)
      result_count.innerText = `Found ${matches.length} matches, showing the first ${displayCount}.`
    else
      result_count.innerText = `Showing all ${matches.length} matches.`
  }

  search_term.addEventListener('change', do_search)
  do_search()
})
