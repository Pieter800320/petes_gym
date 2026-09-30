import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isFirebaseConfigured } from './firebase'
import { IconClients, IconCreate, IconPlus, IconTrain } from './components/Icons'
import { NoteSheet } from './components/NoteSheet'
import { Snackbar } from './components/Snackbar'
import { UpdateBanner } from './components/UpdateBanner'
import { ClientScreen } from './screens/ClientScreen'
import { ClientsScreen } from './screens/ClientsScreen'
import { CreateScreen } from './screens/CreateScreen'
import { LoadingScreen, NotConfiguredScreen, SignInScreen } from './screens/GateScreens'
import { ImportScreen } from './screens/ImportScreen'
import { NotesScreen } from './screens/NotesScreen'
import { ProfileImportScreen } from './screens/ProfileImportScreen'
import { ProgrammeScreen } from './screens/ProgrammeScreen'
import { TrainScreen } from './screens/TrainScreen'
import { EXERCISES } from './data/exercises'
import { useTheme } from './settings'

const TABS = [
  { to: '/create', label: 'CREATE', icon: <IconCreate /> },
  { to: '/train', label: 'TRAIN', icon: <IconTrain /> },
  { to: '/clients', label: 'CLIENTS', icon: <IconClients /> },
]

export default function App() {
  useTheme() // applies the saved theme on startup
  const { user, loading } = useAuth()

  if (!isFirebaseConfigured) return <NotConfiguredScreen />
  if (loading) return <LoadingScreen />
  if (!user) return <SignInScreen />
  return <Shell />
}

function Shell() {
  const [noteOpen, setNoteOpen] = useState(false)
  // Quick notes started on a client's profile are pre-filed under that client.
  const clientMatch = useMatch('/clients/:id')
  // The quick-note button would cover the chat's Send button; on Train and programme pages it
  // floats above the bottom bar instead.
  const createMatch = useMatch('/create/:id')
  const trainMatch = useMatch('/train')
  const programmeMatch = useMatch('/programmes/:id')
  const hideFab = Boolean(createMatch)
  const raiseFab = Boolean(trainMatch || programmeMatch)

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="nav-brand display">
          Pete's <span>Gym</span>
        </div>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-pill">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Navigate to="/train" replace />} />
          <Route path="/create" element={<CreateScreen />} />
          <Route path="/create/:id" element={<CreateScreen />} />
          <Route path="/train" element={<TrainScreen />} />
          <Route path="/train/live" element={<Navigate to="/train" replace />} />
          <Route path="/programmes/:id" element={<ProgrammeScreen />} />
          <Route path="/clients" element={<ClientsScreen />} />
          <Route path="/clients/:id" element={<ClientScreen />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/import-profiles" element={<ProfileImportScreen />} />
          <Route path="*" element={<Navigate to="/train" replace />} />
        </Routes>
      </main>

      {!hideFab && (
        <button type="button" className={`fab${raiseFab ? ' raised' : ''}`} aria-label="Quick note" onClick={() => setNoteOpen(true)}>
          <IconPlus />
        </button>
      )}
      <NoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} defaultClientId={clientMatch?.params.id ?? null} />
      <Snackbar />
      <UpdateBanner />
      {/* Library names for every exercise-name field (autocomplete). */}
      <datalist id="exercise-names">{EXERCISES.map((e) => <option key={e.key} value={e.name} />)}</datalist>
    </div>
  )
}
