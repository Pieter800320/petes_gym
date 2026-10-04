import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { ConfirmButton } from '../components/ConfirmButton'
import { ExportSheet } from '../components/ExportSheet'
import { IconMore } from '../components/Icons'
import { NoteSheet } from '../components/NoteSheet'
import { PinnedNotes } from '../components/PinnedNotes'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { BigTitle, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useProfileLink } from '../components/useProfileLink'
import { useAuth } from '../auth/useAuth'
import { activateProgramme, createNextBlock } from '../data/programmeActions'
import { blankProgramme, sessionRows } from '../data/programmeUtils'
import { createProgramme, deleteClient, deleteWorkout, useClients, useNotes, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Note, Programme } from '../data/types'
import { splitDayTitle } from '../util/dayTitle'
import { leaveFor } from '../util/navHistory'

const DETAIL_FIELDS = [
  { key: 'goals', label: 'Goals' },
  { key: 'injuries', label: 'Injuries & limitations' },
  { key: 'equipment', label: 'Equipment & environment' },
  { key: 'background', label: 'Background' },
] as const

const monthYear = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
/** A programme's date: its start date, else when it was made (imports are dated by their file). */
const programmeDate = (p: Programme) => (p.startDate ? Date.parse(p.startDate) : p.createdAt)
const newestFirst = (a: Programme, b: Programme) => programmeDate(b) - programmeDate(a)

/**
 * The programme the client page leads with: the current one; else the latest finished one
 * (archived or imported); else the latest draft. Null only when the client has no programmes.
 */
function featuredProgramme(programmes: Programme[]): Programme | null {
  const sorted = [...programmes].sort(newestFirst)
  return sorted.find((p) => p.status === 'active') ?? sorted.find((p) => p.status === 'archived') ?? sorted.find((p) => p.status === 'draft') ?? null
}

