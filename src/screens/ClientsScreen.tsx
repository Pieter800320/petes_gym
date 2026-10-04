import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconChevronRight, IconSearch } from '../components/Icons'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { deleteInvite, useInvites, type Invite } from '../data/invites'
import { KEEP_YEARS } from '../data/privacy'
import { useClients, useNotes, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'

// Shares its profile-merging code with the CSV import, which calls Claude: fetched with this page, not with the app.
const AnswersSheet = lazy(() => import('../components/AnswersSheet').then((m) => ({ default: m.AnswersSheet })))

/** A profile untouched for this long is past the storage period the privacy notice gives. */
const KEEP_MS = KEEP_YEARS * 365 * 86_400_000

function shortDate(ms: number): string {
  const d = new Date(ms)
  if (Date.now() - ms < 86_400_000 && d.getDate() === new Date().getDate()) return 'today'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Pete's own space (You, general notes) on a card at the top; clients as ruled lines below. */
export function ClientsScreen() {
  const { user } = useAuth()
  const { data: clients, loading, error } = useClients()
  const { data: deletedClients } = useClients(true)
  const { data: deletedProgrammes } = useProgrammes('all', true)
  const { data: programmes } = useProgrammes('all')
  const { data: generalNotes } = useNotes(null)
  const self = clients.find((c) => c.isSelf)
  const { data: myWorkouts } = useWorkouts(self ? { clientId: self.id } : null)
  const [search, setSearch] = useState('')
  const [newClient, setNewClient] = useState<null | 'client' | 'self'>(null)
  // Fitness Profile links: answered ones wait here to become profiles.
  const invites = useInvites()
  const answered = invites.filter((i) => i.answeredAt !== null)
  const waiting = invites.filter((i) => i.answeredAt === null)
  const [openAnswers, setOpenAnswers] = useState<Invite | null>(null)
  const [inactiveOnly, setInactiveOnly] = useState(false)
  /** When the page was opened: what "inactive" is measured against. */
  const [openedAt] = useState(() => Date.now())

  const others = useMemo(() => clients.filter((c) => !c.isSelf), [clients])
  /** Per client: the current programme and when any of its programmes last changed. */
  const byClient = useMemo(() => {
    const map = new Map<string, { current?: Programme; touched: number }>()
    for (const p of programmes) {
      const entry = map.get(p.clientId) ?? { touched: 0 }
      if (p.status === 'active' && !entry.current) entry.current = p
      entry.touched = Math.max(entry.touched, p.updatedAt)
      map.set(p.clientId, entry)
    }
    return map
  }, [programmes])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return others.filter((c) => !q || `${c.name} ${c.goals} ${c.injuries}`.toLowerCase().includes(q))
  }, [others, search])
  const currentOf = (id: string): Programme | undefined => byClient.get(id)?.current
  const lastTouched = (c: Client) => Math.max(c.updatedAt, byClient.get(c.id)?.touched ?? 0)
  // A reminder only: whether to delete them is Pete's decision, nothing is removed automatically.
  const inactive = others.filter((c) => openedAt - lastTouched(c) > KEEP_MS)
  const shown = inactiveOnly && inactive.length > 0 ? visible.filter((c) => inactive.includes(c)) : visible
  // Programmes deleted along with their client are counted under that client.
  const binCount = deletedClients.length + deletedProgrammes.filter((p) => !p.deletedWithClient).length
  const mine = self ? currentOf(self.id) : undefined

  return (
    <div className="screen has-dial">
      <TopBar overline={loading ? '' : `${others.length} CLIENT${others.length === 1 ? '' : 'S'}`} noteClientId={null} />
      <BigTitle text="Clients" />

      {error && <div className="banner error">{error}</div>}

      <div className="own-card">
        {self ? (
          <Link to={`/clients/${self.id}`} className="line-link">
            <span className="grow">
              <span className="line-title">You</span>
              <span className="line-meta">{[mine?.title ?? 'No current programme', myWorkouts.length ? `${myWorkouts.length} sessions` : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <IconChevronRight />
          </Link>
        ) : (
          !loading && (
            <button type="button" className="line-link" onClick={() => setNewClient('self')}>
              <span className="grow">
                <span className="line-title">You</span>
                <span className="line-meta">Add your own profile to train with the app</span>
              </span>
              <IconChevronRight />
            </button>
          )
        )}
        <Link to="/notes" className="line-link">
          <span className="grow">
            <span className="line-title">General notes</span>
            <span className="line-meta">{generalNotes.length ? `${generalNotes.length} note${generalNotes.length === 1 ? '' : 's'} · “${generalNotes[0].text}”` : 'Notes not tied to a client'}</span>
          </span>
          <IconChevronRight />
        </Link>
      </div>

      {answered.length > 0 && (
        <div className="lines">
          {answered.map((i) => (
            <button type="button" key={i.id} className="line-link answers-line" onClick={() => setOpenAnswers(i)}>
              <span className="grow">
                <span className="line-title">New answers from {String(i.answers?.name || i.name || 'a client')}</span>
                <span className="line-meta">Fitness profile · tap to add to their profile</span>
              </span>
              <IconChevronRight />
            </button>
          ))}
        </div>
      )}
      {waiting.length > 0 && user && (
        <details className="waiting-links">
          <summary className="muted small">{waiting.length} fitness profile link{waiting.length === 1 ? '' : 's'} sent, not answered yet</summary>
          {waiting.map((i) => (
            <div key={i.id} className="waiting-link">
              <span className="grow">{i.name || 'No name'} <span className="muted small">· sent {new Date(i.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></span>
              <ConfirmButton className="danger-link" armedLabel="Tap again to cancel" onConfirm={() => { deleteInvite(user.uid, i.id); toast('Link cancelled') }}>Cancel link</ConfirmButton>
            </div>
          ))}
        </details>
      )}

      <label className="search-line">
        <IconSearch />
        <input id="client-search" placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
      </label>
      <div className="lines">
        {shown.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="line-link">
            <span className="grow">
              <span className="line-title">{c.name}</span>
              <span className="line-meta">{currentOf(c.id)?.title ?? (c.questionnaire ? 'Questionnaire in' : c.goals || 'No programme yet')}</span>
            </span>
            <span className="mono muted small">{shortDate(lastTouched(c))}</span>
          </Link>
        ))}
        {!loading && search && !shown.length && <p className="muted small">No client matches “{search}”.</p>}
        {!loading && !search && !others.length && <p className="muted small">No clients yet. Tap ADD.</p>}
      </div>

      {inactive.length > 0 && !search && (
        <button type="button" className="text-link quiet" onClick={() => setInactiveOnly((on) => !on)}>
          {inactiveOnly ? 'Show all clients ›' : `${inactive.length} client${inactive.length === 1 ? '' : 's'} inactive for ${KEEP_YEARS}+ years: review ›`}
        </button>
      )}
      {binCount > 0 && !search && <Link to="/deleted" className="text-link quiet">Recently deleted ({binCount})</Link>}

      <Dial label="ADD" longLabel="Add client" ariaLabel="New client" onClick={() => setNewClient('client')} />
      <Suspense fallback={null}><AnswersSheet invite={openAnswers} onClose={() => setOpenAnswers(null)} /></Suspense>
      <ClientSheet open={newClient !== null} onClose={() => setNewClient(null)} initial={newClient === 'self' ? { name: 'Pete', isSelf: true } : undefined} />
    </div>
  )
}
