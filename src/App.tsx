import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import IngresoPacientePage from './pages/IngresoPacientePage'
import NuevoAnalisisPage from './pages/NuevoAnalisisPage'
import CargadeMuestra from './pages/CargadeMuestra'
import PacientesLista from './pages/PacientesLista'
import HistorialMuestra from './pages/HistorialMuestra'
import ReferenceCalibrationPage from './pages/ReferenceCalibrationPage'
import InstallSystemPrompt from './components/InstallSystemPrompt'
import { supabase } from './lib/supabase'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthStatus(data.session ? 'authenticated' : 'unauthenticated')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setAuthStatus(session ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return authStatus
}

function AuthLoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center text-sm"
      style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)', color: '#54585E' }}
    >
      Verificando sesion...
    </div>
  )
}

function PublicOnlyRoute() {
  const authStatus = useAuthStatus()

  if (authStatus === 'loading') {
    return <AuthLoadingScreen />
  }

  if (authStatus === 'authenticated') {
    return <Navigate to="/home" replace />
  }

  return <Outlet />
}

function ProtectedRoute() {
  const authStatus = useAuthStatus()
  const location = useLocation()

  if (authStatus === 'loading') {
    return <AuthLoadingScreen />
  }

  if (authStatus === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}

function App() {
  return (
    <BrowserRouter>
      <InstallSystemPrompt />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/paciente/nuevo" element={<IngresoPacientePage />} />
          <Route path="/pacientes" element={<PacientesLista />} />
          <Route path="/muestra/nueva" element={<CargadeMuestra />} />
          <Route path="/analisis/nuevo" element={<NuevoAnalisisPage />} />
          <Route path="/historial" element={<HistorialMuestra />} />
          <Route path="/calibracion-referencias" element={<ReferenceCalibrationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
