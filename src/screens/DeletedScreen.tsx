import { ConfirmButton } from '../components/ConfirmButton'
import { BigTitle, TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { scrubDeleted } from '../data/backups'
import { purgeClient, purgeProgramme, restoreClient, restoreProgramme, useClients, useProgrammes } from '../data/store'

/** Recently deleted clients and programmes: restore them, or delete them forever. */
export function DeletedScreen() {
  const { user } = useAuth()
  const { data: deletedClients, loading } = useClients(true)
  const { data: allClients } = useClients()
  const { data: deletedProgrammes } = useProgrammes('all', true)
  if (!user) return null
  const uid = user.uid

  // Programmes deleted with their client come back with the client, so they're listed under it.
  const loose = deletedProgrammes.filter((p) => !p.deletedWithClient)
  const clientName = (id: string) => [...allClients, ...deletedClients].find((c) => c.id === id)?.name ?? 'Unknown client'
  const when = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')

  return (
    <div className="screen">
      <TopBar back={{ to: '/clients', label: 'Clients' }} />
      <BigTitle text="Recently deleted" />
      <p className="lead">Restore puts things back exactly as they were.</p>

      {!loading && !deletedClients.length && !loose.length && <p className="muted" style={{ margin: 0 }}>Nothing here.</p>}

      {deletedClients.length > 0 && <div className="section-title"><span className="label">Clients</span></div>}
      <div className="list">
        {deletedClients.map((c) => {
          const count = deletedProgrammes.filter((p) => p.clientId === c.id && p.deletedWithClient).length
          return (
            <div key={c.id} className="card deleted-item">
              <div>
                <div className="title" style={{ fontWeight: 600 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>Deleted {when(c.deletedAt)}{count ? ` · with ${count} programme${count > 1 ? 's' : ''}` : ''}, plus notes and sessions</div>
              </div>
              <div className="toolbar">
                <button type="button" className="btn-acc" onClick={() => { restoreClient(uid, c.id); toast(`${c.name} restored`) }}>Restore</button>
                <ConfirmButton onConfirm={() => { purgeClient(uid, c.id); scrubDeleted(uid, { clientIds: [c.id], programmeIds: [] }); toast(`${c.name} deleted forever`) }}>Delete forever</ConfirmButton>
              </div>
            </div>
          )
        })}
      </div>

      {loose.length > 0 && <div className="section-title"><span className="label">Programmes</span></div>}
      <div className="list">
        {loose.map((p) => (
          <div key={p.id} className="card deleted-item">
            <div>
              <div className="title" style={{ fontWeight: 600 }}>{p.title}</div>
              <div className="muted" style={{ fontSize: 'var(--type-sm)' }}>{clientName(p.clientId)} · deleted {when(p.deletedAt)}</div>
            </div>
            <div className="toolbar">
              <button type="button" className="btn-acc" onClick={() => { restoreProgramme(uid, p.id); toast('Programme restored') }}>Restore</button>
              <ConfirmButton onConfirm={() => { purgeProgramme(uid, p.id); scrubDeleted(uid, { clientIds: [], programmeIds: [p.id] }); toast('Programme deleted forever') }}>Delete forever</ConfirmButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
