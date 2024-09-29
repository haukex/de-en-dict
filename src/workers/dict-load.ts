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

import {DB_URL, DB_VER_URL, DB_CACHE_NAME} from './consts'
import {WorkerMessageType, assert} from '../js/common'

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
 * by fetching a relatively small file and seeing if it has changed. */
async function doesDictNeedUpdate(): Promise<boolean> {
  let dictNeedsUpdate = false
  try {
    // get the small text file from the network
    // (note service worker is special-cased to not intercept this URL so it won't be cached)
    const dictVerResp = await fetch(DB_VER_URL)
    if (dictVerResp.ok) {
      // next, check if we have a copy of the file in the cache
      const cache = await caches.open(DB_CACHE_NAME)
      const dictVerCache = await cache.match(DB_VER_URL)
      if (dictVerCache) { // we have a copy of the file in the cache
        // and then compare whether the two files are the same
        // (clone because Response body can only be read once per request)
        if ( (await dictVerCache.text()) === (await dictVerResp.clone().text()) )
          console.debug('The dict version information has not changed.')
        else {
          // otherwise, the file on the server has changed, so the dictionary needs to be updated too
          console.debug('The dict version information has changed.')
          dictNeedsUpdate = true
        }
      }
      /* Otherwise, we don't have a copy of the file in the cache, which probably means that
       * the cache is empty, meaning that the dictionary will have to be fetched anyway.
       * But it could also indicate an inconsistent state of the cache, so it makes sense to report that an update is needed. */
      else {
        console.debug('The dict version information is not in our cache.')
        dictNeedsUpdate = true
      }
      // save the current version of the file for the next comparison
      cache.put(DB_VER_URL, dictVerResp)
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
export async function loadDict(target :string[]): Promise<void> {
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
    // decode the body, split the text into lines, trim the lines, remove blank lines and comments
    const dictLines = (await gunzipUTF8(rs))
      .split(/\r?\n|\r(?!\n)/g).map(line => line.trim()).filter(line => line.length && !line.startsWith('#'))
    if (dictLines.length <= 1)
      throw new Error(`Dictionary data was empty? (${dictLines.length} lines)`)
    // then copy over the lines into the target array
    target.length = 0  // clear the target line array
    dictLines.forEach(el => target.push(el))
    console.debug(`Decoded ${dictLines.length} dictionary lines.`)
  }

  // Helper function to fetch dictionary from network (no cache) and update cache and target.
  const getDictFromNet = async (progCb :boolean): Promise<void> => {
    // (note service worker is special-cased to not intercept this URL so it won't be cached)
    const dictFromNet = await fetch(DB_URL)
    const msg = `${dictFromNet.url} ${dictFromNet.type} ${dictFromNet.status} ${dictFromNet.statusText}`
    if (dictFromNet.ok && dictFromNet.body) console.debug(msg)
    else throw new Error(msg)
    // (clone because Response body can only be read once per request)
    const dictForCache = dictFromNet.clone()
    await response2lines(dictFromNet, progCb);  // update the target with this response
    // don't store the response in cache until we know it was processed without error
    (await caches.open(DB_CACHE_NAME)).put(DB_URL, dictForCache)  // save the response to the cache
  }

  // Check if the dictionary is in the cache.
  const dictFromCache = await (await caches.open(DB_CACHE_NAME)).match(DB_URL)
  if (dictFromCache) {
    console.debug('The dictionary data is in the cache, using that first, and will check for update in background.')
    // Schedule the dictionary update check for background execution.
    /* If there was a reliable way to detect metered connections, the update check could be skipped here.
     * See https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
     * but see also the various discussions at https://github.com/WICG/netinfo/issues?q=metered
     * and the relaunch attempt at https://github.com/tomayac/netinfo/blob/relaunch/README.md */
    setTimeout(async () => {
      if (await doesDictNeedUpdate()) {
        console.debug('Dictionary needs update, starting background update.')
        const m :WorkerMessageType = { type: 'dict-upd', status: 'loading', dictLinesLen: target.length }
        postMessage(m)
        try {
          // Note this will "hot swap" the dictionary data into the array holding the lines.
          await getDictFromNet(false)
          const m :WorkerMessageType = { type: 'dict-upd', status: 'done', dictLinesLen: target.length }
          postMessage(m)
        }
        catch (error) { console.warn('Failed to get dictionary update.', error) }
      }
      else console.debug('Dictionary doesn\'t appear to need an update.')
    }, 500)
    // This may throw an error, so call it last.
    await response2lines(dictFromCache, true)
  }
  else {
    console.debug('The dictionary data is not in the cache, fetching it now.')
    // We can also assume we don't have the version information in the cache either, so fetch that in the background.
    // (the only goal is fetching the version info from the network, so we don't care about the return value)
    setTimeout(doesDictNeedUpdate, 500)
    // This may throw an error, so call it last.
    await getDictFromNet(true)
  }
}
