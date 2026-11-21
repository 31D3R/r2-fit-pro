// Service worker: instalar na tela inicial, receber lembretes e abrir sem internet.
// Com internet, as páginas vêm sempre do site (versão mais nova) e uma cópia fica guardada;
// sem internet, abre a cópia. Arquivos com nome versionado (/assets), ícones, vozes e animações ficam guardados ao usar.
const CACHE = 'r2-app-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
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
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), 4000)
        const r = await fetch(req, { signal: ctl.signal })
        clearTimeout(t)
        if (r.ok) cache.put('/index.html', r.clone())
        return r
      } catch {
        return (await cache.match('/index.html')) || Response.error()
      }
    })())
    return
  }
  // Arquivos do app: do aparelho quando já tem, senão da rede (e guarda)
  if (guardavel(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const tem = await cache.match(req)
      if (tem) return tem
      const r = await fetch(req)
      if (r.ok && r.status === 200 && Number(r.headers.get('content-length') || 0) < 5000000) cache.put(req, r.clone())
      return r
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
