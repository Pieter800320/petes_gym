/*
 * A programme on its own page: the paper document, the same one the client receives.
 * Reached from a client's page (current or earlier programmes). Read-only: it is changed through
 * Edit programme (the same exercise card as in Train, plus structure), which opens on the exercise
 * Pete was looking at. No clock: only Pete's own sessions are timed, in Train. A red button and an
 * outlined one (Edit programme) stay in view above the tabs while the document scrolls (sticky);
 * a quiet link to Rework with Claude; the rarer actions are in ⋯.
 */
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { DayList } from '../components/DayList'
import { ExportSheet } from '../components/ExportSheet'
import { IconMore } from '../components/Icons'
import { ProgrammeSheet, type SheetFocus } from '../components/ProgrammeSheet'
import { Sheet } from '../components/Sheet'
import { TopBar } from '../components/TopBar'
import { toast } from '../components/toast'
import { useAuth } from '../auth/useAuth'
import { CLAUDE_IN_APP, draftPath } from '../claude/inApp'
import { activateProgramme, createNextBlock, duplicateProgramme } from '../data/programmeActions'
import { restoreProgramme, softDeleteProgramme, updateProgrammeFields, useClients, useProgramme, useProgrammes } from '../data/store'
import { useProgrammeDraft } from '../data/useProgrammeDraft'
import type { Programme, ProgrammeStatus } from '../data/types'
import { getCreateProgrammeId, setCreateProgrammeId } from '../settings'
import { leaveFor } from '../util/navHistory'

const STATUS_LABEL: Record<ProgrammeStatus, string> = { draft: 'Draft', active: 'Current', archived: 'Archived' }
/** Scrolled less than this, Pete is at the top of the document: Edit programme opens at its top too. */
const AT_TOP_PX = 40

/**
 * The exercise Pete is looking at in the document: the one whose card is open, else the first
 * exercise line whose top is on screen. Null at the top of the page (the sheet opens at its top).
 */
function exerciseInView(doc: HTMLElement | null): SheetFocus | null {
  if (!doc) return null
  const open = doc.querySelector<HTMLElement>('.ex.open[data-row]')
  if (open?.dataset.row) return { rowId: open.dataset.row, open: true }
  if (window.scrollY < AT_TOP_PX) return null
  for (const ex of doc.querySelectorAll<HTMLElement>('.ex[data-row]')) {
    if (ex.getBoundingClientRect().top >= 0 && ex.dataset.row) return { rowId: ex.dataset.row, open: false }
  }
  return null
}

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
  const { data: deletedClients } = useClients(true)
  const { data: siblings } = useProgrammes(stored.clientId)
  const { programme, change, flush } = useProgrammeDraft(stored)
  const location = useLocation()
  const navType = useNavigationType()
  // A programme just started by hand opens ready to be typed in; coming back to the page (POP) doesn't reopen the sheet.
  const [editOpen, setEditOpen] = useState(() => navType !== 'POP' && Boolean((location.state as { edit?: boolean } | null)?.edit))
  const [moreOpen, setMoreOpen] = useState(false)
  const docRef = useRef<HTMLElement>(null)
  const [focus, setFocus] = useState<SheetFocus | null>(null)
  const openEdit = () => {
    setFocus(exerciseInView(docRef.current))
    setEditOpen(true)
  }
  const [exportOpen, setExportOpen] = useState(false)

  const client = clients.find((c) => c.id === programme.clientId)
  const isMine = Boolean(client?.isSelf)
  const firstName = client?.name.trim().split(/\s+/)[0] ?? 'client'
  /** In Recently deleted: shown to be read (and restored), with nothing that edits, sends or trains it. */
  const deleted = Boolean(programme.deletedAt)
  const draft = programme.status === 'draft'

  if (!user) return null
  const uid = user.uid

  /** Pete's yes to a draft: it becomes the client's current programme, the one before it is archived. */
  function makeCurrent() {
    flush()
    activateProgramme(uid, programme, siblings)
    toast('Now the current programme')
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
        actions={deleted ? undefined : <button type="button" className="icon-btn" aria-label="Programme menu" onClick={() => setMoreOpen(true)}><IconMore /></button>}
      />

      {deleted &&
        (programme.deletedWithClient ? (
          <div className="banner">
            This programme was deleted with {deletedClients.find((c) => c.id === programme.clientId)?.name ?? 'its client'}. Restore the client from <Link to="/deleted" className="text-link">Recently deleted</Link>.
          </div>
        ) : (
          <div className="banner row-banner">
            <span>This programme is in Recently deleted.</span>
            <button type="button" className="text-link" onClick={() => { restoreProgramme(uid, programme); toast('Programme restored') }}>Restore</button>
          </div>
        ))}

      <article ref={docRef} className="paper-doc">
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
          Rework with Claude is a quiet link, so red appears once. A client's draft is first made
          current (Pete's yes to it); Send follows once it is. */}
      {!deleted && (
      <>
      {draft && <div className="banner live-note">This is a draft. Check it, change what you like, then make it current.</div>}
      <div className="button-pair action-bar">
        {isMine ? (
          <button type="button" className="btn-cta" onClick={trainMine}>{programme.status === 'active' ? 'Open in Train' : 'Make current & train'}</button>
        ) : draft ? (
          <button type="button" className="btn-cta" onClick={makeCurrent}>Make current</button>
        ) : (
          <button type="button" className="btn-cta" onClick={() => setExportOpen(true)}>Send to {firstName}</button>
        )}
        <button type="button" className="btn-outline" onClick={openEdit}>Edit programme</button>
      </div>
      {CLAUDE_IN_APP && <Link to={`/create/${programme.id}`} className="text-link quiet" onClick={flush}>Rework with Claude ›</Link>}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={programme.title}>
        <div className="lines">
          {isMine && <MenuLine title="Export" meta="HTML or Word, English or German" onClick={() => { setMoreOpen(false); setExportOpen(true) }} />}
          <MenuLine title="Build next block" meta="A new draft based on this one, in Create" onClick={() => { flush(); navigate(draftPath(createNextBlock(uid, programme))) }} />
          {programme.status !== 'active' && (
            <MenuLine title="Make current" meta={`${isMine ? 'Your' : `${firstName}'s`} current programme is archived`} onClick={() => { setMoreOpen(false); makeCurrent() }} />
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
              // The Create tab must not reopen a deleted draft.
              if (getCreateProgrammeId() === programme.id) setCreateProgrammeId(null)
              toast('Moved to Recently deleted')
              leaveFor(navigate, client ? `/clients/${client.id}` : '/clients')
            }}
          >
            Delete programme
          </ConfirmButton>
        </div>
      </Sheet>

      <ProgrammeSheet open={editOpen} onClose={() => { flush(); setEditOpen(false) }} programme={programme} clientName={isMine ? 'You' : client?.name} onChange={change} focus={focus} />
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} programme={programme} client={client} />
      </>
      )}
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
