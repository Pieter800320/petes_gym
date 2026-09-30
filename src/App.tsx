import { useState } from 'react'
import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { isFirebaseConfigured } from './firebase'
import { IconClients, IconCreate, IconPlus, IconTrain } from './components/Icons'
import { NoteSheet } from './components/NoteSheet'
import { Snackbar } from './components/Snackbar'
import { ClientScreen } from './screens/ClientScreen'
import { ClientsScreen } from './screens/ClientsScreen'
import { CreateScreen } from './screens/CreateScreen'
import { LoadingScreen, NotConfiguredScreen, SignInScreen } from './screens/GateScreens'
import { NotesScreen } from './screens/NotesScreen'
import { TrainScreen } from './screens/TrainScreen'
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
          <Route path="/train" element={<TrainScreen />} />
          <Route path="/clients" element={<ClientsScreen />} />
          <Route path="/clients/:id" element={<ClientScreen />} />
          <Route path="/notes" element={<NotesScreen />} />
          <Route path="*" element={<Navigate to="/train" replace />} />
        </Routes>
      </main>

      <button type="button" className="fab" aria-label="Quick note" onClick={() => setNoteOpen(true)}>
        <IconPlus />
      </button>
      <NoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} defaultClientId={clientMatch?.params.id ?? null} />
      <Snackbar />
    </div>
  )
}
