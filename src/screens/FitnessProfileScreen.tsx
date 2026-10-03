/*
 * The Fitness Profile questionnaire a client fills in. Opened from a personal link, without an
 * account: it shows before the sign-in gate (App.tsx). The answers go into the link's invite and
 * turn up in Pete's app under Clients.
 */
import { useEffect, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { CONSENT_KEY, NONE, SECTIONS, UI, chosenOptions, isVisible, missingRequired, type Answer, type Answers, type Lang, type Question } from '../data/fitnessProfile'
import { pingNotify, readInvite, submitAnswers } from '../data/invites'
import { CONSENT, MIN_AGE, consentRecord, privacyNotice } from '../data/privacy'

/** Answers typed so far are kept on the device, so a reload or a phone call doesn't lose them. */
const draftKey = (token: string) => `pg_fit_${token}`
const LANG_KEY = 'pg_fit_lang'
const LANGS: { id: Lang; name: string }[] = [{ id: 'en', name: 'English' }, { id: 'de', name: 'Deutsch' }]

function loadDraft(token: string): Answers {
  try {
    return JSON.parse(localStorage.getItem(draftKey(token)) ?? '{}') as Answers
  } catch {
    return {}
  }
}

/** The language chosen before; else German on a German phone, English otherwise. */
function startLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'de') return saved
  } catch {
    // Storage blocked: fall through to the phone's language.
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

type Stage = 'loading' | 'form' | 'gone' | 'sent'

export function FitnessProfileScreen({ uid, token }: { uid: string; token: string }) {
  const [stage, setStage] = useState<Stage>('loading')
  const [lang, setLang] = useState<Lang>(startLang)
  const [firstName, setFirstName] = useState('')
  const [notifyUrl, setNotifyUrl] = useState('')
  const [answers, setAnswers] = useState<Answers>(() => loadDraft(token))
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const t = UI[lang]

  useEffect(() => {
    let cancelled = false
    readInvite(uid, token).then((invite) => {
      if (cancelled) return
      if (!invite) return setStage('gone')
      setFirstName(invite.name.split(/\s+/)[0] ?? '')
      setNotifyUrl(invite.notifyUrl)
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

  function chooseLang(next: Lang) {
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }

  const set = (id: string, value: Answer) => setAnswers((a) => ({ ...a, [id]: value }))
  const missing = missingRequired(answers, lang)
  // Below this age a parent has to consent, which a link can't establish.
  const tooYoung = Number.parseInt(String(answers.age ?? ''), 10) < MIN_AGE

  async function send() {
    setFailed(false)
    setSending(true)
    try {
      // Answers to questions that are no longer shown (a "yes" changed back to "no") stay behind.
      const visible = new Set(SECTIONS.flatMap((s) => s.questions).filter((q) => isVisible(q, answers)).map((q) => q.id))
      const kept = Object.fromEntries(Object.entries(answers).filter(([id]) => visible.has(id)))
      // Proof of consent (Art. 7(1) DSGVO): when, to which wording, in which language.
      await submitAnswers(uid, token, { ...kept, [CONSENT_KEY]: consentRecord(lang, Date.now()) })
      try {
        localStorage.removeItem(draftKey(token))
      } catch {
        // Nothing to clear.
      }
      pingNotify(notifyUrl)
      setStage('sent')
      window.scrollTo(0, 0)
    } catch (err) {
      console.error(err)
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  const langSwitch = (
    <div className="fit-lang" role="group" aria-label="Language / Sprache">
      {LANGS.map((l) => <button type="button" key={l.id} aria-pressed={lang === l.id} onClick={() => chooseLang(l.id)}>{l.name}</button>)}
    </div>
  )

  if (stage === 'loading') return <div className="center-screen"><span className="label">{t.loading}</span></div>

  if (stage === 'gone' || stage === 'sent') {
    return (
      <div className="center-screen">
        <div className="fit-page fit-end">
          {langSwitch}
          <h1 className="display">{stage === 'sent' ? t.thanksTitle : t.goneTitle}</h1>
          <p className="lead">{stage === 'sent' ? t.thanksText : t.goneText}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fit-page" lang={lang}>
      <header className="fit-head">
        <div className="fit-head-top">
          <span className="doc-eyebrow">{t.eyebrow}</span>
          {langSwitch}
        </div>
        <h1 className="display">{t.hello(firstName)}</h1>
        <p className="lead">{t.intro}</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title.en} className="fit-section">
          <h2 className="display">{section.title[lang]}</h2>
          {section.questions.filter((q) => isVisible(q, answers)).map((q) => (
            <Field key={q.id} q={q} lang={lang} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
          ))}
        </section>
      ))}

      <section className="fit-section">
        <div className="fit-consent-box">
          <label className="fit-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{CONSENT[lang]}</span>
          </label>
          <button type="button" className="text-link" onClick={() => setNoticeOpen(true)}>{t.privacy} ›</button>
        </div>
        {tooYoung && <div className="banner error">{t.under(MIN_AGE)}</div>}
        {failed && <div className="banner error">{t.sendError}</div>}
        <button type="button" className="btn-cta btn-block" disabled={sending || !consent || tooYoung || missing.length > 0} onClick={send}>
          {sending ? t.sending : t.send}
        </button>
        {missing.length > 0 && <p className="muted small">{t.needed}: {missing.join(', ')}.</p>}
      </section>

      <Sheet open={noticeOpen} onClose={() => setNoticeOpen(false)} title={t.privacy} tall>
        <div className="fit-notice" lang={lang}>
          {privacyNotice(lang).map((s) => (
            <section key={s.title}>
              <h3 className="label">{s.title}</h3>
              {s.paragraphs.filter(Boolean).map((text) => <p key={text} className="prose">{text}</p>)}
            </section>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function Field({ q, lang, value, onChange }: { q: Question; lang: Lang; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const label = <span className="fit-label">{q.label[lang]}{q.required && <span className="accent" aria-label="required"> *</span>}</span>

  if (!q.options) {
    const text = typeof value === 'string' ? value : ''
    return (
      <label className="field" data-q={q.id}>
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
  const chosen = chosenOptions(q, value)
  const pick = (id: string) => {
    if (q.type !== 'many') return onChange(chosen[0] === id ? '' : id)
    if (chosen.includes(id)) return onChange(chosen.filter((x) => x !== id))
    // "No preference" stands alone: it replaces the others, and any other choice replaces it.
    onChange(id === NONE ? [NONE] : [...chosen.filter((x) => x !== NONE), id])
  }
  return (
    <div className="field" role="group" aria-label={q.label[lang]} data-q={q.id}>
      {label}
      {q.type === 'many' && <span className="muted small">{UI[lang].chooseAll}</span>}
      <div className={q.inline ? 'fit-options inline' : 'fit-options'}>
        {q.options.map((opt) => (
          <button type="button" key={opt.id} className="fit-option" aria-pressed={chosen.includes(opt.id)} onClick={() => pick(opt.id)}>{opt.label[lang]}</button>
        ))}
      </div>
    </div>
  )
}
