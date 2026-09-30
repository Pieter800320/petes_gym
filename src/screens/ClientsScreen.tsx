import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClientSheet } from '../components/ClientSheet'
import { SettingsSheet } from '../components/SettingsSheet'
import { IconNote, IconSearch, IconSettings } from '../components/Icons'
import { ProfileLinkButton } from '../components/ProfileLinkButton'
import { useClients, useNotes } from '../data/store'
import type { Client } from '../data/types'
import { initials } from '../util/initials'

export function ClientsScreen() {
  const { data: clients, loading, error } = useClients()
  const { data: generalNotes } = useNotes(null)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState<null | 'client' | 'self'>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const self = clients.find((c) => c.isSelf)
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(
      (c) => !c.isSelf && c.archived === showArchived && (!q || `${c.name} ${c.goals} ${c.injuries}`.toLowerCase().includes(q)),
    )
  }, [clients, search, showArchived])
  const archivedCount = clients.filter((c) => c.archived).length

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="display">Clients</h1>
          <p className="sub">{loading ? 'Loading…' : `${clients.filter((c) => !c.isSelf && !c.archived).length} active`}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <button type="button" className="btn-acc" onClick={() => setAdding('client')}>
            + Client
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <IconSettings />
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div style={{ position: 'relative' }}>
        <span className="muted" style={{ position: 'absolute', left: 14, top: 13, width: 20, height: 20 }}>
          <IconSearch />
        </span>
        <input
          id="client-search"
          className="input search"
          style={{ paddingLeft: 44 }}
          placeholder="Search clients, goals, injuries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search clients"
        />
      </div>

      <div className="toolbar">
        <ProfileLinkButton />
        <Link to="/import-profiles" className="btn-ghost" style={{ textDecoration: 'none' }}>Import client profiles</Link>
      </div>

      <div className="list">
        <Link to="/notes" className="row-link">
          <div className="avatar" style={{ background: 'var(--color-raised)', color: 'var(--color-note)' }}>
            <span style={{ width: 22, height: 22 }}><IconNote /></span>
          </div>
          <div className="grow">
            <div className="title">General notes</div>
            <div className="meta">{generalNotes.length ? `${generalNotes.length} notes · latest: ${generalNotes[0].text}` : 'Notes not tied to a client'}</div>
          </div>
        </Link>

        {self ? (
          <ClientRow client={self} />
        ) : (
          !loading && (
            <button type="button" className="row-link" onClick={() => setAdding('self')}>
              <div className="avatar self">+</div>
              <div className="grow">
                <div className="title">Add your own profile</div>
                <div className="meta">Your own training works just like a client's</div>
              </div>
            </button>
          )
        )}
      </div>

      <div className="list">
        {visible.map((c) => (
          <ClientRow key={c.id} client={c} />
        ))}
      </div>

      {!loading && visible.length === 0 && (
        <div className="empty">
          {search ? (
            <>
              <h3 className="display">No matches</h3>
              <p>No client matches “{search}”.</p>
            </>
          ) : showArchived ? (
            <p>No archived clients.</p>
          ) : (
            <>
              <h3 className="display">No clients yet</h3>
              <p>Add your first client to keep their profile, notes and programmes together. Your existing programmes can be imported later.</p>
              <button type="button" className="btn-cta" onClick={() => setAdding('client')}>Add client</button>
            </>
          )}
        </div>
      )}

      <Link to="/import" className="btn-ghost" style={{ textDecoration: 'none' }}>Import old programmes</Link>

      {(archivedCount > 0 || showArchived) && (
        <button type="button" className="btn-ghost" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Show active clients' : `Show archived (${archivedCount})`}
        </button>
      )}

      <ClientSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        initial={adding === 'self' ? { name: 'Pete', isSelf: true } : undefined}
      />
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
