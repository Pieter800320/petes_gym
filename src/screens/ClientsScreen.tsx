import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { SettingsSheet } from '../components/SettingsSheet'
import { Sheet } from '../components/Sheet'
import { IconNote, IconSearch, IconSettings } from '../components/Icons'
import { shareProfileLink } from '../components/shareProfileLink'
import { useClients, useNotes, useProgrammes } from '../data/store'
import type { Client } from '../data/types'
import { initials } from '../util/initials'

export function ClientsScreen() {
  const navigate = useNavigate()
  const { data: clients, loading, error } = useClients()
  const { data: deletedClients } = useClients(true)
  const { data: deletedProgrammes } = useProgrammes('all', true)
  const { data: generalNotes } = useNotes(null)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newClient, setNewClient] = useState<null | 'client' | 'self'>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const self = clients.find((c) => c.isSelf)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => !c.isSelf && (!q || `${c.name} ${c.goals} ${c.injuries}`.toLowerCase().includes(q)))
  }, [clients, search])
  // Programmes deleted along with their client are counted under that client.
  const binCount = deletedClients.length + deletedProgrammes.filter((p) => !p.deletedWithClient).length

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="display">Clients</h1>
          <p className="sub">{loading ? 'Loading…' : `${clients.filter((c) => !c.isSelf).length} clients`}</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <IconSettings />
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="search-box">
        <span className="search-icon" aria-hidden="true"><IconSearch /></span>
        <input id="client-search" className="input search" style={{ paddingRight: 'var(--space-3)' }} placeholder="Search clients" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
      </div>

      <div className="list">
        <button type="button" className="new-slot" onClick={() => setAddOpen(true)}>
          <span className="new-slot-plus" aria-hidden="true">+</span> Add
        </button>

        {!search && (
          <Link to="/notes" className="row-link">
            <div className="avatar" style={{ background: 'var(--color-raised)', color: 'var(--color-note)' }}>
              <span style={{ width: 22, height: 22 }}><IconNote /></span>
            </div>
            <div className="grow">
              <div className="title">General notes</div>
              <div className="meta">{generalNotes.length ? `${generalNotes.length} notes · latest: ${generalNotes[0].text}` : 'Notes not tied to a client'}</div>
            </div>
          </Link>
        )}
        {self && !search && <ClientRow client={self} />}
        {visible.map((c) => <ClientRow key={c.id} client={c} />)}
      </div>

      {!loading && search && !visible.length && <p className="muted" style={{ margin: 0 }}>No client matches “{search}”.</p>}

      {binCount > 0 && (
        <Link to="/deleted" className="btn-ghost" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
          Recently deleted ({binCount})
        </Link>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add">
        <div className="list">
          <AddOption title="New client" meta="Type in their details yourself" onClick={() => { setAddOpen(false); setNewClient('client') }} />
          <AddOption title="Send fitness profile link" meta="The client fills in your questionnaire (WhatsApp)" onClick={() => shareProfileLink()} />
          <AddOption title="Import questionnaire answers" meta="From your Google Forms responses" onClick={() => navigate('/import-profiles')} />
          <AddOption title="Import old programmes" meta="Word, PDF, HTML or photos" onClick={() => navigate('/import')} />
          {!self && <AddOption title="Your own profile" meta="Your training works just like a client's" onClick={() => { setAddOpen(false); setNewClient('self') }} />}
        </div>
      </Sheet>

      <ClientSheet open={newClient !== null} onClose={() => setNewClient(null)} initial={newClient === 'self' ? { name: 'Pete', isSelf: true } : undefined} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

function AddOption({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="row-link" onClick={onClick}>
      <div className="grow">
        <div className="title">{title}</div>
        <div className="meta">{meta}</div>
      </div>
    </button>
  )
}

function ClientRow({ client }: { client: Client }) {
  const meta = [client.frequency, client.injuries].filter(Boolean).join(' · ') || client.goals || 'No details yet'
  return (
    <Link to={`/clients/${client.id}`} className="row-link">
      <div className={`avatar${client.isSelf ? ' self' : ''}`}>{initials(client.name)}</div>
      <div className="grow">
        <div className="title">
          {client.name}
          {client.isSelf && <span className="tag accent" style={{ marginLeft: 8 }}>ME</span>}
        </div>
        <div className="meta">{meta}</div>
      </div>
    </Link>
  )
}
