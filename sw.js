const CACHE_NAME = 'partyplanner-cache-v3';

// Liste aqui os caminhos exatos dos arquivos estáticos do seu projeto
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/app.html',
    '/client.html',
    '/css/style.css',
    '/js/app.js',
    '/js/admin.js',
    '/js/client.js',
    '/js/firebase.js',
    '/pwa-manager.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Instalação: Salva os arquivos estáticos no cache
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Ativação: Limpa versões antigas do cache
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

// Estratégia de Cache: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
    // Ignora requisições do Firebase (deixa o SDK e a persistência offline nativa cuidarem disso)
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('firebaseio.com') || 
        event.request.url.includes('identitytoolkit')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Tenta buscar na rede para atualizar o cache em background
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Falha silenciosa se estiver offline (retorna o que está no cache)
            });

            // Retorna o cache imediatamente se existir, caso contrário aguarda a rede
            return cachedResponse || fetchPromise;
        })
    );
});
