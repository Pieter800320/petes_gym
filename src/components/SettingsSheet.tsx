import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackupSheet } from './BackupSheet'
import { ConfirmButton } from './ConfirmButton'
import { IconChevronRight } from './Icons'
import { NotifySheet } from './NotifySheet'
import { PlaybookSheet } from './PlaybookSheet'
import { Sheet } from './Sheet'
import { useAuth } from '../auth/useAuth'
import { UnsyncedChangesError } from '../firebase'
import { getApiKey, getHaptics, setApiKey, setHaptics, useTheme, type ThemeSetting } from '../settings'
import { canVibrate, haptic } from '../haptics'
import { formatUsd } from '../claude/cost'
import { useNotifyUrl } from '../data/invites'
import { readAllData, useCostLedger, type CostMonth } from '../data/store'
import { download } from '../export/share'
import { toast } from './toast'

const COST_LABELS = { create: 'Create', translate: 'German exports', import: 'Imports' } as const

/** After "some changes haven't synced", this long to tap once more and wipe anyway. */
const WIPE_ANYWAY_MS = 8000

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Paper' },
  { value: 'dark', label: 'Ink' },
]

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <SettingsForm onDone={onClose} />
    </Sheet>
  )
}

/** Settings is four groups, each a ruled heading over rows of one shape: a name, then its control. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h3 className="display">{title}</h3>
      {children}
    </section>
  )
}

/** A row that opens or does something. */
function ActionRow({ name, note, onClick, disabled }: { name: string; note: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="setting" onClick={onClick} disabled={disabled}>
      <span className="grow">
        <span className="setting-name">{name}</span>
        <span className="setting-note">{note}</span>
      </span>
      <IconChevronRight />
    </button>
  )
}

