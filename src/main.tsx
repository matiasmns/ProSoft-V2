import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerProsoftPwa } from './pwa.ts'

type MissingConfigScreenProps = {
  missingKeys: string[]
}

function MissingConfigScreen({ missingKeys }: MissingConfigScreenProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-10"
      style={{ background: 'linear-gradient(180deg, #EEF1F3 0%, #F8FAFB 100%)' }}
    >
      <div
        className="w-full max-w-2xl rounded-3xl p-8"
        style={{ background: '#FFFFFF', border: '1px solid #DFE0E5', boxShadow: '0 18px 46px rgba(30, 41, 59, 0.08)' }}
      >
        <div className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#E7F3DA', color: '#5C894A' }}>
          Configuracion requerida
        </div>
        <h1 className="mt-4 text-2xl font-semibold" style={{ color: '#24313F' }}>
          Faltan variables de entorno para iniciar el sistema
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: '#54585E' }}>
          La aplicacion no puede crear el cliente de Supabase porque el build no recibio una o mas variables requeridas.
        </p>
        <div className="mt-6 rounded-2xl p-4" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5C894A' }}>
            Variables faltantes
          </p>
          <ul className="mt-3 space-y-2 text-sm" style={{ color: '#24313F' }}>
            {missingKeys.map((key) => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 rounded-2xl p-4 text-sm leading-6" style={{ background: '#FBFBFC', border: '1px solid #DFE0E5', color: '#54585E' }}>
          Carga estas variables en Vercel, guarda y ejecuta un nuevo deploy:
          <div className="mt-3 font-mono text-xs" style={{ color: '#24313F' }}>
            <div>VITE_SUPABASE_URL=https://tu-proyecto.supabase.co</div>
            <div>VITE_SUPABASE_ANON_KEY=tu-anon-key</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const requiredConfig = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL?.trim(),
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
}

const missingKeys = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

registerProsoftPwa()

const root = createRoot(document.getElementById('root')!)

if (missingKeys.length > 0) {
  root.render(
    <StrictMode>
      <MissingConfigScreen missingKeys={missingKeys} />
    </StrictMode>,
  )
} else {
  const { default: App } = await import('./App.tsx')

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
