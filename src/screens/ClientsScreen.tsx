import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { IconChevronRight, IconSearch } from '../components/Icons'
import { BigTitle, Dial, TopBar } from '../components/TopBar'
import { useClients, useNotes, useProgrammes, useWorkouts } from '../data/store'
import type { Client, Programme } from '../data/types'

function shortDate(ms: number): string {
  const d = new Date(ms)
  if (Date.now() - ms < 86_400_000 && d.getDate() === new Date().getDate()) return 'today'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Pete's own space (You, general notes) on a card at the top; clients as ruled lines below. */
export function ClientsScreen() {
  const { data: clients, loading, error } = useClients()
  const { data: deletedClients } = useClients(true)
  const { data: deletedProgrammes } = useProgrammes('all', true)
  const { data: programmes } = useProgrammes('all')
  const { data: generalNotes } = useNotes(null)
  const self = clients.find((c) => c.isSelf)
  const { data: myWorkouts } = useWorkouts(self ? { clientId: self.id } : null)
  const [search, setSearch] = useState('')
  const [newClient, setNewClient] = useState<null | 'client' | 'self'>(null)

  const others = clients.filter((c) => !c.isSelf)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return others.filter((c) => !q || `${c.name} ${c.goals} ${c.injuries}`.toLowerCase().includes(q))
  }, [others, search])
  const currentOf = (id: string): Programme | undefined => programmes.find((p) => p.clientId === id && p.status === 'active')
  const lastTouched = (c: Client) => Math.max(c.updatedAt, ...programmes.filter((p) => p.clientId === c.id).map((p) => p.updatedAt))
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

      <label className="search-line">
        <IconSearch />
        <input id="client-search" placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
      </label>
      <div className="lines">
        {visible.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="line-link">
            <span className="grow">
              <span className="line-title">{c.name}</span>
              <span className="line-meta">{currentOf(c.id)?.title ?? (c.questionnaire ? 'Questionnaire in' : c.goals || 'No programme yet')}</span>
            </span>
            <span className="mono muted small">{shortDate(lastTouched(c))}</span>
          </Link>
        ))}
        {!loading && search && !visible.length && <p className="muted small">No client matches “{search}”.</p>}
        {!loading && !search && !others.length && <p className="muted small">No clients yet. Tap ADD.</p>}
      </div>

      {binCount > 0 && !search && <Link to="/deleted" className="text-link quiet">Recently deleted ({binCount})</Link>}

      <Dial label="ADD" longLabel="Add client" ariaLabel="New client" onClick={() => setNewClient('client')} />
      <ClientSheet open={newClient !== null} onClose={() => setNewClient(null)} initial={newClient === 'self' ? { name: 'Pete', isSelf: true } : undefined} />
    </div>
  )
}
