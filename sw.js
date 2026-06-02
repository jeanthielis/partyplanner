const CACHE_NAME = 'partyplanner-cache-v5';

// Apenas arquivos locais do projeto
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.html',
    './client.html',
    './css/style.css',
    './js/app.js',
    './js/admin.js',
    './js/client.js',
    './js/firebase.js',
    './pwa-manager.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Domínios externos que o SW NÃO deve interceptar
// (CDNs, Firebase, Google Fonts - deixa o browser resolver direto)
const PASSTHROUGH_HOSTS = [
    'firestore.googleapis.com',
    'firebaseio.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'googleapis.com',
    'gstatic.com',
    'unpkg.com',
    'cdn.tailwindcss.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Usa individual adds com try/catch para não abortar tudo se um arquivo falhar
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url =>
                    cache.add(url).catch(err => console.warn('SW: falha ao cachear', url, err))
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Passa CDNs e Firebase direto pro browser, sem interceptar
    if (PASSTHROUGH_HOSTS.some(host => url.hostname.includes(host))) {
        return;
    }

    // Apenas arquivos locais (mesmo origem)
    if (url.origin !== self.location.origin) {
        return;
    }

    // Navegação (HTML): rede primeiro, fallback para app.html em cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match('./app.html'))
        );
        return;
    }

    // Assets locais: Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const networkFetch = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => cachedResponse); // Se rede falha, retorna cache (não undefined)

            return cachedResponse || networkFetch;
        })
    );
});
