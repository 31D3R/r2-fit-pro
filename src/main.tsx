import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { iniciarInstalacao } from './lib/instalacao'

iniciarInstalacao()

// Depois de uma atualização do site, uma tela aberta pode pedir um arquivo antigo que não existe mais: recarrega uma vez
window.addEventListener('vite:preloadError', e => {
  try {
    if (sessionStorage.getItem('r2-recarregou') === '1') return
    sessionStorage.setItem('r2-recarregou', '1')
  } catch { /* sem armazenamento: recarrega mesmo assim */ }
  e.preventDefault()
  location.reload()
})
setTimeout(() => { try { sessionStorage.removeItem('r2-recarregou') } catch { /* nada */ } }, 15000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
