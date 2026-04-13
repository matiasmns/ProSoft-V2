import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import IngresoPacientePage from './pages/IngresoPacientePage'
import NuevoAnalisisPage from './pages/NuevoAnalisisPage'
import CargadeMuestra from './pages/CargadeMuestra'
import PacientesLista from './pages/PacientesLista'
import HistorialMuestra from './pages/HistorialMuestra'
import ReferenceCalibrationPage from './pages/ReferenceCalibrationPage'
import InstallSystemPrompt from './components/InstallSystemPrompt'

function App() {
  return (
    <BrowserRouter>
      <InstallSystemPrompt />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/paciente/nuevo" element={<IngresoPacientePage />} />
        <Route path="/pacientes" element={<PacientesLista />} />
        <Route path="/muestra/nueva" element={<CargadeMuestra />} />
        <Route path="/analisis/nuevo" element={<NuevoAnalisisPage />} />
        <Route path="/historial" element={<HistorialMuestra />} />
        <Route path="/calibracion-referencias" element={<ReferenceCalibrationPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
