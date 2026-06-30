/* ============================================================
   Service Worker — Auditoria SSMA
   Versão: 4.1 — atualizar CACHE_NAME ao publicar mudanças
   ============================================================ */
const CACHE_NAME = 'auditoria-ssma-v7';

const LOCAL_FILES = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './config.js',
  './supabaseClient.js',
  './icon.svg',
  './manifest.json',
];

/* ---- Instalação: cacheia arquivos locais ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ---- Ativação: limpa caches antigos ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- Fetch: serve do cache quando offline ---- */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Não intercepta chamadas ao Supabase — essas sempre vão pra rede
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) return;

  // Não intercepta CDN externas (Supabase JS, Google Fonts, Dexie)
  if (url.hostname !== self.location.hostname) return;

  // Para arquivos locais: tenta cache primeiro, depois rede
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Guarda no cache pra próxima vez
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Sem cache e sem rede: retorna index.html como fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
