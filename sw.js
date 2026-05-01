const CACHE_VERSION = 'v1';
const CACHE_NAME = `partyplanner-${CACHE_VERSION}`;
const RUNTIME_CACHE = `partyplanner-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `partyplanner-images-${CACHE_VERSION}`;

// Arquivos críticos que devem ser cacheados na instalação
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './app.html',
  './client.html',
  './admin.html',
  './cadastro.js',
  './landing.js',
  './css/style.css',
  './js/firebase.js',
  './js/app.js',
  './js/client.js',
  './js/admin.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// CDNs e recursos externos
const EXTERNAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

// ===== EVENTO: INSTALL =====
self.addEventListener('install', event => {
  console.log('[SW] 🔧 Instalando Service Worker...');
  
  self.skipWaiting();

  event.waitUntil(
    Promise.all([
      // Cache crítico
      caches.open(CACHE_NAME).then(cache => {
        console.log('[SW] 📦 Cacheando arquivos críticos...');
        return cache.addAll(CRITICAL_ASSETS).catch(error => {
          console.error('[SW] ❌ Erro ao cachear arquivos críticos:', error);
        });
      }),
      
      // Cache de externos (não bloqueia instalação)
      caches.open(RUNTIME_CACHE).then(cache => {
        EXTERNAL_ASSETS.forEach(url => {
          fetch(new Request(url, { mode: 'no-cors' }))
            .then(response => cache.put(url, response))
            .catch(err => console.warn(`[SW] ⚠️ Não conseguiu cachear: ${url}`));
        });
      })
    ])
  );
});

// ===== EVENTO: ACTIVATE =====
self.addEventListener('activate', event => {
  console.log('[SW] 🚀 Ativando Service Worker...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== RUNTIME_CACHE && 
              cacheName !== IMAGE_CACHE) {
            console.log('[SW] 🗑️  Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ===== EVENTO: FETCH =====
self.addEventListener('fetch', event => {
  // Ignorar requisições não-GET
  if (event.request.method !== 'GET') return;

  // Ignorar requisições de extensão
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Estratégia 1: Imagens (cache-first)
  if (isImage(url)) {
    event.respondWith(cacheFirstStrategy(event.request, IMAGE_CACHE));
    return;
  }

  // Estratégia 2: APIs/Dados (network-first)
  if (isApi(url)) {
    event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
    return;
  }

  // Estratégia 3: Arquivos estáticos (cache-first)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
    return;
  }

  // Estratégia padrão: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// ===== ESTRATÉGIAS DE CACHE =====

/**
 * Cache First Strategy: Tenta o cache primeiro, depois a rede
 */
function cacheFirstStrategy(request, cacheName) {
  return caches.open(cacheName).then(cache => {
    return cache.match(request).then(response => {
      if (response) {
        return response;
      }

      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone a resposta
        const responseToCache = response.clone();
        cache.put(request, responseToCache);
        return response;
      }).catch(() => {
        return new Response('Recurso não disponível offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    });
  });
}

/**
 * Network First Strategy: Tenta a rede primeiro, depois o cache
 */
function networkFirstStrategy(request, cacheName) {
  return fetch(request).then(response => {
    if (!response || response.status !== 200) {
      return response;
    }

    const responseToCache = response.clone();
    caches.open(cacheName).then(cache => {
      cache.put(request, responseToCache);
    });

    return response;
  }).catch(() => {
    return caches.match(request).then(response => {
      if (response) {
        return response;
      }

      return new Response('Sem conexão e sem dados em cache', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      });
    });
  });
}

/**
 * Stale While Revalidate Strategy
 */
function staleWhileRevalidate(request) {
  return caches.match(request).then(cachedResponse => {
    const fetchPromise = fetch(request).then(response => {
      if (!response || response.status !== 200) {
        return response;
      }

      const responseToCache = response.clone();
      caches.open(RUNTIME_CACHE).then(cache => {
        cache.put(request, responseToCache);
      });

      return response;
    }).catch(() => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return new Response('Sem conexão', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    });

    return cachedResponse || fetchPromise;
  });
}

// ===== UTILITÁRIOS =====

function isImage(url) {
  return /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(url.pathname);
}

function isApi(url) {
  return url.hostname === 'firebaseio.com' || 
         url.hostname.includes('firebase') ||
         url.pathname.includes('/api/');
}

function isStaticAsset(url) {
  return /\.(js|css|woff|woff2|ttf|eot)$/i.test(url.pathname);
}

// ===== MENSAGENS DO CLIENTE =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    });
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        event.ports[0].postMessage({
          usage: estimate.usage,
          quota: estimate.quota
        });
      });
    }
  }
});

// ===== SINCRONIZAÇÃO EM BACKGROUND (BackgroundSync API) =====
self.addEventListener('sync', event => {
  if (event.tag === 'sync-events') {
    event.waitUntil(syncEvents());
  }
  if (event.tag === 'sync-clients') {
    event.waitUntil(syncClients());
  }
});

async function syncEvents() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const response = await fetch('/api/events');
    if (response.ok) {
      await cache.put('/api/events', response.clone());
      console.log('[SW] ✅ Eventos sincronizados');
    }
  } catch (error) {
    console.error('[SW] ❌ Erro ao sincronizar eventos:', error);
  }
}

async function syncClients() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const response = await fetch('/api/clients');
    if (response.ok) {
      await cache.put('/api/clients', response.clone());
      console.log('[SW] ✅ Clientes sincronizados');
    }
  } catch (error) {
    console.error('[SW] ❌ Erro ao sincronizar clientes:', error);
  }
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'partyplanner-notification',
    requireInteraction: false,
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('PartyPlanner Pro', options)
  );
});

// Ao clicar na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === './' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

console.log('[SW] 🎉 Service Worker carregado com sucesso!');
