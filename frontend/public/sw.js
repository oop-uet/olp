const CACHE_NAME = 'oop-frontend-v1'
const APP_BASE = '/olp/'
const ASSET_PATHS = [`${APP_BASE}assets/`, `${APP_BASE}downloads/`]
const STATIC_EXTENSIONS = /\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (shouldCacheStaticAsset(url)) {
    event.respondWith(cacheFirst(request))
  }
})

function shouldCacheStaticAsset(url) {
  if (url.pathname.endsWith('.jar') || url.pathname.endsWith('.zip')) return false
  return ASSET_PATHS.some((path) => url.pathname.startsWith(path)) || STATIC_EXTENSIONS.test(url.pathname)
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match(`${APP_BASE}index.html`)
  }
}
