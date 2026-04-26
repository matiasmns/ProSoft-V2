import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ShieldPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = typeof location.state === 'object' && location.state != null && 'from' in location.state && typeof location.state.from === 'string'
    ? location.state.from
    : '/home'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = e.currentTarget
    const email    = (form.elements.namedItem('email')    as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (error) {
      setError('Correo o contraseña incorrectos.')
      return
    }

    navigate(redirectTo, { replace: true })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #EEF1F3, #E5EAED)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-lg p-8"
        style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)' }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <ShieldPlus size={40} style={{ color: '#5C894A' }} />
          </div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: '#5C894A' }}>
            Bienvenido
          </h1>
          <p className="text-sm" style={{ color: '#54585E' }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {/* Form */}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: '#54585E' }}>
              Correo electrónico
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#54585E' }}
              />
              <input
                name="email"
                type="email"
                required
                placeholder="usuario@email.com"
                className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none transition"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" style={{ color: '#54585E' }}>
              Contraseña
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#54585E' }}
              />
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm outline-none transition"
                style={{ background: '#FFFFFF', color: '#54585E', border: '1px solid #DFE0E5' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#5C894A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#DFE0E5')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: '#54585E' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-xs text-center" style={{ color: '#c0392b' }}>
              {error}
            </p>
          )}

          {/* Forgot password */}
          <div className="text-right -mt-2">
            <a href="#" className="text-xs hover:underline" style={{ color: '#5C894A' }}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(180deg, #94BB66, #4A9151)',
              border: '1px solid #56874A',
              color: '#F1FAEF',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }}
            onMouseEnter={e => {
              if (!loading) {
                e.currentTarget.style.background = 'linear-gradient(180deg, #a3c977, #3d7d44)'
                e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.3)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'linear-gradient(180deg, #94BB66, #4A9151)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)'
            }}
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
