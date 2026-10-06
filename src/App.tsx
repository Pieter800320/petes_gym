import { Suspense, createElement, use, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { NavLink, Navigate, Route, Routes, matchPath, useLocation, useMatch, useNavigationType, type Location } from 'react-router-dom'
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
import { startLive, stopLive, useLiveReady } from './data/live'
import { NoAccessScreen, NotConfiguredScreen, SignInScreen, Splash } from './screens/GateScreens'
import { TrainScreen } from './screens/TrainScreen'
import { recordCost, useProgramme } from './data/store'
import { setCostSink } from './claude/cost'
import { recordPath } from './util/navHistory'
import { useShownLocation } from './util/pageTransition'
import { useTheme } from './settings'

// Loaded when first opened, so the daily path (Train, Clients) and a client's questionnaire don't
// carry Create, the importers and the Anthropic SDK. The service worker has every file offline.
const screens = {
  CreateScreen: later(() => import('./screens/CreateScreen').then((m) => m.CreateScreen)),
  DeletedScreen: later(() => import('./screens/DeletedScreen').then((m) => m.DeletedScreen)),
  FitnessProfileScreen: later(() => import('./screens/FitnessProfileScreen').then((m) => m.FitnessProfileScreen)),
  ImportScreen: later(() => import('./screens/ImportScreen').then((m) => m.ImportScreen)),
  NotesScreen: later(() => import('./screens/NotesScreen').then((m) => m.NotesScreen)),
  ProfileImportScreen: later(() => import('./screens/ProfileImportScreen').then((m) => m.ProfileImportScreen)),
  ProgrammeScreen: later(() => import('./screens/ProgrammeScreen').then((m) => m.ProgrammeScreen)),
}
const { CreateScreen, DeletedScreen, FitnessProfileScreen, ImportScreen, NotesScreen, ProfileImportScreen, ProgrammeScreen } = screens

type Loading<T> = Promise<T> & { status?: 'fulfilled'; value?: T }

/**
 * A screen whose code is fetched when first needed, like React's lazy(), with one difference:
 * once `load()` has finished, the screen renders at once. lazy() waits one more turn even then,
 * which showed as an empty page for a moment between the start frame and the first screen.
 */
function later<P extends object>(fetchScreen: () => Promise<ComponentType<P>>) {
  let loading: Loading<ComponentType<P>> | null = null
  const load = () => {
    if (!loading) {
      const started: Loading<ComponentType<P>> = fetchScreen()
      // React's use() takes a promise marked like this without waiting.
      started.then((screen) => Object.assign(started, { status: 'fulfilled', value: screen }), () => undefined)
      loading = started
    }
    return loading
  }
  function Screen(props: P) {
    return createElement(use(load() as Promise<ComponentType<P>>), props)
  }
  return Object.assign(Screen, { load })
}

/** How long after the first screen appears the other screens are fetched in the background. */
const PRELOAD_SCREENS_MS = 400
/** The start frame never stays longer than this: after it the app shows what it has. */
const START_TIMEOUT_MS = 4000
/** Read by index.html before anything is drawn: this device has been signed in, so the start frame shows the navigation. */
const SIGNED_IN_KEY = 'pg_signed_in'

const TABS = [
  { to: '/train', label: 'Train' },
  { to: '/create', label: 'Create' },
  { to: '/clients', label: 'Clients' },
]
const TAB_PATHS = TABS.map((t) => t.to)

/** The lazily loaded screens the page at this address needs. */
function screensFor(pathname: string): { load: () => Promise<unknown> }[] {
  // A draft's address forwards to its programme page (CreateScreen).
  if (pathname.startsWith('/create')) return [screens.CreateScreen, screens.ProgrammeScreen]
  if (pathname.startsWith('/programmes')) return [screens.ProgrammeScreen]
  if (pathname.startsWith('/notes')) return [screens.NotesScreen]
  if (pathname.startsWith('/deleted')) return [screens.DeletedScreen]
  return []
}

/** Fetches the code of the page at this address; null when there is nothing to fetch. */
function loadScreensFor(pathname: string): Promise<unknown> | null {
  const needed = screensFor(pathname)
  return needed.length ? Promise.all(needed.map((screen) => screen.load())) : null
}

/** Every weight of the app's family (styles/fonts.css) is loaded: text is then drawn once, not weight by weight. */
const fontsLoaded: Promise<unknown> =
  typeof document !== 'undefined' && document.fonts
    ? Promise.all([400, 500, 600, 700, 800].map((weight) => document.fonts.load(`${weight} 16px "Schibsted Grotesk"`))).catch(() => undefined)
    : Promise.resolve()

/**
 * True when the first screen can appear complete: the fonts and that screen's own code are
 * loaded and every collection has answered. Never later than START_TIMEOUT_MS.
 */
function useStartReady(uid: string | null): boolean {
  const dataReady = useLiveReady()
  const [restReady, setRestReady] = useState(false)
  const [late, setLate] = useState(false)
  const firstPath = useRef(useLocation().pathname)
  useEffect(() => {
    if (uid) startLive(uid)
  }, [uid])
  useEffect(() => {
    let on = true
    Promise.all([fontsLoaded, ...screensFor(firstPath.current).map((screen) => screen.load().catch(() => undefined))]).then(() => on && setRestReady(true))
    const timer = setTimeout(() => setLate(true), START_TIMEOUT_MS)
    return () => {
      on = false
      clearTimeout(timer)
    }
  }, [])
  return (dataReady && restReady) || late
}

function setSignedInBefore(yes: boolean) {
  try {
    if (yes) localStorage.setItem(SIGNED_IN_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    // Storage blocked: the start frame just shows no navigation.
  }
}

export default function App() {
  useTheme() // follows changes; index.html has already applied the saved theme
  const { user, loading } = useAuth()
  const location = useLocation()
  // Someone else's Google account gets no listeners at all.
  const owner = user?.email?.toLowerCase() === OWNER_EMAIL
  const fit = matchPath('/fit/:uid/:token', location.pathname)
  const ready = useStartReady(user && owner && !fit ? user.uid : null)

  useEffect(() => {
    if (loading || fit) return
    setSignedInBefore(owner)
    if (!owner) stopLive()
  }, [loading, owner, fit])

  if (!isFirebaseConfigured) return <NotConfiguredScreen />
  // A client's Fitness Profile link: the questionnaire, for someone without an account, and
  // nothing else of the app.
  if (fit?.params.uid && fit.params.token) {
    return (
      <Suspense fallback={<Splash />}>
        <FitnessProfileScreen uid={fit.params.uid} token={fit.params.token} />
      </Suspense>
    )
  }
  if (loading) return <Splash />
  if (!user) return <SignInScreen />
  // Stop before the shell.
  if (!owner) return <NoAccessScreen />
  // One calm frame until everything for the first screen is there; then it appears complete.
  if (!ready) return <Splash />
  return <Shell />
}

/**
 * New pages open at the top; Back returns to where you were on the page you left.
 * location is the page on screen (useShownLocation), so the old page isn't scrolled while it is still shown.
 */
function useScrollMemory(location: Location) {
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
  // The page on screen: it follows the address inside a view transition (util/pageTransition.ts).
  const shown = useShownLocation(TAB_PATHS, loadScreensFor)
  useScrollMemory(shown)

  // Fetch the other screens once the first one is up, so opening them never waits.
  useEffect(() => {
    const timer = setTimeout(() => {
      // The questionnaire is for clients; Pete's app never shows it.
      const { FitnessProfileScreen: _clientsOnly, ...mine } = screens
      for (const screen of Object.values(mine)) screen.load().catch(() => {})
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
  const invites = useInvites()
  const waitingAnswers = useMemo(() => invites.filter((i) => i.answeredAt !== null), [invites])
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
        {/* A screen's code is fetched in the background just after start; should one still be on its
            way, the page stays empty for that moment rather than flashing a word. */}
        <Suspense fallback={null}>
        <Routes location={shown}>
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
