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

/* This is the Service Worker that allows the Progressive Web App
 * to work in offline mode. */

// We need to trick TypeScript into realizing that `self` isn't a `Window` in this file.
// eslint-disable-next-line no-var
declare var self: ServiceWorkerGlobalScope

// manifest is a list of the static resources that belong to the webapp
// version is a hash calculated by parcel for the static resources
import {manifest, version} from '@parcel/service-worker'
import {DB_URL, DB_VER_URL, DB_CACHE_NAME} from './consts'

/* The name of the cache, dependent on the current version, so that when the version changes,
 * the previous cache is discarded and resources are fetched again. */
const APP_CACHE_NAME = `DeEnDict-${version}`

/** Send a message to the main window, where the event handler will log it as a debug message.
 * This is needed because in Firefox, Service Worker console.log messages don't end up in the main console.
 * (This results in duplicate log messages in Chrome, which does log Service Worker logs to the main console.) */
function sendMsg(msg :string) {
  self.clients.matchAll({includeUncontrolled: true}).then(clients => {
    clients.forEach(client =>
      client.postMessage(msg)
    )
  })
}

// handler for the Service Worker "install" event (typically used for preloading)
async function install() {
  // add the files for this app to the (versioned) cache
  await (await caches.open(APP_CACHE_NAME)).addAll(manifest)
  console.debug('SW install: Added static resources to cache', manifest)
  // preload the dictionary into its cache
  const dbCache = await caches.open(DB_CACHE_NAME)
  if (await dbCache.match(DB_URL))
    console.debug('SW install: DB was already in its cache')
  else {
    await dbCache.add(DB_URL)
    console.log(`SW install: Added ${DB_URL} to DB cache`)
  }
}
self.addEventListener('install', e => e.waitUntil(install()))

// handler for the Service Worker "activate" event (typically used for cache cleaning)
async function activate() {
  // determine which caches can be deleted
  const cachesToDelete = (await caches.keys()).filter(key => key !== APP_CACHE_NAME && key !== DB_CACHE_NAME)
  if (cachesToDelete.length) {
    // and delete those caches
    await Promise.all(cachesToDelete.map(key => caches.delete(key)))
    console.debug('SW activate: Cleaned caches', cachesToDelete)
  }
  // activate this Service Worker on existing pages
  await self.clients.claim()
  console.debug('SW activated')
  sendMsg(`activate done (version ${version})`)
}
self.addEventListener('activate', e => e.waitUntil(activate()))

// handler for the Service Worker "fetch" event (for intercepting all network requests)
self.addEventListener('fetch', event => {
  // don't touch URLs like "chrome-extension://" or the DB_URL/DB_VER_URL
  if (event.request.url.toLowerCase().startsWith('http') && event.request.url!==DB_URL && event.request.url!==DB_VER_URL) {
    console.debug('SW fetch: Intercepting', event.request)
    sendMsg(`fetch: Intercepting ${event.request.method} ${event.request.url}`)
    event.respondWith(cacheFirst(caches, APP_CACHE_NAME, event.request))
  }
  else {
    console.debug('SW fetch: NOT Intercepting', event.request)
    sendMsg(`fetch: NOT Intercepting ${event.request.method} ${event.request.url}`)
  }
})

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
    console.error(error)
    sendMsg(`cacheFirst: ERROR ${error}`)
    return Response.error()
  }
}
