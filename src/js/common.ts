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

export {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst}

/* The URLs from which to load the dictionary and version information.
 * I have permission to use the ftp.tu-chemnitz.de server from Frank Richter.
 * It now sends CORS headers so we can access it. */
const DB_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt.gz'
const DB_VER_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/sha256sums.txt'
// The following is my (Hauke's) mirror; manually updated so it may not be up-to-date.
//const DB_URL = 'https://bl0.zero-g.net/de-en.txt.gz'
//const DB_VER_URL = 'https://bl0.zero-g.net/sha256sums.txt'

/* The name of the cache in which to store the dictionary.
 * Note the main script takes care of checking for cache freshness. */
const DB_CACHE_NAME = 'DeEnDict'

/* This function checks for the existence of a request URL in the specified cache,
 * returning it if it is found, otherwise it goes out to the network and stores the result in the cache. */
async function cacheFirst(storage :CacheStorage, cacheName :string, request :Request) {
  try {
    const cache = await storage.open(cacheName)
    const responseFromCache = await cache.match(request)
    if (responseFromCache) {
      console.debug(`cache HIT ${cacheName} ${request.method} ${request.url}`)
      return responseFromCache
    } // else
    console.debug(`cache MISS ${cacheName} ${request.method} ${request.url}`)
    const responseFromNetwork = await fetch(request)
    await cache.put(request, responseFromNetwork.clone())
    return responseFromNetwork
  } catch (error) {
    console.error(`Failed to fetch ${request}`, error)
    return Response.error()
  }
}