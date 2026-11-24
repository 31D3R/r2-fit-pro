// Service worker: instalar na tela inicial, receber lembretes e abrir sem internet.
// Com internet, as páginas vêm sempre do site (versão mais nova) e uma cópia fica guardada;
// sem internet, abre a cópia. Arquivos com nome versionado (/assets), ícones, vozes e animações ficam guardados ao usar.
const CACHE = 'r2-app-v3'
// Ao instalar, já guarda a página e os arquivos dela: sem isso, a cópia para abrir sem internet só existiria
// a partir da segunda abertura do app (a primeira carrega antes do service worker existir)
self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE)
      const r = await fetch('/index.html', { cache: 'no-store' })
      if (!r.ok || !(r.headers.get('content-type') || '').includes('text/html')) return
      const html = await r.clone().text()
      await cache.put('/index.html', r)
      const arquivos = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]))]
      await Promise.all(arquivos.map(a => cache.add(a).catch(() => {})))
    } catch { /* sem internet agora: guarda depois, ao navegar */ }
  })())
})
self.addEventListener('activate', e => e.waitUntil((async () => {
  // só as cópias antigas do app (as vozes de nomes, r2-voz-*, ficam)
  for (const k of await caches.keys()) if (k.startsWith('r2-app-') && k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

const guardavel = url => url.origin === self.location.origin && /^\/(assets|icons|audio|animacoes)\//.test(url.pathname)

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Páginas do app: rede primeiro (até 4 s), guarda a cópia; sem internet, a cópia guardada
  if (req.mode === 'navigate' && url.origin === self.location.origin && !url.pathname.startsWith('/baixar')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const copia = await cache.match('/index.html')
      try {
        // internet lenta: espera 4 s só se houver cópia para mostrar; sem cópia, espera a rede o tempo que precisar
        const ctl = new AbortController()
        const t = copia ? setTimeout(() => ctl.abort(), 4000) : null
        const r = await fetch(req, { signal: ctl.signal })
        if (t) clearTimeout(t)
        if (r.ok && (r.headers.get('content-type') || '').includes('text/html')) cache.put('/index.html', r.clone())
        return r
      } catch {
        return copia || Response.error()
      }
    })())
    return
  }
  // Arquivos do app: do aparelho quando já tem, senão da rede (e guarda)
  if (guardavel(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const tem = await cache.match(req)
      const buscar = fetch(req).then(r => {
        // nunca guarda uma página no lugar de um arquivo (arquivo que não existe mais depois de uma atualização)
        const tipo = r.headers.get('content-type') || ''
        if (r.ok && r.status === 200 && !tipo.includes('text/html') && Number(r.headers.get('content-length') || 0) < 5000000) cache.put(req, r.clone())
        return r
      })
      // /assets têm nome com versão (não mudam): da cópia. Vozes, ícones e animações: da cópia e atualiza por trás
      if (tem) { if (!url.pathname.startsWith('/assets/')) e.waitUntil(buscar.catch(() => {})); return tem }
      return buscar
    })())
  }
})

// Lembrete enviado pelo servidor (Web Push): { titulo, corpo, url, tag }
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { corpo: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'R2 Fit Pro', {
    body: d.corpo || '',
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2.png',
    tag: d.tag || 'r2-lembrete',
    renotify: true,
    data: { url: d.url || '/dashboard' },
  }))
})

// Toque na notificação: abre o app (ou foca a janela aberta) na página do lembrete
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const destino = new URL((e.notification.data && e.notification.data.url) || '/dashboard', self.location.origin).href
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) {
        await j.focus()
        if ('navigate' in j) await j.navigate(destino).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(destino)
  })())
})