function CostRow({ label, month }: { label: string; month: CostMonth }) {
  const total = (month.create ?? 0) + (month.translate ?? 0) + (month.import ?? 0)
  const parts = (Object.keys(COST_LABELS) as (keyof typeof COST_LABELS)[])
    .filter((k) => (month[k] ?? 0) > 0)
    .map((k) => `${COST_LABELS[k]} ${formatUsd(month[k] ?? 0)}`)
  return (
    <div className="setting">
      <span className="grow">
        <span className="setting-name">{label}</span>
        {parts.length > 0 && <span className="setting-note">{parts.join(' · ')}</span>}
      </span>
      <b className="mono">{formatUsd(total)}</b>
    </div>
  )
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { user, signOut, signOutAndWipe } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const [vibrate, setVibrate] = useState(getHaptics)
  const [key, setKey] = useState(getApiKey)
  const [showKey, setShowKey] = useState(false)
  const [playbookOpen, setPlaybookOpen] = useState(false)
  const costs = useCostLedger()
  const [backingUp, setBackingUp] = useState(false)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const notifyUrl = useNotifyUrl()
  /** Sign out and remove everything: idle, at work, or stopped because changes haven't synced. */
  const [wipe, setWipe] = useState<'idle' | 'busy' | 'unsynced'>('idle')
  const wipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(wipeTimer.current), [])

  async function wipeDevice(force: boolean) {
    clearTimeout(wipeTimer.current)
    setWipe('busy')
    try {
      // Ends in a reload of the page.
      await signOutAndWipe(force)
    } catch (err) {
      if (err instanceof UnsyncedChangesError) {
        setWipe('unsynced')
        wipeTimer.current = setTimeout(() => setWipe('idle'), WIPE_ANYWAY_MS)
        return
      }
      console.error(err)
      setWipe('idle')
      toast('Could not remove the data. Try again.')
    }
  }

  /** One file with everything in the app, to keep somewhere safe. */
  async function backup() {
    if (!user) return
    setBackingUp(true)
    try {
      const data = await readAllData(user.uid)
      const day = new Date().toISOString().slice(0, 10)
      const body = JSON.stringify({ app: "Pete's Gym", version: __APP_VERSION__, exportedAt: new Date().toISOString(), account: user.email, data }, null, 1)
      download(new File([body], `petes-gym-backup-${day}.json`, { type: 'application/json' }))
      const count = (name: string) => Object.keys(data[name] ?? {}).length
      toast(`Backup saved: ${count('clients')} clients, ${count('programmes')} programmes`)
    } catch (err) {
      console.error(err)
      toast('Could not make the backup. Try again.')
    } finally {
      setBackingUp(false)
    }
  }

  return (
    <div className="settings">
      <Group title="This device">
        <div className="setting">
          <span className="setting-name grow">Theme</span>
          <div className="chips" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button type="button" key={t.value} className="chip" aria-pressed={theme === t.value} onClick={() => setTheme(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="grow">
            <span className="setting-name">Vibrate on tap</span>
            {!canVibrate && <span className="setting-note">This phone doesn’t let web apps vibrate (iPhones never do).</span>}
          </span>
          {canVibrate && (
            <div className="chips" role="group" aria-label="Vibrate on tap">
              {[true, false].map((on) => (
                <button type="button" key={String(on)} className="chip" aria-pressed={vibrate === on} data-haptic="none" onClick={() => { setHaptics(on); setVibrate(on); if (on) haptic() }}>
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          )}
        </div>
      </Group>

      <Group title="Claude">
        <div className="setting stack">
          <label className="setting-name" htmlFor="api-key">Anthropic API key</label>
          <div className="setting-key">
            <input
              id="api-key"
              className="input mono"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => {
                // Saved as you type or paste: closing the sheet can't lose it.
                setKey(e.target.value)
                setApiKey(e.target.value)
              }}
            />
            <button type="button" className="btn-ghost" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className="setting-note">{key.trim() ? 'Saved. ' : ''}Kept on this device only, so enter it once on each device.</span>
        </div>
        <CostRow label="Cost this month (USD)" month={costs.thisMonth} />
        <CostRow label="Cost last month (USD)" month={costs.lastMonth} />
        <ActionRow name="Coach Playbook" note="The standards Claude follows for every programme" onClick={() => setPlaybookOpen(true)} />
        <PlaybookSheet open={playbookOpen} onClose={() => setPlaybookOpen(false)} />
      </Group>

      <Group title="Your data">
        <ActionRow name="Backups" note="Made every week, the last three kept. Restore here." onClick={() => setBackupsOpen(true)} />
        <ActionRow name={backingUp ? 'Collecting…' : 'Download backup'} note="Everything in one file, to keep outside the app. Your Anthropic key is not in it." onClick={backup} disabled={backingUp} />
        <ActionRow name="Email when answers arrive" note={notifyUrl ? 'On: new questionnaire answers email you' : 'Off. Set up once, about ten minutes'} onClick={() => setNotifyOpen(true)} />
        <BackupSheet open={backupsOpen} onClose={() => setBackupsOpen(false)} />
        <NotifySheet open={notifyOpen} onClose={() => setNotifyOpen(false)} />
        <ActionRow name="Import old programmes" note="Word, PDF, HTML or photos" onClick={() => { onDone(); navigate('/import') }} />
        <ActionRow name="Import questionnaire answers" note="Older Fitness Profile responses from Google Forms" onClick={() => { onDone(); navigate('/import-profiles') }} />
      </Group>

      <Group title="Account">
        <div className="setting">
          <span className="grow">
            <span className="setting-name">{user?.email}</span>
            <span className="setting-note">Pete's Gym v{__APP_VERSION__}</span>
          </span>
          <button type="button" className="btn-ghost danger" onClick={() => { onDone(); signOut() }}>Sign out</button>
        </div>
        {/* For a borrowed computer: plain Sign out leaves the offline copy of every client on it. */}
        <div className="setting stack">
          {wipe === 'unsynced' ? (
            <>
              <span className="setting-note" role="alert">Some changes haven't synced yet. Connect first, or wipe anyway: those changes are then lost.</span>
              <button type="button" className="danger-link" data-haptic="strong" onClick={() => wipeDevice(true)}>Wipe anyway</button>
            </>
          ) : (
            <>
              <ConfirmButton className="text-link quiet" armedLabel="Tap again: removes all app data here" disabled={wipe === 'busy'} onConfirm={() => wipeDevice(false)}>
                {wipe === 'busy' ? 'Removing…' : 'Sign out and remove everything from this device'}
              </ConfirmButton>
              <span className="setting-note">For a computer that isn't yours. Nothing is deleted from your account; you'll enter the Anthropic key again.</span>
            </>
          )}
        </div>
      </Group>
    </div>
  )
}
