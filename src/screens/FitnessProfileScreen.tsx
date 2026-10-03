/*
 * The Fitness Profile questionnaire a client fills in. Opened from a personal link, without an
 * account: it shows before the sign-in gate (App.tsx). The answers go into the link's invite and
 * turn up in Pete's app under Clients.
 */
import { useEffect, useState } from 'react'
import { INTRO, SECTIONS, missingRequired, type Answers, type Question } from '../data/fitnessProfile'
import { readInvite, submitAnswers } from '../data/invites'

/** Answers typed so far are kept on the device, so a reload or a phone call doesn't lose them. */
const draftKey = (token: string) => `pg_fit_${token}`

function loadDraft(token: string): Answers {
  try {
    return JSON.parse(localStorage.getItem(draftKey(token)) ?? '{}') as Answers
  } catch {
    return {}
  }
}

type Stage = 'loading' | 'form' | 'gone' | 'sent'

export function FitnessProfileScreen({ uid, token }: { uid: string; token: string }) {
  const [stage, setStage] = useState<Stage>('loading')
  const [firstName, setFirstName] = useState('')
  const [answers, setAnswers] = useState<Answers>(() => loadDraft(token))
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readInvite(uid, token).then((invite) => {
      if (cancelled) return
      if (!invite) return setStage('gone')
      setFirstName(invite.name.split(/\s+/)[0] ?? '')
      // The name Pete typed is offered as the first answer; the client can change it.
      setAnswers((a) => (a.name || !invite.name ? a : { ...a, name: invite.name }))
      setStage('form')
    })
    return () => {
      cancelled = true
    }
  }, [uid, token])

  useEffect(() => {
    if (stage !== 'form') return
    try {
      localStorage.setItem(draftKey(token), JSON.stringify(answers))
    } catch {
      // Storage blocked: the form still works, it just can't survive a reload.
    }
  }, [answers, stage, token])

  const set = (id: string, value: Answers[string]) => setAnswers((a) => ({ ...a, [id]: value }))
  const missing = missingRequired(answers)

  async function send() {
    setError(null)
    setSending(true)
    try {
      await submitAnswers(uid, token, answers)
      try {
        localStorage.removeItem(draftKey(token))
      } catch {
        // Nothing to clear.
      }
      setStage('sent')
      window.scrollTo(0, 0)
    } catch (err) {
      console.error(err)
      setError('Your answers could not be sent. Check your internet connection and try again; nothing you typed is lost.')
    } finally {
      setSending(false)
    }
  }

  if (stage === 'loading') return <div className="center-screen"><span className="label">Loading…</span></div>

  if (stage === 'gone' || stage === 'sent') {
    return (
      <div className="center-screen">
        <div className="fit-page fit-end">
          <h1 className="display">{stage === 'sent' ? 'Thank you!' : 'This link can no longer be used'}</h1>
          <p className="lead">
            {stage === 'sent'
              ? 'Your answers are with Pieter. He will use them to design your training programme. You can close this page.'
              : 'It has either been filled in already or is no longer active. If you still need to send your answers, ask Pieter for a new link.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fit-page">
      <header className="fit-head">
        <span className="doc-eyebrow">Fitness profile</span>
        <h1 className="display">{firstName ? `Hi ${firstName}, my name is Pieter!` : 'Hi, my name is Pieter!'}</h1>
        <p className="lead">{INTRO}</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="fit-section">
          <h2 className="display">{section.title}</h2>
          {section.questions.map((q) => <Field key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />)}
        </section>
      ))}

      <section className="fit-section">
        <label className="fit-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree that Pieter stores these answers, including what I wrote about my health, to design my training programme. I can ask him to delete them at any time.</span>
        </label>
        {error && <div className="banner error">{error}</div>}
        <button type="button" className="btn-cta btn-block" disabled={sending || !consent || missing.length > 0} onClick={send}>
          {sending ? 'Sending…' : 'Send to Pieter'}
        </button>
        {missing.length > 0 && <p className="muted small">Still needed: {missing.join(', ')}.</p>}
      </section>
    </div>
  )
}

function Field({ q, value, onChange }: { q: Question; value: Answers[string] | undefined; onChange: (v: Answers[string]) => void }) {
  const label = <span className="fit-label">{q.label}{q.required && <span className="accent" aria-label="required"> *</span>}</span>

  if (q.type === 'text' || q.type === 'long') {
    const text = typeof value === 'string' ? value : ''
    return (
      <label className="field">
        {label}
        {q.type === 'text' ? (
          <input id={`fit-${q.id}`} className="input" value={text} inputMode={q.numeric ? 'numeric' : undefined} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <textarea id={`fit-${q.id}`} className="textarea" value={text} onChange={(e) => onChange(e.target.value)} />
        )}
      </label>
    )
  }

  // Choices: one answer, or any number of them.
  const chosen = Array.isArray(value) ? value : value ? [value] : []
  const pick = (option: string) => {
    if (q.type === 'one') onChange(chosen[0] === option ? '' : option)
    else onChange(chosen.includes(option) ? chosen.filter((x) => x !== option) : [...chosen, option])
  }
  return (
    <div className="field" role="group" aria-label={q.label}>
      {label}
      {q.type === 'many' && <span className="muted small">Choose all that apply.</span>}
      <div className="fit-options">
        {q.options?.map((option) => (
          <button type="button" key={option} className="fit-option" aria-pressed={chosen.includes(option)} onClick={() => pick(option)}>{option}</button>
        ))}
      </div>
    </div>
  )
}
