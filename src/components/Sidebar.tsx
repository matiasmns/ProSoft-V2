import { useEffect, useState } from 'react'
import { ClipboardList, Download, FlaskConical, LogOut, SlidersHorizontal, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  createPwaInstallAvailability,
  PWA_INSTALL_AVAILABILITY_EVENT,
  requestPwaInstallPrompt,
  type PwaInstallAvailability,
} from '../lib/pwaInstallPrompt'

type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
  route: string
}

const navItems: NavItem[] = [
  { id: 'patient-intake', label: 'Ingresar Paciente', icon: <FlaskConical size={18} />, route: '/paciente/nuevo' },
  { id: 'pacientes', label: 'Pacientes', icon: <Users size={18} />, route: '/pacientes' },
  { id: 'historial-muestras', label: 'Historial de Muestras', icon: <ClipboardList size={18} />, route: '/historial' },
  { id: 'reference-calibration', label: 'Reference Calibration', icon: <SlidersHorizontal size={18} />, route: '/calibracion-referencias' },
]

type Props = {
  active: string
  onSelect: (id: string) => void
}

export default function Sidebar({ active, onSelect }: Props) {
  const navigate = useNavigate()
  const [installAvailability, setInstallAvailability] = useState<PwaInstallAvailability>(() => createPwaInstallAvailability(false))

  useEffect(() => {
    const handleInstallAvailability = (event: Event) => {
      const customEvent = event as CustomEvent<PwaInstallAvailability>
      if (!customEvent.detail) return
      setInstallAvailability(customEvent.detail)
    }

    window.addEventListener(PWA_INSTALL_AVAILABILITY_EVENT, handleInstallAvailability)

    return () => {
      window.removeEventListener(PWA_INSTALL_AVAILABILITY_EVENT, handleInstallAvailability)
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside
      className="flex flex-col w-60 min-h-screen"
      style={{
        background: 'linear-gradient(180deg, #FAF9FB, #FBFBFC)',
        boxShadow: '4px 0 5px rgba(0,0,0,0.08)',
      }}
    >
      <div className="px-6 py-6 mb-2">
        <span className="text-lg font-semibold" style={{ color: '#5C894A' }}>
          ProSoft
        </span>
      </div>

      <nav className="flex flex-col flex-1 gap-1 px-3">
        {navItems.map(item => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => { onSelect(item.id); navigate(item.route) }}
              className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-left w-full transition-colors duration-100 cursor-pointer"
              style={{
                color: isActive ? '#5C894A' : '#54585E',
                background: isActive ? 'rgba(92,137,74,0.08)' : 'transparent',
              }}
              onMouseEnter={event => {
                if (!isActive) event.currentTarget.style.background = '#D9D9D9'
              }}
              onMouseLeave={event => {
                if (!isActive) event.currentTarget.style.background = 'transparent'
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full"
                  style={{ height: '60%', background: '#4A9151' }}
                />
              )}
              <span style={{ color: isActive ? '#5C894A' : '#54585E' }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="px-3 pb-6 flex flex-col gap-2">
        {!installAvailability.installed && (
          <button
            type="button"
            onClick={requestPwaInstallPrompt}
            className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium w-full transition-colors duration-100"
            style={{
              color: installAvailability.available ? '#5C894A' : '#54585E',
              background: installAvailability.available ? 'rgba(92,137,74,0.08)' : '#FFFFFF',
              border: installAvailability.available ? '1px solid rgba(92,137,74,0.18)' : '1px solid #DFE0E5',
            }}
            title={installAvailability.available ? 'Instalar en la PC' : 'Abrir ayuda de instalacion'}
            onMouseEnter={event => {
              event.currentTarget.style.background = installAvailability.available ? 'rgba(92,137,74,0.12)' : '#F4F5F7'
            }}
            onMouseLeave={event => {
              event.currentTarget.style.background = installAvailability.available ? 'rgba(92,137,74,0.08)' : '#FFFFFF'
            }}
          >
            <Download size={18} />
            Instalar en la PC
          </button>
        )}

        <button
          onClick={handleLogout}
          className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium w-full transition-colors duration-100 cursor-pointer"
          style={{ color: '#54585E', background: 'transparent' }}
          onMouseEnter={event => (event.currentTarget.style.background = '#D9D9D9')}
          onMouseLeave={event => (event.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={18} />
          Cerrar Sesion
        </button>
      </div>
    </aside>
  )
}
