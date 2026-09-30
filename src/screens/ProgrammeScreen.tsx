import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { DayList } from '../components/DayList'
import { ExportSheet } from '../components/ExportSheet'
import { IconBack } from '../components/Icons'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { activateProgramme, createNextBlock, duplicateProgramme } from '../data/programmeActions'
import { mapSession } from '../data/programmeEdits'
import { restoreProgramme, softDeleteProgramme, updateProgrammeFields, useClients, useProgramme, useProgrammes } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import type { Programme, ProgrammeStatus } from '../data/types'
import { setTrainProgrammeId } from '../settings'

const STATUS_LABEL: Record<ProgrammeStatus, string> = { draft: 'Draft', active: 'Active', archived: 'Archived' }

export function ProgrammeScreen() {
  const { id } = useParams()
  const { data: programme, loading } = useProgramme(id)

  if (!programme) {
    return (
      <div className="screen">
        {!loading && (
          <div className="empty">
            <h3 className="display">Programme not found</h3>
            <p>It may have been deleted on another device.</p>
            <Link to="/clients" className="btn-acc" style={{ textDecoration: 'none' }}>Back to clients</Link>
          </div>
        )}
      </div>
    )
  }
  // Keyed so switching programmes resets the selected day.
  return <ProgrammeDetail key={programme.id} stored={programme} />
}

function ProgrammeDetail({ stored }: { stored: Programme }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { data: siblings } = useProgrammes(stored.clientId)
  const { programme, change, flush } = useProgrammeDraft(stored)
  const [sessionIndex, setSessionIndex] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const client = clients.find((c) => c.id === programme.clientId)
  const index = Math.min(sessionIndex, programme.sessions.length - 1)
  const session = programme.sessions[index]

  if (!user) return null
  const uid = user.uid

  return (
    <div className="screen">
      <Link to={client ? `/clients/${client.id}` : '/clients'} className="btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0, textDecoration: 'none' }}>
        <span style={{ width: 20, height: 20, display: 'inline-flex' }}><IconBack /></span>
        {client?.name ?? 'Clients'}
      </Link>

      <header className="screen-head" style={{ paddingTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="display">{programme.title}</h1>
          <p className="sub">
            <span className={`tag${programme.status === 'active' ? ' accent' : ''}`}>{STATUS_LABEL[programme.status]}</span>{' '}
            {[programme.frequency, programme.sessionLength, programme.durationWeeks ? `${programme.durationWeeks} weeks` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" className="icon-btn menu-btn" aria-label="Programme menu" onClick={() => setMoreOpen(true)}>⋯</button>
      </header>

      {programme.deletedAt && (
        <div className="banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>This programme is in Recently deleted.</span>
          <button type="button" className="btn-acc" onClick={() => { restoreProgramme(uid, programme.id); toast('Programme restored') }}>Restore</button>
        </div>
      )}
      {programme.goal && <p className="muted" style={{ margin: 0 }}>{programme.goal}</p>}

      <div className="tabs" role="tablist" aria-label="Days">
        {programme.sessions.map((s, i) => (
          <button type="button" role="tab" key={s.id} className="tab" aria-selected={i === index} onClick={() => setSessionIndex(i)}>
            {s.title || `Day ${i + 1}`}
          </button>
        ))}
      </div>

      {session && <DayList session={session} index={index} mode="train" onChange={(fn) => change(mapSession(programme, session.id, fn))} />}

      <div className="clock-bar">
        <button
          type="button"
          className="btn-cta btn-block"
          onClick={() => {
            flush()
            if (programme.status !== 'active') activateProgramme(uid, programme, siblings)
            setTrainProgrammeId(programme.id)
            navigate('/train')
          }}
        >
          {programme.status === 'active' ? 'Train this programme' : 'Make active & train'}
        </button>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={programme.title}>
        <div className="list">
          <MenuItem title="Edit programme" meta="Days, exercises, goal and notes" onClick={() => { setMoreOpen(false); setEditOpen(true) }} />
          <MenuItem title="Export" meta="HTML or Word, English or German" onClick={() => { setMoreOpen(false); setExportOpen(true) }} />
          <MenuItem title="Rework with Claude" meta="Open this programme in Create" onClick={() => { flush(); navigate(`/create/${programme.id}`) }} />
          <MenuItem title="Build next block" meta="New draft based on this one, in Create" onClick={() => { flush(); const nid = createNextBlock(uid, programme); navigate(`/create/${nid}`) }} />
          {programme.status !== 'active' && (
            <MenuItem title="Make active" meta="Any other active programme for this client is archived" onClick={() => { activateProgramme(uid, programme, siblings); setMoreOpen(false); toast('Programme is now active') }} />
          )}
          {programme.status !== 'archived' && (
            <MenuItem title="Archive" meta="Keeps it in the client's history" onClick={() => { updateProgrammeFields(uid, programme.id, { status: 'archived' }); setMoreOpen(false); toast('Programme archived') }} />
          )}
          <MenuItem title="Duplicate" meta="An independent copy, as a draft" onClick={() => { flush(); const nid = duplicateProgramme(uid, programme); setMoreOpen(false); navigate(`/programmes/${nid}`) }} />
          <ConfirmButton
            onConfirm={() => {
              flush()
              softDeleteProgramme(uid, programme.id)
              toast('Moved to Recently deleted')
              navigate(client ? `/clients/${client.id}` : '/clients')
            }}
          >
            Delete programme
          </ConfirmButton>
        </div>
      </Sheet>

      <ProgrammeSheet open={editOpen} onClose={() => { flush(); setEditOpen(false) }} programme={programme} onChange={change} />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} programme={programme} client={client} />
    </div>
  )
}

function MenuItem({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" className="row-link" onClick={onClick}>
      <div className="grow">
        <div className="title">{title}</div>
        <div className="meta">{meta}</div>
      </div>
    </button>
  )
}
