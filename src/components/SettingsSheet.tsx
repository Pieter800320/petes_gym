import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaybookSheet } from './PlaybookSheet'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { getApiKey, setApiKey, useTheme, type ThemeSetting } from '../settings'

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <SettingsForm onDone={onClose} />
    </Sheet>
  )
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [key, setKey] = useState(getApiKey)
  const [showKey, setShowKey] = useState(false)
  const [playbookOpen, setPlaybookOpen] = useState(false)
  const savedKey = getApiKey()

  return (
    <div className="form">
      <div className="field">
        <span className="label">Theme</span>
        <div className="chips" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button type="button" key={t.value} className="chip" aria-pressed={theme === t.value} onClick={() => setTheme(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="api-key">Anthropic API key</label>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            id="api-key"
            className="input mono"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="button" className="btn-ghost" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <span className="muted" style={{ fontSize: 'var(--type-sm)' }}>
          Stored on this device only. It is never synced or uploaded, so enter it once on each device.
        </span>
        <button
          type="button"
          className="btn-acc"
          disabled={key.trim() === savedKey}
          onClick={() => {
            setApiKey(key)
            toast(key.trim() ? 'API key saved on this device' : 'API key removed')
          }}
        >
          Save key
        </button>
      </div>

      <div className="field">
        <span className="label">Claude</span>
        <button type="button" className="row-link" onClick={() => setPlaybookOpen(true)}>
          <div className="grow">
            <div className="title">Coach Playbook</div>
            <div className="meta">The standards Claude follows for every programme</div>
          </div>
        </button>
        <PlaybookSheet open={playbookOpen} onClose={() => setPlaybookOpen(false)} />
      </div>

      <div className="field">
        <span className="label">Import</span>
        <div className="list">
          <button type="button" className="row-link" onClick={() => { onDone(); navigate('/import-profiles') }}>
            <div className="grow">
              <div className="title">Import questionnaire answers</div>
              <div className="meta">Fitness Profile responses from Google Forms</div>
            </div>
          </button>
          <button type="button" className="row-link" onClick={() => { onDone(); navigate('/import') }}>
            <div className="grow">
              <div className="title">Import old programmes</div>
              <div className="meta">Word, PDF, HTML or photos</div>
            </div>
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">Account</span>
        <span>{user?.email}</span>
        <button
          type="button"
          className="btn-ghost danger"
          style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
          onClick={() => {
            onDone()
            signOut()
          }}
        >
          Sign out
        </button>
      </div>
      <span className="muted mono" style={{ fontSize: 'var(--type-xs)' }}>Pete's Gym v{__APP_VERSION__}</span>
    </div>
  )
}
