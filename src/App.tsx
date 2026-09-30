import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isFirebaseConfigured } from './firebase'
import { NoteSheet } from './components/NoteSheet'
import { onOpenNote, type NoteRequest } from './components/noteEvents'
import { Snackbar } from './components/Snackbar'
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
import { useProgramme } from './data/store'
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

function Shell() {
  const [note, setNote] = useState<NoteRequest | null>(null)
  // Quick notes default to the client whose page (or programme) is open.
  const clientMatch = useMatch('/clients/:id')
  const createMatch = useMatch('/create/:id')
  const programmeMatch = useMatch('/programmes/:id')
  const { data: openProgramme } = useProgramme(createMatch?.params.id ?? programmeMatch?.params.id)
  const pageClient = clientMatch?.params.id ?? openProgramme?.clientId ?? null

  useEffect(() => onOpenNote(setNote), [])

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
