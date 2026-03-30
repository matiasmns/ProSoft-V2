import { UserCircle, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type Props = {
  name: string
  role: string
}

export default function TopBar({ name, role }: Props) {
  const navigate = useNavigate()

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
            {name}
          </p>
          <p className="text-xs leading-tight" style={{ color: '#94BB66' }}>
            {role}
          </p>
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
        Menú Principal
      </button>
    </header>
  )
}
