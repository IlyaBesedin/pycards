import { useRef, useState } from 'react'
import { useApp } from '../store/appStore'
import { maturity } from '../domain/scheduler'

export function Settings({ onExit }: { onExit: () => void }) {
  const persisted = useApp((s) => s.persisted)
  const update = useApp((s) => s.updateSettings)
  const reset = useApp((s) => s.resetProgress)
  const exportData = useApp((s) => s.exportData)
  const importData = useApp((s) => s.importData)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const buckets = { new: 0, learning: 0, young: 0, mature: 0 }
  for (const p of Object.values(persisted.progress)) buckets[maturity(p)]++
  const acc = persisted.stats.firstTryTotal
    ? Math.round((persisted.stats.firstTryCorrect / persisted.stats.firstTryTotal) * 100)
    : 0

  const doExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pycards-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = (file: File) => {
    file.text().then((text) => {
      setMsg(importData(text) ? 'Imported.' : 'Import failed — invalid file.')
    })
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="iconbtn" onClick={onExit}>Back</button>
        <h1 style={{ marginLeft: 8 }}>Settings</h1>
      </div>
      <div className="content">
        <div className="statgrid">
          <div className="stat"><div className="n">{buckets.new}</div><div className="l">new</div></div>
          <div className="stat"><div className="n">{buckets.learning}</div><div className="l">learning</div></div>
          <div className="stat"><div className="n">{buckets.young}</div><div className="l">young (&lt;21d)</div></div>
          <div className="stat"><div className="n">{buckets.mature}</div><div className="l">mature (≥21d)</div></div>
          <div className="stat"><div className="n">{acc}%</div><div className="l">first-try accuracy</div></div>
          <div className="stat"><div className="n">{persisted.lifetimeScore}</div><div className="l">lifetime score</div></div>
        </div>

        <div className="field">
          <label htmlFor="npd">New cards per day</label>
          <input
            id="npd"
            type="number"
            min={5}
            max={100}
            value={persisted.settings.newPerDay}
            onChange={(e) => update({ newPerDay: Math.max(5, Math.min(100, Number(e.target.value) || 20)) })}
          />
          <span className="small muted">Anki's default is 20. Higher means more reviews later.</span>
        </div>

        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={persisted.settings.theme}
            onChange={(e) => update({ theme: e.target.value as 'system' | 'dark' | 'light' })}
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className="field">
          <label>Backup</label>
          <span className="small muted">Progress lives in this browser. Export a file to back it up.</span>
          <div className="btnrow" style={{ marginTop: 6 }}>
            <button className="btn ghost" onClick={doExport}>Export</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import</button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f) }}
          />
          {msg && <span className="small muted">{msg}</span>}
        </div>

        <div className="field">
          <label>Danger zone</label>
          <button
            className="btn red"
            onClick={() => { if (confirm('Erase all progress and history? This cannot be undone.')) { reset(); setMsg('Progress reset.') } }}
          >
            Reset all progress
          </button>
        </div>

        <div className="small muted center" style={{ marginTop: 12 }}>
          pycards · <a href="https://github.com/IlyaBesedin/pycards" target="_blank" rel="noreferrer">source</a>
        </div>
      </div>
    </div>
  )
}