export function ClientScreen() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients, loading } = useClients()
  const { data: notes } = useNotes(id ?? null)
  const { data: programmes } = useProgrammes(id ?? '__none__')
  const { data: workouts } = useWorkouts(id ? { clientId: id } : null)
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [noteSheet, setNoteSheet] = useState<Note | null>(null)
  const [showSessions, setShowSessions] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const client = clients.find((c) => c.id === id)
  const profileLink = useProfileLink(client?.id ?? null, client?.name ?? '')

  if (!client || !user) {
    return (
      <div className="screen">
        <TopBar back={{ to: '/clients', label: 'Clients' }} />
        {!loading && <p className="lead">This profile isn't here. It may be in Recently deleted, at the bottom of the Clients tab.</p>}
      </div>
    )
  }

  const self = client.isSelf
  const firstName = client.name.trim().split(/\s+/)[0]
  const featured = featuredProgramme(programmes)
  const current = featured?.status === 'active' ? featured : null
  const earlier = programmes.filter((p) => p !== featured)
  const details = DETAIL_FIELDS.filter((f) => client[f.key].trim())
  const hours = workouts.reduce((n, w) => n + w.durationSec, 0) / 3600
  const meta = self ? 'Your own training' : [firstLine(client.goals), client.frequency, firstLine(client.injuries)].filter(Boolean).join(' · ')

  return (
    <div className="screen">
      <TopBar
        back={{ to: '/clients', label: 'Clients' }}
        noteClientId={client.id}
        actions={<button type="button" className="icon-btn" aria-label={`More for ${client.name}`} onClick={() => setMenuOpen(true)}><IconMore /></button>}
      />
      <BigTitle text={self ? 'You' : client.name} />
      {meta && <p className="lead">{meta}</p>}

      <PinnedNotes clientId={client.id} />

      {featured ? (
        <ProgrammeCard
          programme={featured}
          eyebrow={
            featured.status === 'active'
              ? `Current · since ${dayMonth(featured.startDate ? Date.parse(featured.startDate) : featured.updatedAt)}`
              : featured.status === 'archived'
                ? `Last programme · ${monthYear(programmeDate(featured))}`
                : `Draft · started ${dayMonth(featured.createdAt)}`
          }
          onOpen={() => navigate(featured.status === 'draft' ? `/create/${featured.id}` : `/programmes/${featured.id}`)}
        />
      ) : (
        <button type="button" className="empty-card" onClick={() => setNewOpen(true)}>
          <span className="line-title">No programmes yet</span>
          <span className="text-link">+ New programme</span>
        </button>
      )}

      {/* A pair of rectangles: the main action in red, the second one outlined. Pete's own page has
          none (Train is a tab away, and the programme page has the rest). */}
      {featured?.status === 'active' && !self && (
        <div className="button-pair">
          <button type="button" className="btn-cta" onClick={() => setExportOpen(true)}>Send to {firstName}</button>
          <Link to={`/create/${featured.id}`} className="btn-outline">Rework with Claude</Link>
        </div>
      )}
      {featured?.status === 'archived' && (
        <div className="button-pair">
          <button type="button" className="btn-cta" onClick={() => { activateProgramme(user.uid, featured, programmes); toast('Now the current programme') }}>Make current</button>
          <button type="button" className="btn-outline" onClick={() => navigate(`/create/${createNextBlock(user.uid, featured)}`)}>Build next block</button>
        </div>
      )}
      {featured?.status === 'draft' && (
        <Link to={`/create/${featured.id}`} className="btn-cta btn-block">Continue in Create</Link>
      )}

      {workouts.length > 0 && (
        <>
          <button type="button" className="line-link" onClick={() => setShowSessions(!showSessions)} aria-expanded={showSessions}>
            <span className="grow">
              <span className="line-title">Sessions</span>
              <span className="line-meta">{workouts.length} session{workouts.length === 1 ? '' : 's'} · {hours.toFixed(hours < 10 ? 1 : 0)} h trained</span>
            </span>
            <span className="mono muted">{showSessions ? '−' : '›'}</span>
          </button>
          {showSessions && (
            <div className="session-lines">
              {workouts.map((w) => (
                <SwipeRow key={w.id} onDelete={() => { deleteWorkout(user.uid, w.id); toast('Session deleted') }}>
                  <div className="session-line">
                    <span>{new Date(w.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="grow">{w.sessionTitle || 'Session'}</span>
                    <span className="mono">{Math.max(1, Math.round(w.durationSec / 60))} min</span>
                  </div>
                </SwipeRow>
              ))}
              <p className="muted small"><span className="swipe-hint-touch">Swipe a session to the left to delete it.</span><span className="swipe-hint-pointer">Point at a session and click the bin to delete it.</span></p>
            </div>
          )}
        </>
      )}

      {earlier.length > 0 && (
        <>
          <div className="section-label">Earlier</div>
          <div className="lines">
            {[...earlier].sort(newestFirst).map((p) => (
              <Link key={p.id} to={p.status === 'draft' ? `/create/${p.id}` : `/programmes/${p.id}`} className="leader-link">
                <span>{p.title}{p.status === 'draft' && <span className="tag accent">Draft</span>}</span>
                <span className="ex-dots" aria-hidden="true" />
                <span className="mono muted small">{monthYear(programmeDate(p))}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {notes.length > 0 && (
        <>
          <div className="section-label">Notes</div>
          <div className="stack">
            {notes.map((n) => (
              <button type="button" key={n.id} className="note-line" onClick={() => setNoteSheet(n)}>
                {n.text} <span className="muted">· {dayMonth(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button type="button" className="text-link about-link" onClick={() => setShowAbout(!showAbout)} aria-expanded={showAbout}>
        {self ? 'About you' : `About ${firstName}`} {showAbout ? '−' : '›'}
      </button>
      {showAbout && (
        <div className="about">
          {details.length ? (
            details.map((f) => (
              <div key={f.key}>
                <div className="label">{f.label}</div>
                <p className="prose">{client[f.key]}</p>
              </div>
            ))
          ) : (
            <p className="muted small">No details yet. Use ⋯ → Edit profile{self ? '' : `, or send ${firstName} your fitness profile link`}.</p>
          )}
          {client.questionnaire && (
            <details>
              <summary className="label">Questionnaire answers{client.questionnaireDate ? ` · ${client.questionnaireDate}` : ''}</summary>
              <p className="prose small">{client.questionnaire}</p>
            </details>
          )}
        </div>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={self ? 'You' : client.name}>
        <div className="lines">
          <MenuLine title="Edit profile" meta="Goals, injuries, equipment, background" onClick={() => { setMenuOpen(false); setEditing(true) }} />
          <MenuLine title="New programme" meta="With Claude, or blank" onClick={() => { setMenuOpen(false); setNewOpen(true) }} />
          {!self && (
            <MenuLine
              title={profileLink.status === 'ready' ? 'Share link ›' : 'Send fitness profile link'}
              meta={profileLink.status === 'preparing' ? 'Preparing link…' : profileLink.status === 'ready' ? `The link is ready: tap to send it to ${firstName}` : `WhatsApp ${firstName} your questionnaire`}
              onClick={profileLink.tap}
            />
          )}
          <ConfirmButton
            className="danger-link"
            onConfirm={() => {
              deleteClient(user.uid, client.id)
              toast(`${client.name} moved to Recently deleted`)
              leaveFor(navigate, '/clients')
            }}
          >
            Delete {self ? 'my profile' : client.name}
          </ConfirmButton>
        </div>
      </Sheet>

      <NewProgrammeSheet open={newOpen} onClose={() => setNewOpen(false)} client={client} />
      <ClientSheet open={editing} onClose={() => setEditing(false)} client={client} />
      <NoteSheet open={noteSheet !== null} onClose={() => setNoteSheet(null)} note={noteSheet ?? undefined} defaultClientId={client.id} />
      {current && <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} programme={current} client={client} />}
    </div>
  )
}

/** First sentence or clause of a free-text field, for the one-line summary under the name. */
function firstLine(text: string): string {
  const t = text.trim().split(/\n|[.;]\s/)[0]
  return t.length > 40 ? `${t.slice(0, 38)}…` : t
}

/** The client's lead programme as a small paper card — the document the client has. */
function ProgrammeCard({ programme: p, eyebrow, onOpen }: { programme: Programme; eyebrow: string; onOpen: () => void }) {
  return (
    <div className="paper-card">
      <span className="paper-eyebrow">{eyebrow}</span>
      <button type="button" className="paper-title display" onClick={onOpen}>{p.title}</button>
      <div className="paper-days">
        {p.sessions.map((s, i) => {
          const { main, extra } = splitDayTitle(s.title, i)
          return (
            <button type="button" key={s.id} className="paper-day" onClick={onOpen}>
              <span className="paper-num display">{String(i + 1).padStart(2, '0')}</span>
              <span className="grow">{main}{extra ? ` ${extra}` : ''}</span>
              <span className="mono small">{sessionRows(s).length}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MenuLine({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="line-link" onClick={onClick}>
      <span className="grow">
        <span className="line-title">{title}</span>
        <span className="line-meta">{meta}</span>
      </span>
    </button>
  )
}

function NewProgrammeSheet({ open, onClose, client }: { open: boolean; onClose: () => void; client: Client }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const create = (withClaude: boolean) => {
    if (!user) return
    const id = createProgramme(user.uid, blankProgramme(client.id, { frequency: client.frequency, sessionLength: client.sessionLength, goal: client.goals }))
    onClose()
    navigate(withClaude ? `/create/${id}` : `/programmes/${id}`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="New programme">
      <div className="lines">
        <MenuLine title="Build with Claude" meta="Chat it through; Claude drafts and edits it" onClick={() => create(true)} />
        <MenuLine title="Blank programme" meta="Type it in yourself" onClick={() => create(false)} />
      </div>
    </Sheet>
  )
}
