/*
 * A programme on its own page: the paper document, the same one the client receives.
 * Reached from a client's page (current or earlier programmes). A red button and an outlined one
 * (Edit programme), a quiet link to Rework with Claude; the rarer actions are in ⋯.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { DayList } from '../components/DayList'
import { ExportSheet } from '../components/ExportSheet'
import { IconMore } from '../components/Icons'
import { ProgrammeSheet } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { activateProgramme, copyToSelf, createNextBlock, duplicateProgramme } from '../data/programmeActions'
import { restoreProgramme, softDeleteProgramme, updateProgrammeFields, useClients, useProgramme, useProgrammes } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import type { Programme, ProgrammeStatus } from '../data/types'
import { leaveFor } from '../util/navHistory'

const STATUS_LABEL: Record<ProgrammeStatus, string> = { draft: 'Draft', active: 'Current', archived: 'Archived' }

export function ProgrammeScreen() {
  const { id } = useParams()
  const { data: programme, loading } = useProgramme(id)

  if (!programme) {
    return (
      <div className="screen">
        <TopBar back={{ to: '/clients', label: 'Clients' }} />
        {!loading && <p className="lead">This programme isn't here any more.</p>}
      </div>
    )
  }
  return <ProgrammeDetail key={programme.id} stored={programme} />
}

function ProgrammeDetail({ stored }: { stored: Programme }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const { data: siblings } = useProgrammes(stored.clientId)
  const { programme, change, flush } = useProgrammeDraft(stored)
  const [editOpen, setEditOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const client = clients.find((c) => c.id === programme.clientId)
  const self = clients.find((c) => c.isSelf)
  const isMine = Boolean(client?.isSelf)
  const { data: selfProgrammes } = useProgrammes(self?.id ?? '__none__')
  const firstName = client?.name.trim().split(/\s+/)[0] ?? 'client'

  if (!user) return null
  const uid = user.uid

  function loadInTrain() {
    if (!self) {
      toast('Add your own profile first: Clients → You')
      return
    }
    flush()
    copyToSelf(uid, programme, self.id, selfProgrammes)
    toast('Loaded in Train as your current programme')
    navigate('/train')
  }

  function trainMine() {
    flush()
    if (programme.status !== 'active') activateProgramme(uid, programme, siblings)
    navigate('/train')
  }

  return (
    <div className="screen">
      <TopBar
        back={{ to: client ? `/clients/${client.id}` : '/clients', label: isMine ? 'You' : client?.name ?? 'Clients' }}
        noteClientId={programme.clientId}
        actions={<button type="button" className="icon-btn" aria-label="Programme menu" onClick={() => setMoreOpen(true)}><IconMore /></button>}
      />

      {programme.deletedAt && (
        <div className="banner row-banner">
          <span>This programme is in Recently deleted.</span>
          <button type="button" className="text-link" onClick={() => { restoreProgramme(uid, programme.id); toast('Programme restored') }}>Restore</button>
        </div>
      )}

      <article className="paper-doc">
        <span className="paper-eyebrow">{STATUS_LABEL[programme.status]}{programme.durationWeeks ? ` · ${programme.durationWeeks}-week plan` : ''}</span>
        <h1 className="display paper-doc-title">{programme.title}</h1>
        {programme.goal && <p className="paper-goal">{programme.goal}</p>}
        <div className="paper-stats">
          {programme.frequency && <span><span>Frequency</span><b className="mono">{programme.frequency}</b></span>}
          {programme.sessionLength && <span><span>Length</span><b className="mono">{programme.sessionLength}</b></span>}
        </div>
        {programme.sessions.map((s, i) => (
          <DayList key={s.id} session={s} index={i} mode="read" />
        ))}
      </article>

      {/* A pair of rectangles: the main action in red, Edit programme outlined beside it.
          Rework with Claude is a quiet link, so red appears once. */}
      <div className="button-pair">
        {isMine ? (
          <button type="button" className="btn-cta" onClick={trainMine}>{programme.status === 'active' ? 'Open in Train' : 'Make current & train'}</button>
        ) : (
          <button type="button" className="btn-cta" onClick={() => setExportOpen(true)}>Send to {firstName}</button>
        )}
        <button type="button" className="btn-outline" onClick={() => setEditOpen(true)}>Edit programme</button>
      </div>
      <Link to={`/create/${programme.id}`} className="text-link quiet" onClick={flush}>Rework with Claude ›</Link>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={programme.title}>
        <div className="lines">
          {isMine ? (
            <MenuLine title="Export" meta="HTML or Word, English or German" onClick={() => { setMoreOpen(false); setExportOpen(true) }} />
          ) : (
            <MenuLine title="Load in Train" meta="Use a copy for your own training" onClick={loadInTrain} />
          )}
          <MenuLine title="Build next block" meta="A new draft based on this one, in Create" onClick={() => { flush(); navigate(`/create/${createNextBlock(uid, programme)}`) }} />
          {programme.status !== 'active' && (
            <MenuLine title="Make current" meta={`${isMine ? 'Your' : `${firstName}'s`} current programme is archived`} onClick={() => { activateProgramme(uid, programme, siblings); setMoreOpen(false); toast('Now the current programme') }} />
          )}
          {programme.status !== 'archived' && (
            <MenuLine title="Archive" meta="Keeps it in the history" onClick={() => { updateProgrammeFields(uid, programme.id, { status: 'archived' }); setMoreOpen(false); toast('Programme archived') }} />
          )}
          <MenuLine title="Duplicate" meta="An independent copy, as a draft" onClick={() => { flush(); navigate(`/programmes/${duplicateProgramme(uid, programme)}`) }} />
          <ConfirmButton
            className="danger-link"
            onConfirm={() => {
              flush()
              softDeleteProgramme(uid, programme.id)
              toast('Moved to Recently deleted')
              leaveFor(navigate, client ? `/clients/${client.id}` : '/clients')
            }}
          >
            Delete programme
          </ConfirmButton>
        </div>
      </Sheet>

      <ProgrammeSheet open={editOpen} onClose={() => { flush(); setEditOpen(false) }} programme={programme} clientName={isMine ? 'You' : client?.name} onChange={change} />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} programme={programme} client={client} />
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
