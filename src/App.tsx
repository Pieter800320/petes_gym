import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, matchPath, useLocation, useMatch, useNavigationType } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isFirebaseConfigured } from './firebase'
import { OWNER_EMAIL } from './firebaseConfig'
import { NoteSheet } from './components/NoteSheet'
import { onOpenNote, onOpenSettings, type NoteRequest } from './components/noteEvents'
import { SettingsSheet } from './components/SettingsSheet'
import { Snackbar } from './components/Snackbar'
import { RAIL_ACTION_ID } from './components/TopBar'
import { UpdateBanner } from './components/UpdateBanner'
import { ClientScreen } from './screens/ClientScreen'
import { ClientsScreen } from './screens/ClientsScreen'
import { toast } from './components/toast'
import { backupIfDue, runPendingScrubs } from './data/backups'
import { useInvites, watchNotifyUrl } from './data/invites'
import { LoadingScreen, NoAccessScreen, NotConfiguredScreen, SignInScreen } from './screens/GateScreens'
import { TrainScreen } from './screens/TrainScreen'
import { recordCost, useProgramme } from './data/store'
import { setCostSink } from './claude/cost'
import { recordPath } from './util/navHistory'
import { useTheme } from './settings'

// Loaded when first opened, so the daily path (Train, Clients) and a client's questionnaire don't
// carry Create, the importers and the Anthropic SDK. The service worker has every file offline.
const screens = {
  CreateScreen: () => import('./screens/CreateScreen'),
  DeletedScreen: () => import('./screens/DeletedScreen'),
  FitnessProfileScreen: () => import('./screens/FitnessProfileScreen'),
  ImportScreen: () => import('./screens/ImportScreen'),
  NotesScreen: () => import('./screens/NotesScreen'),
  ProfileImportScreen: () => import('./screens/ProfileImportScreen'),
  ProgrammeScreen: () => import('./screens/ProgrammeScreen'),
}
const CreateScreen = lazy(() => screens.CreateScreen().then((m) => ({ default: m.CreateScreen })))
const DeletedScreen = lazy(() => screens.DeletedScreen().then((m) => ({ default: m.DeletedScreen })))
const FitnessProfileScreen = lazy(() => screens.FitnessProfileScreen().then((m) => ({ default: m.FitnessProfileScreen })))
const ImportScreen = lazy(() => screens.ImportScreen().then((m) => ({ default: m.ImportScreen })))
const NotesScreen = lazy(() => screens.NotesScreen().then((m) => ({ default: m.NotesScreen })))
const ProfileImportScreen = lazy(() => screens.ProfileImportScreen().then((m) => ({ default: m.ProfileImportScreen })))
const ProgrammeScreen = lazy(() => screens.ProgrammeScreen().then((m) => ({ default: m.ProgrammeScreen })))

/** How long after the shell appears the other screens are fetched in the background. */
const PRELOAD_SCREENS_MS = 1500

const TABS = [
  { to: '/train', label: 'Train' },
  { to: '/create', label: 'Create' },
  { to: '/clients', label: 'Clients' },
]

export default function App() {
  useTheme() // applies the saved theme on startup
  const { user, loading } = useAuth()
  const location = useLocation()

  if (!isFirebaseConfigured) return <NotConfiguredScreen />
  // A client's Fitness Profile link: the questionnaire, for someone without an account, and
  // nothing else of the app.
  const fit = matchPath('/fit/:uid/:token', location.pathname)
  if (fit?.params.uid && fit.params.token) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <FitnessProfileScreen uid={fit.params.uid} token={fit.params.token} />
      </Suspense>
    )
  }
  if (loading) return <LoadingScreen />
  if (!user) return <SignInScreen />
  // Someone else's Google account: stop before the shell, so none of its listeners start.
  if (user.email?.toLowerCase() !== OWNER_EMAIL) return <NoAccessScreen />
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

  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => onOpenNote(setNote), [])
  useEffect(() => onOpenSettings(() => setSettingsOpen(true)), [])
  const { user } = useAuth()
  // Every Claude response adds its cost to the ledger (Settings shows the totals).
  useEffect(() => {
    if (!user) return
    const uid = user.uid
    setCostSink((kind, usd) => recordCost(uid, kind, usd))
    return () => setCostSink(null)
  }, [user])
  useScrollMemory()

  // Fetch the other screens once the first one is up, so opening them never shows "Loading…".
  useEffect(() => {
    const timer = setTimeout(() => {
      // The questionnaire is for clients; Pete's app never shows it.
      const { FitnessProfileScreen: _clientsOnly, ...mine } = screens
      for (const load of Object.values(mine)) load().catch(() => {})
    }, PRELOAD_SCREENS_MS)
    return () => clearTimeout(timer)
  }, [])

  // The weekly backup, and the address new questionnaire links carry for the email to Pete.
  useEffect(() => {
    if (!user) return
    const { uid } = user
    // First what "Delete forever" still owes the backups (it had no connection then), then the weekly one.
    runPendingScrubs(uid)
      .catch((err) => console.error('Not yet removed from the backups', err))
      .then(() => backupIfDue(uid))
      .catch((err) => console.error('Backup failed', err))
    return watchNotifyUrl(user.uid)
  }, [user])

  // Questionnaire answers waiting on Clients: a count on the tab, and a word when one arrives.
  const waitingAnswers = useInvites().filter((i) => i.answeredAt !== null)
  const announced = useRef(new Set<string>())
  const openedAt = useRef(0)
  useEffect(() => { openedAt.current = Date.now() }, [])
  useEffect(() => {
    for (const i of waitingAnswers) {
      if (announced.current.has(i.id)) continue
      announced.current.add(i.id)
      // Answers that were already waiting when the app opened are on Clients, not announced.
      if ((i.answeredAt ?? 0) > openedAt.current) toast(`New answers from ${String(i.answers?.name || i.name || 'a client')}`)
    }
  }, [waitingAnswers])

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav-brand display">
          Pete's <span>Gym</span>
        </div>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-dot" aria-hidden="true" />
            <span className="nav-label">
              {t.label}
              {t.to === '/clients' && waitingAnswers.length > 0 && <span className="nav-count" aria-label={`${waitingAnswers.length} new`}>{waitingAnswers.length}</span>}
            </span>
          </NavLink>
        ))}
        {/* Desktop: the tab's main action (Start, New, Add) appears here, see Dial. */}
        <div id={RAIL_ACTION_ID} className="rail-action" />
      </nav>

      <main className="shell-main">
        <Suspense fallback={<LoadingScreen />}>
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
        </Suspense>
      </main>

      <NoteSheet
        open={note !== null}
        onClose={() => setNote(null)}
        defaultClientId={note?.clientId !== undefined ? note.clientId : pageClient}
        initialText={note?.text ?? ''}
      />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Snackbar />
      <UpdateBanner />
    </div>
  )
}
