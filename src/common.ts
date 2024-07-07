
export {DB_URL, DB_CACHE_NAME, cacheFirst}

//const DB_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt'
const DB_URL = 'https://bl0.zero-g.net/db/de-en.txt'
const DB_CACHE_NAME = 'Blict-v1'  // modify this to force a reload

async function cacheFirst(storage :CacheStorage, cacheName :string, request :Request) {
  try {
    const cache = await storage.open(cacheName)
    const responseFromCache = await cache.match(request)
    if (responseFromCache) {
      console.debug(`cache HIT ${cacheName} ${request.method} ${request.url}`)
      return responseFromCache
    }
    console.debug(`cache MISS ${cacheName} ${request.method} ${request.url}`)
    const responseFromNetwork = await fetch(request)
    await cache.put(request, responseFromNetwork.clone())
    return responseFromNetwork
  } catch (error) {
    console.error(`Failed to fetch ${request}`, error)
    return Response.error()
  }
}