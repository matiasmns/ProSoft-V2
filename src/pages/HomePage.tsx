import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, Users, ClipboardList, SlidersHorizontal } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import { supabase } from '../lib/supabase'

type Card = {
  id: string
  label: string
  description: string
  icon: React.ReactNode
}

const cards: Card[] = [
  {
    id: 'Ingresa Paciente',
    label: 'Ingresar Paciente',
    description: 'Registra un nuevo paciente en el sistema.',
    icon: <FlaskConical size={28} />,
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    description: 'Consulta y gestiona los pacientes registrados.',
    icon: <Users size={28} />,
  },
  {
    id: 'historial-muestras',
    label: 'Historial de Muestras',
    description: 'Revisa el historial completo de muestras.',
    icon: <ClipboardList size={28} />,
  },
  {
    id: 'reference-calibration',
    label: 'Reference Calibration',
    description: 'Consulta las calibraciones PDF guardadas para ajustar el motor.',
    icon: <SlidersHorizontal size={28} />,
  },
]

const cardRoutes: Record<string, string> = {
  'Ingresa Paciente':   '/paciente/nuevo',
  'pacientes':          '/pacientes',
  'historial-muestras': '/historial',
  'reference-calibration': '/calibracion-referencias',
}

export default function HomePage() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('Ingresa Paciente')
  const [userName, setUserName] = useState('Usuario')
  const [userRole, setUserRole] = useState('Cargo')

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const fallbackName = user.email?.split('@')[0] || 'Usuario'

      const { data, error } = await supabase
        .from('profile')
        .select('name, role')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('No se pudo leer el perfil del usuario en Supabase.', error.message)
      }

      if (data) {
        setUserName(data.name || fallbackName)
        setUserRole(data.role || 'Cargo')
        return
      }

      setUserName(fallbackName)
    }
    fetchProfile()
  }, [])

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}
    >
      <Sidebar active={activeSection} onSelect={setActiveSection} />

      {/* Right column */}
      <div className="flex flex-col flex-1">
        <TopBar name={userName} role={userRole} />

        {/* Main content */}
        <main className="flex-1 p-10">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#5C894A' }}>
            Bienvenido
          </h1>
          <p className="text-sm mb-8" style={{ color: '#54585E' }}>
            Por favor selecciona una opción para comenzar
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map(card => (
              <button
                key={card.id}
                onClick={() => { setActiveSection(card.id); navigate(cardRoutes[card.id] ?? '/home') }}
                className="group flex flex-col items-start gap-4 p-6 rounded-2xl text-left transition-all duration-150 cursor-pointer"
                style={{
                  background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
                  border: '1px solid #DFE0E5',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)'
                  e.currentTarget.style.borderColor = '#94BB66'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.07)'
                  e.currentTarget.style.borderColor = '#DFE0E5'
                }}
              >
                {/* Icon */}
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl"
                  style={{ background: 'rgba(92,137,74,0.1)', color: '#5C894A' }}
                >
                  {card.icon}
                </div>

                {/* Text */}
                <div>
                  <p className="text-base font-semibold mb-1" style={{ color: '#5C894A' }}>
                    {card.label}
                  </p>
                  <p className="text-sm" style={{ color: '#54585E' }}>
                    {card.description}
                  </p>
                </div>

                {/* Arrow */}
                <div className="mt-auto self-end text-xs font-medium" style={{ color: '#4A9151' }}>
                  Ir →
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
