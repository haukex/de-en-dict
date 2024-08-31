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

import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst} from './cache'
import {reportError} from './global'

/** Decodes a stream of bytes (Response body) first as a gzip stream, then as UTF-8 text. */
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
  console.debug(`Decompressed ${result.length} characters.`)
  return result
}

/** Determines whether the dictionary version on the server has changed,
 * by fetching a relatively small file and seeing if it has changed. */
async function doesDictNeedUpdate() {
  let dictNeedsUpdate = false
  try {
    // get the small text file from the network
    // (note service worker is special-cased to not intercept this URL so it won't be cached)
    const dictVerResp = await fetch(DB_VER_URL)
    if (dictVerResp.ok) {
      // need to save a clone of the response for the cache (body can only be read once per Response)
      const dictVerRespClone = dictVerResp.clone()
      // next, check if we have a copy of the file in the cache
      const cache = await caches.open(DB_CACHE_NAME)
      const dictVerCache = await cache.match(DB_VER_URL)
      if (dictVerCache) { // we have a copy of the file in the cache
        //console.debug('The cached version data vs current version data', dictVerCacheData, dictVerRespData)
        // and then compare whether the two files are the same
        if ( (await dictVerCache.text()) === (await dictVerResp.text()) )
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
      cache.put(DB_VER_URL, dictVerRespClone)
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

// this function does all the handling of the dictionary loading
export async function loadDict() :Promise<string[]> {
  const dictNeedsUpdate = await doesDictNeedUpdate()
  // fetch the dictionary
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
      throw new Error(`${dictResp.url} ${dictResp.type} ${dictResp.status} ${dictResp.statusText}`)
    // unpack the dictionary file
    return (await gunzipUTF8(dictResp.body))
      // split the text into lines, trim the lines, remove blank lines and comments
      .split(/\r?\n|\r(?!\n)/g).map((line) => line.trim()).filter((line) => line.length && !line.startsWith('#'))
  } catch (error) {
    reportError(error, 'loadDict')
    // our callers will see an empty response as an error:
    return []
  }
}
