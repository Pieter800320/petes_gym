import { useState } from 'react'
import { Sheet } from './Sheet'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { isNotifyUrl, pingNotify, saveNotifyUrl, useInvites, useNotifyUrl } from '../data/invites'

/**
 * The script Pete pastes into his own Google account (script.google.com). The questionnaire calls
 * its address when a client sends their answers; the script emails Pete. No client data is sent.
 */
const SCRIPT = `function doPost() {
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    "Pete's Gym: new fitness profile answers",
    "Someone has just sent their fitness profile.\\n\\nOpen Pete's Gym > Clients to add it:\\n${window.location.origin}${import.meta.env.BASE_URL}#/clients"
  );
  return ContentService.createTextOutput("ok");
}`

const STEPS = [
  'On a computer, open script.google.com and choose New project.',
  'Delete what is there, paste the script below, and save.',
  'Choose Deploy › New deployment › type “Web app”. Set “Execute as” to Me and “Who has access” to Anyone, then Deploy and allow access when asked.',
  'Copy the web app URL it shows (it ends in /exec) and paste it here.',
]

/** Email when a client sends the questionnaire: where the address of Pete's own script is kept. */
export function NotifySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Email when answers arrive">
      {open && <NotifyForm />}
    </Sheet>
  )
}

function NotifyForm() {
  const { user } = useAuth()
  const saved = useNotifyUrl()
  const invites = useInvites()
  const [typed, setTyped] = useState<string | null>(null)
  const url = typed ?? saved
  const valid = isNotifyUrl(url)
  if (!user) return null

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(SCRIPT)
      toast('Script copied')
    } catch {
      toast('Could not copy. Select the script and copy it by hand.')
    }
  }

  return (
    <div className="form">
      <p className="muted" style={{ margin: 0 }}>
        When a client sends the questionnaire, a small script in your own Google account emails you, so your phone tells you even when the app is closed. The email holds no client data. Set it up once:
      </p>
      <ol className="steps">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <pre className="code-block">{SCRIPT}</pre>
      <button type="button" className="text-link" onClick={copyScript}>Copy the script</button>

      <label className="field">
        <span className="label">Web app URL</span>
        <input
          id="notify-url"
          className="input mono"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://script.google.com/macros/s/…/exec"
          value={url}
          onChange={(e) => {
            setTyped(e.target.value)
            // Saved as soon as it is a usable address, or cleared when emptied.
            const next = e.target.value.trim()
            if (next === '' || isNotifyUrl(next)) saveNotifyUrl(user.uid, next, invites)
          }}
        />
        <span className="muted small">
          {url.trim() === '' ? 'Empty: no emails are sent.' : valid ? 'Saved. Every link that is not answered yet will email you, also the ones you sent earlier.' : 'This is not a Google script address (it starts with https://script.google.com/macros/ and ends in /exec).'}
        </span>
      </label>
      <p className="muted small" style={{ margin: 0 }}>Each link carries this address, so someone holding one of your links could make it send you this email. That is all it can do.</p>
      <button type="button" className="btn-acc" style={{ alignSelf: 'flex-start' }} disabled={!valid} onClick={() => { pingNotify(url); toast('Test sent. Check your email in a minute.') }}>Send a test email</button>
    </div>
  )
}
