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

// Actively poll for a new deploy so the fix reaches the device without the user
// having to clear the cache manually: check on registration, whenever the tab is
// refocused, and every few minutes.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.addEventListener('online', check)
    setInterval(check, 5 * 60 * 1000)
  },
})
void updateSW

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
