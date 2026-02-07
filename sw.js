const CACHE_NAME = 'partyplanner-v13';

// Lista de arquivos CRÍTICOS (Locais)
// Se estes falharem, o app não funciona offline.
const localAssets = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './manifest.json'
];

// Lista de arquivos EXTERNOS (CDNs)
// Se estes falharem, vamos tentar carregar online, mas não matamos a instalação.
const externalAssets = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Força o novo SW a ativar imediatamente
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[SW] Abrindo cache...');
      
      // 1. Tenta cachear arquivos locais (Críticos)
      try {
        await cache.addAll(localAssets);
        console.log('[SW] Arquivos locais cacheados.');
      } catch (error) {
        console.error('[SW] Erro ao cachear arquivos locais:', error);
      }

      // 2. Tenta cachear externos um por um (para não quebrar se um falhar)
      for (const url of externalAssets) {
        try {
          // 'no-cors' permite cachear recursos opacos (CDNs) sem erro de segurança
          const request = new Request(url, { mode: 'no-cors' });
          const response = await fetch(request);
          await cache.put(request, response);
        } catch (error) {
          console.warn(`[SW] Falha ao cachear recurso externo: ${url}`, error);
        }
      }
    })
  );
});

self.addEventListener('activate', event => {
  // Limpa caches antigos
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Ignora requisições que não sejam GET (ex: POST para Firebase)
  if (event.request.method !== 'GET') return;
  
  // Ignora requisições do Chrome Extension ou esquemas não suportados
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna do cache se existir
        if (response) {
          return response;
        }
        
        // Se não, busca na rede
        return fetch(event.request).catch(() => {
            // Se falhar na rede (offline) e não tiver no cache, mostra erro ou fallback
            console.log('[SW] Falha de rede e sem cache para:', event.request.url);
        });
      })
  );
});