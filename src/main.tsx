import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// autoUpdate installs the new service worker and skipWaiting()s automatically,
// but the already-loaded page keeps the old cached assets until it reloads. Reload
// once when the fresh worker takes control so a deploy never leaves a stale UI on
// the user's device. Guarded against reload loops.
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
