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

// eslint-disable-next-line no-var
declare var self: ServiceWorkerGlobalScope

import {DB_URL, DB_VER_URL, DB_CACHE_NAME, cacheFirst} from '../src/common'
import {manifest, version} from '@parcel/service-worker'

const APP_CACHE_NAME = `DeEnDict-${version}`

async function install() {
  // add the files for this app to a versioned cache
  await (await caches.open(APP_CACHE_NAME)).addAll(manifest)
  console.debug('SW install: Added static resources to cache', manifest)
  // add the dictionary to its cache
  const dbCache = await caches.open(DB_CACHE_NAME)
  if (await dbCache.match(DB_URL))
    console.debug('SW install: DB was already in its cache')
  else {
    await dbCache.add(DB_URL)
    console.log(`SW install: Added ${DB_URL} to DB cache`)
  }
}
self.addEventListener('install', e => e.waitUntil(install()))

async function activate() {
  const cachesToDelete = (await caches.keys()).filter((key) => key !== APP_CACHE_NAME && key !== DB_CACHE_NAME)
  if (cachesToDelete.length) {
    await Promise.all(cachesToDelete.map(key => caches.delete(key)))
    console.debug('SW activate: Cleaned caches', cachesToDelete)
  }
  await self.clients.claim()
  console.debug('SW activated')
}
self.addEventListener('activate', e => e.waitUntil(activate()))

self.addEventListener('fetch', event => {
  // don't touch URLs like "chrome-extension://" or the DB_URL/DB_VER_URL
  if (event.request.url.toLowerCase().startsWith('http') && event.request.url!==DB_URL && event.request.url!==DB_VER_URL) {
    console.debug('SW fetch: Intercepting', event.request)
    event.respondWith(cacheFirst(caches, APP_CACHE_NAME, event.request))
  }
})
