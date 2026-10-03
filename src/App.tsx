import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useMatch, useNavigationType } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isFirebaseConfigured } from './firebase'
import { NoteSheet } from './components/NoteSheet'
import { onOpenNote, type NoteRequest } from './components/noteEvents'
import { Snackbar } from './components/Snackbar'
import { RAIL_ACTION_ID } from './components/TopBar'
import { UpdateBanner } from './components/UpdateBanner'
import { ClientScreen } from './screens/ClientScreen'
import { ClientsScreen } from './screens/ClientsScreen'
import { CreateScreen } from './screens/CreateScreen'
import { DeletedScreen } from './screens/DeletedScreen'
import { LoadingScreen, NotConfiguredScreen, SignInScreen } from './screens/GateScreens'
import { ImportScreen } from './screens/ImportScreen'
import { NotesScreen } from './screens/NotesScreen'
import { ProfileImportScreen } from './screens/ProfileImportScreen'
import { ProgrammeScreen } from './screens/ProgrammeScreen'
import { TrainScreen } from './screens/TrainScreen'
import { EXERCISES } from './data/exercises'
import { recordCost, useProgramme } from './data/store'
import { setCostSink } from './claude/client'
import { recordPath } from './util/navHistory'
import { useTheme } from './settings'

const TABS = [
  { to: '/train', label: 'Train' },
  { to: '/create', label: 'Create' },
  { to: '/clients', label: 'Clients' },
]

export default function App() {
  useTheme() // applies the saved theme on startup
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured) return <NotConfiguredScreen />
  if (loading) return <LoadingScreen />
  if (!user) return <SignInScreen />
  return <Shell />
}

/** New pages open at the top; Back returns to where you were on the page you left. */
function useScrollMemory() {
  const location = useLocation()
  const navType = useNavigationType()
  const positions = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    recordPath(location.pathname)
    const key = location.key
    const map = positions.current
    const saved = navType === 'POP' ? map.get(key) : undefined
    window.scrollTo(0, saved ?? 0)
    // Lists fill from the offline cache a moment later; try once more when they have.
    const frame = saved ? requestAnimationFrame(() => window.scrollTo(0, saved)) : 0
    // Recorded while scrolling: by the time the next page renders, this one's offset is gone.
    const onScroll = () => map.set(key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [location.key, location.pathname, navType])
}

function Shell() {
  const [note, setNote] = useState<NoteRequest | null>(null)
  // Quick notes default to the client whose page (or programme) is open.
  const clientMatch = useMatch('/clients/:id')
  const createMatch = useMatch('/create/:id')
  const programmeMatch = useMatch('/programmes/:id')
  const { data: openProgramme } = useProgramme(createMatch?.params.id ?? programmeMatch?.params.id)
  const pageClient = clientMatch?.params.id ?? openProgramme?.clientId ?? null

  useEffect(() => onOpenNote(setNote), [])
  const { user } = useAuth()
  // Every Claude response adds its cost to the ledger (Settings shows the totals).
  useEffect(() => {
    if (!user) return
    const uid = user.uid
    setCostSink((kind, usd) => recordCost(uid, kind, usd))
    return () => setCostSink(null)
  }, [user])
  useScrollMemory()

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav-brand display">
          Pete's <span>Gym</span>
        </div>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-dot" aria-hidden="true" />
            {t.label}
          </NavLink>
        ))}
        {/* Desktop: the tab's main action (Start, New, Add) appears here, see Dial. */}
        <div id={RAIL_ACTION_ID} className="rail-action" />
      </nav>

      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Navigate to="/train" replace />} />
          <Route path="/train" element={<TrainScreen />} />
          <Route path="/train/live" element={<Navigate to="/train" replace />} />
          <Route path="/create" element={<CreateScreen />} />
          <Route path="/create/:id" element={<CreateScreen />} />
          <Route path="/programmes/:id" element={<ProgrammeScreen />} />
          <Route path="/clients" element={<ClientsScreen />} />
          <Route path="/clients/:id" element={<ClientScreen />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/deleted" element={<DeletedScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/import-profiles" element={<ProfileImportScreen />} />
          <Route path="*" element={<Navigate to="/train" replace />} />
        </Routes>
      </main>

      <NoteSheet
        open={note !== null}
        onClose={() => setNote(null)}
        defaultClientId={note?.clientId !== undefined ? note.clientId : pageClient}
        initialText={note?.text ?? ''}
      />
      <Snackbar />
      <UpdateBanner />
      {/* Library names for every exercise-name field (autocomplete). */}
      <datalist id="exercise-names">{EXERCISES.map((e) => <option key={e.key} value={e.name} />)}</datalist>
    </div>
  )
}
