import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MissingConfigScreen from './components/MissingConfigScreen.tsx'
import { registerProsoftPwa } from './pwa.ts'

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
