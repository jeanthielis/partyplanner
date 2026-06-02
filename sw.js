const CACHE_NAME = 'partyplanner-cache-v4';

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

// Instalação: pré-cacheia os assets estáticos
self.addEventListener('install', (event) => {
    // Ativa imediatamente sem esperar abas antigas fecharem
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Ativação: limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Mensagem do cliente para ativar novo SW imediatamente (após confirmação do usuário)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Estratégia: Network First para HTML, Cache First para assets estáticos
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora requisições do Firebase (SDK cuida do offline nativo)
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('identitytoolkit') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com')
    ) {
        return;
    }

    // Para navegação (HTML), tenta rede primeiro para garantir auth redirect funcione
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('./app.html'))
        );
        return;
    }

    // Para assets estáticos: Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {});

            return cachedResponse || fetchPromise;
        })
    );
});
