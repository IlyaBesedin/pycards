import { useEffect, useState } from 'react'
import { useApp } from './store/appStore'
import { Home } from './ui/Home'
import { Session } from './ui/Session'
import { History } from './ui/History'
import { Settings } from './ui/Settings'

type View = 'home' | 'session' | 'history' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('home')
  const theme = useApp((s) => s.persisted.settings.theme)

  // Apply the theme choice to the document root (system => no attribute).
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  switch (view) {
    case 'session':
      return <Session onExit={() => setView('home')} />
    case 'history':
      return <History onExit={() => setView('home')} />
    case 'settings':
      return <Settings onExit={() => setView('home')} />
    default:
      return <Home onStart={() => setView('session')} onOpen={(v) => setView(v)} />
  }
}
