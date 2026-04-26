import { useEffect, useState } from 'react'
import { UserCircle, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const defaultProfile = {
  name: 'Usuario',
  role: '',
}

export default function TopBar() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(defaultProfile)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active || !user) return

      const fallbackName = user.email?.split('@')[0] || defaultProfile.name
      const { data, error } = await supabase
        .from('profile')
        .select('name, role')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('No se pudo leer el perfil del usuario en Supabase.', error.message)
      }

      if (!active) return

      setProfile({
        name: data?.name || fallbackName,
        role: data?.role || defaultProfile.role,
      })
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [])

  return (
    <header
      className="flex items-center justify-between gap-3 px-8 py-3"
      style={{
        background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)',
        borderBottom: '1px solid #DFE0E5',
      }}
    >
      <div className="flex items-center gap-3">
        <UserCircle size={36} style={{ color: '#5C894A' }} />
        <div className="text-left">
          <p className="text-sm font-semibold leading-tight" style={{ color: '#54585E' }}>
            {profile.name}
          </p>
          {profile.role && (
            <p className="text-xs leading-tight" style={{ color: '#94BB66' }}>
              {profile.role}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/home')}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
        style={{
          color: '#5C894A',
          border: '1px solid #94BB66',
          background: 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(92,137,74,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <Home size={13} />
        Menu Principal
      </button>
    </header>
  )
}
