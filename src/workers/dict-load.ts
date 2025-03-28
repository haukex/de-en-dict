/**
 * German-English Dictionary
 * =========================
 *
 * Copyright © 2024-2025 Hauke Dämpfling, haukex@zero-g.net
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

import {IDictStats, WorkerMessageType, assert, splitDictLine} from '../js/common'
import {DB_URL, DB_VER_URL, DB_CACHE_NAME} from './consts'

class ProgressTransformer extends TransformStream<Uint8Array, Uint8Array> {
  constructor(totalBytes :number, callback :(percent :number)=>void, intervalMs :number = 100, initialDelayMs :number = 500,
    reportZeroPercent :boolean = false) {
    let curBytes = 0
    let nextUpdateTimeMs = new Date().getTime() + initialDelayMs
    super({
      async start() {
        //console.debug(`ProgressTransformer: start at ${curBytes} of ${totalBytes} (${100*curBytes/totalBytes}%)`)
        if (reportZeroPercent) {
          try { callback(0) }
          catch (error) { console.error(error) }
        }
      },
      async transform(chunk, controller) {
        controller.enqueue(chunk)
        curBytes += chunk.byteLength
        //console.debug(`ProgressTransformer: transform at ${curBytes} of ${totalBytes} (${100*curBytes/totalBytes}%)`)
        const nowMs = new Date().getTime()
        if (nowMs >= nextUpdateTimeMs) {
          nextUpdateTimeMs = nowMs + intervalMs
          try { callback( 100*curBytes/totalBytes ) }
          catch (error) { console.error(error) }
        }
      },
      async flush() {
        //console.debug(`ProgressTransformer: flush at ${curBytes} of ${totalBytes} (${100*curBytes/totalBytes}%)`)
        try { callback(100) }
        catch (error) { console.error(error) }
        if (curBytes != totalBytes)
          console.warn(`ProgressTransformer expected ${totalBytes} but got ${curBytes}`)
      }
    })
  }
}

/** Decodes a stream of bytes (Response body) first as a gzip stream, then as UTF-8 text. */
async function gunzipUTF8(stream :ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream('UTF-8')).getReader()
  // join the chunks provided by the reader
  let result = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const {done, value} = await reader.read()
    if (done) break
    result += value
  }
  console.debug(`Decompressed ${result.length} characters.`)
  return result
}

/** Determines whether the dictionary version on the server has changed,
 * by fetching a relatively small file and seeing if it has changed.
 *
 * If this function returns `null`, no update is needed, but if an update
 * is needed, then the caller must call the returned function when it is
 * done doing its work, or not call it if its work fails. */
async function doesDictNeedUpdate(cache :Cache): Promise<null|(()=>void)> {
  let dictNeedsUpdate :null|(()=>void) = null  // return value
  try {
    // get the small text file from the network
    // (note service worker is special-cased to not intercept this URL so it won't be cached)
    const dictVerResp = await fetch(DB_VER_URL)
    if (dictVerResp.ok) {
      // this function, to be called by our callers, saves the current version of the file for the next comparison
      const commit = async () => {
        cache.put(DB_VER_URL, dictVerResp)
        console.debug('Saved the new dict version information.')
      }
      // next, check if we have a copy of the file in the cache
      const dictVerCache = await cache.match(DB_VER_URL)
      if (dictVerCache) { // we have a copy of the file in the cache
        // and then compare whether the two files are the same
        // (clone because Response body can only be read once per request)
        if ( (await dictVerCache.text()) === (await dictVerResp.clone().text()) )
          console.debug('The dict version information has not changed.')
        else {
          // otherwise, the file on the server has changed, so the dictionary needs to be updated too
          console.debug('The dict version information has changed.')
          dictNeedsUpdate = commit
        }
      }
      /* Otherwise, we don't have a copy of the file in the cache, which probably means that
       * the cache is empty, meaning that the dictionary will have to be fetched anyway.
       * But it could also indicate an inconsistent state of the cache, so it makes sense to report that an update is needed. */
      else {
        console.debug('The dict version information is not in our cache.')
        dictNeedsUpdate = commit
      }
    }
    else
      // we couldn't get the file, which isn't a big problem, we'll try again next time
      // (the same applies if an error occurs, below)
      console.log('Failed to get dict version information.', dictVerResp)
  } catch (error) {
    console.log('Failed to check dict version information.', error)
  }
  return dictNeedsUpdate
}

/** This function loads the dictionary, updating it in the background if appropriate.
 *
 * **IMPORTANT:** This means that it may modify the `target` array twice, once before the
 * function returns, and once when the updated dictionary data is loaded.
 */
