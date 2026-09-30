import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { SettingsSheet } from '../components/SettingsSheet'
import { IconNote, IconSearch, IconSettings } from '../components/Icons'
import { useClients, useNotes, useProgrammes } from '../data/store'
import type { Client } from '../data/types'
import { initials } from '../util/initials'

/**
 * Two groups: Pete's own space (his profile and general notes) at the top, then his clients.
 * Adding a client is the one dashed slot; imports live in Settings.
 */
export function ClientsScreen() {
  const { data: clients, loading, error } = useClients()
  const { data: deletedClients } = useClients(true)
  const { data: deletedProgrammes } = useProgrammes('all', true)
  const { data: generalNotes } = useNotes(null)
  const [search, setSearch] = useState('')
  const [newClient, setNewClient] = useState<null | 'client' | 'self'>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const self = clients.find((c) => c.isSelf)
  const others = clients.filter((c) => !c.isSelf)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return others.filter((c) => !q || `${c.name} ${c.goals} ${c.injuries}`.toLowerCase().includes(q))
  }, [others, search])
  // Programmes deleted along with their client are counted under that client.
  const binCount = deletedClients.length + deletedProgrammes.filter((p) => !p.deletedWithClient).length

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="display">Clients</h1>
          <p className="sub">{loading ? 'Loading…' : `${others.length} client${others.length === 1 ? '' : 's'}`}</p>
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

      {/* Pete's own space */}
      {!search && (
        <div className="list">
          {self ? (
            <ClientRow client={self} />
          ) : (
            !loading && (
              <button type="button" className="new-slot" onClick={() => setNewClient('self')}>
                <span className="new-slot-plus" aria-hidden="true">+</span> Your own profile
              </button>
            )
          )}
          <Link to="/notes" className="row-link">
            <div className="avatar" style={{ background: 'var(--color-raised)', color: 'var(--color-note)' }}>
              <span style={{ width: 22, height: 22 }}><IconNote /></span>
            </div>
            <div className="grow">
              <div className="title">General notes</div>
              <div className="meta">{generalNotes.length ? `${generalNotes.length} notes · latest: ${generalNotes[0].text}` : 'Notes not tied to a client'}</div>
            </div>
          </Link>
        </div>
      )}

      {/* Clients */}
      <div className="group-title"><span className="label">Clients</span></div>
      <div className="list">
        {!search && (
          <button type="button" className="new-slot" onClick={() => setNewClient('client')}>
            <span className="new-slot-plus" aria-hidden="true">+</span> New client
          </button>
        )}
        {visible.map((c) => <ClientRow key={c.id} client={c} />)}
      </div>
      {!loading && search && !visible.length && <p className="muted" style={{ margin: 0 }}>No client matches “{search}”.</p>}

      {binCount > 0 && !search && (
        <Link to="/deleted" className="btn-ghost" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
          Recently deleted ({binCount})
        </Link>
      )}

      <ClientSheet open={newClient !== null} onClose={() => setNewClient(null)} initial={newClient === 'self' ? { name: 'Pete', isSelf: true } : undefined} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
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