export async function loadDict(target :string[], dictStats :IDictStats): Promise<void> {
  /* Note: Firefox was exhibiting some strange crashes (GH issue #32),
   * and it seems like either one or both of the following things fixed
   * it, so make sure not to change these:
   * 1. cache.put() the original request, not its .clone(), only use the
   *    latter for immediate processing.
   * 2. Only use caches.open() once and then use that object, as follows
   */
  const cache = await caches.open(DB_CACHE_NAME)

  // Helper function to copy response data to target line array.
  const response2lines = async (resp :Response, progCb :boolean): Promise<void> => {
    assert(resp.body)
    const rawCl = resp.headers.get('Content-Length')
    const rs = rawCl && progCb
      ? resp.body.pipeThrough(new ProgressTransformer(parseInt(rawCl), percent => {
        const m :WorkerMessageType = { type: 'dict-prog', percent: percent }
        postMessage(m)
      }))
      : resp.body
    // decode the body and split the text into lines
    const dictLinesRaw = (await gunzipUTF8(rs)).split(/\r?\n|\r(?!\n)/g)
    // search the beginning of the dict for the stats comment
    let statsEntries :number|null = null
    let statsLines :number|null = null
    let stats1to1 :number|null = null
    dictLinesRaw.slice(0, 50).some(line => {
      /* Regex to parse the stats line in the dictionary comments, generated as follows (Perl):
       * "Stats: $count entries ($trans_main main + " . ($trans_add+$trans_add2) . " additional, $mult 1:1 translations)\n" */
      const match = line.match(/^\s*#\s*Stats: (\d+) entries \((\d+) main \+ (\d+) additional, (\d+) 1:1 translations\)\s*$/)
      if ( match ) {
        statsEntries = parseInt( match[1] as string )
        statsLines = parseInt( match[2] as string )
        stats1to1 = parseInt( match[4] as string )
      }
      return !!match  // this should cause Array.some to short-circuit
    })
    // trim the lines and remove blank lines and comments
    const dictLines = dictLinesRaw.map(line => line.trim()).filter(line => line.length && !line.startsWith('#'))
    if (dictLines.length <= 1)
      throw new Error(`Dictionary data was empty? (${dictLines.length} lines)`)
    // then copy over the lines into the target array (and count entries)
    let entries = 0
    target.length = 0  // clear the target line array
    dictLines.forEach(el => {
      entries += splitDictLine(el).length
      target.push(el)
    })
    dictStats.lines = dictLines.length
    dictStats.entries = entries
    console.debug(`Decoded ${dictLines.length} dictionary lines with ${entries} entries.`)
    if ( statsEntries!=entries )
      console.warn(`Stats line reports ${statsEntries} entries, but I counted ${entries} - not trusting Stats line`)
    else if ( statsLines!=dictLines.length )
      console.warn(`Stats line reports ${statsLines} lines, but I have ${dictLines.length} - not trusting Stats line`)
    else if (stats1to1) {
      console.debug(`Stats line reports ${stats1to1} 1:1 translations.`)
      dictStats.oneToOne = stats1to1
    }
  }

  // Helper function to fetch dictionary from network (no cache) and update cache and target.
  const getDictFromNet = async (progCb :boolean): Promise<void> => {
    // (note service worker is special-cased to not intercept this URL so it won't be cached)
    const dictFromNet = await fetch(DB_URL)
    const msg = `${dictFromNet.url} ${dictFromNet.type} ${dictFromNet.status} ${dictFromNet.statusText}`
    if (dictFromNet.ok && dictFromNet.body) console.debug(msg)
    else throw new Error(msg)
    // (clone because Response body can only be read once per request)
    await response2lines(dictFromNet.clone(), progCb)  // update the target with this response
    // don't store the response in cache until we know it was processed without error
    cache.put(DB_URL, dictFromNet)  // save the response to the cache
  }

  // Check if the dictionary is in the cache.
  const dictFromCache = await cache.match(DB_URL)
  if (dictFromCache) {
    console.debug('The dictionary data is in the cache, using that first, and will check for update in background.')
    // Schedule the dictionary update check for background execution.
    /* If there was a reliable way to detect metered connections, the update check could be skipped here.
     * See https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
     * but see also the various discussions at https://github.com/WICG/netinfo/issues?q=metered
     * and the relaunch attempt at https://github.com/tomayac/netinfo/blob/relaunch/README.md */
    setTimeout(async () => {
      const commit = await doesDictNeedUpdate(cache)
      if (commit) {
        console.debug('Dictionary needs update, starting background update.')
        const m :WorkerMessageType = { type: 'dict-upd', status: 'loading', dictStats: dictStats }
        postMessage(m)
        try {
          // Note this will "hot swap" the dictionary data into the array holding the lines.
          await getDictFromNet(false)
          const m :WorkerMessageType = { type: 'dict-upd', status: 'done', dictStats: dictStats }
          postMessage(m)
          commit()
        }
        catch (error) {
          console.warn('Failed to get dictionary update.', error)
          const m :WorkerMessageType = { type: 'dict-upd', status: 'error', dictStats: dictStats }
          postMessage(m)
        }
      }
      else console.debug('Dictionary doesn\'t appear to need an update.')
    }, 500)
    // This may throw an error, so call it last.
    await response2lines(dictFromCache, true)
  }
  else {
    console.debug('The dictionary data is not in the cache, fetching it now.')
    // This may throw an error, and if that happens, we don't want/need to get+save the dictionary version info either.
    await getDictFromNet(true)
    // We can also assume we don't have the version information in the cache either, so fetch that in the background.
    setTimeout(async () => {
      const commit = await doesDictNeedUpdate(cache)
      if (commit) commit()
    }, 500)
  }
}
