import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import {
  createPwaInstallAvailability,
  dispatchPwaInstallAvailability,
  isStandaloneMode,
  PWA_INSTALL_REQUEST_EVENT,
} from '../lib/pwaInstallPrompt'

type BeforeInstallPromptChoice = {
  outcome: 'accepted' | 'dismissed'
  platform: string
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptChoice>
}

const INSTALL_PROMPT_DISMISSED_KEY = 'prosoft.pwa.install_prompt_dismissed'

export default function InstallSystemPrompt() {
  const location = useLocation()
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode())
  const [manualOpen, setManualOpen] = useState(false)
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== 'undefined' && window.sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === '1'
  ))

  const shouldRender = useMemo(() => {
    if (location.pathname === '/login') return false
    if (isInstalled) return false
    if (manualOpen) return true
    if (dismissed) return false
    return promptEvent != null
  }, [dismissed, isInstalled, location.pathname, manualOpen, promptEvent])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent
      installEvent.preventDefault()
      setPromptEvent(installEvent)
      setDismissed(window.sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === '1')
      dispatchPwaInstallAvailability(createPwaInstallAvailability(true))
    }

    const handleInstalled = () => {
      setIsInstalled(true)
      setPromptEvent(null)
      setManualOpen(false)
      window.sessionStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY)
      dispatchPwaInstallAvailability(createPwaInstallAvailability(false))
    }

    const handleRequestOpen = () => {
      if (isStandaloneMode()) return
      setManualOpen(true)
      setDismissed(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, handleRequestOpen)
    dispatchPwaInstallAvailability(createPwaInstallAvailability(Boolean(promptEvent)))

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, handleRequestOpen)
    }
  }, [promptEvent])

  async function handleInstall() {
    if (!promptEvent) return

    await promptEvent.prompt()
    const choice = await promptEvent.userChoice

    if (choice.outcome === 'accepted') {
      setIsInstalled(true)
      setManualOpen(false)
      window.sessionStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY)
    } else {
      if (manualOpen) {
        setManualOpen(false)
      } else {
        window.sessionStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1')
        setDismissed(true)
      }
    }

    setPromptEvent(null)
    dispatchPwaInstallAvailability(createPwaInstallAvailability(false))
  }

  function handleDismiss() {
    if (manualOpen) {
      setManualOpen(false)
      return
    }
    window.sessionStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1')
    setDismissed(true)
  }

  if (!shouldRender) return null

  return (
    <div
      className="install-prompt-backdrop fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(40, 47, 54, 0.32)', backdropFilter: 'blur(2px)' }}
      onClick={handleDismiss}
    >
      <div
        className="install-prompt-panel relative w-full max-w-md rounded-[28px] p-5 shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #FBFBFC, #FAF9FB)', border: '1px solid #DFE0E5' }}
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 rounded-full p-1 transition"
          style={{ color: '#54585E', background: 'transparent' }}
          aria-label="Cerrar"
        >
          <X size={15} />
        </button>

        <div className="pr-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(148,187,102,0.14)', color: '#4A9151' }}>
              <Download size={18} />
            </div>
            <div>
              <p className="text-base font-semibold" style={{ color: '#5C894A' }}>Instalar sistema</p>
              <p className="text-[11px]" style={{ color: '#6B7178' }}>Acceso rapido desde escritorio o dispositivo.</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-snug" style={{ color: '#54585E' }}>
            {promptEvent
              ? 'Podes instalar ProSoft como aplicacion para abrirlo mas rapido y usarlo como sistema independiente.'
              : 'La instalacion todavia no esta habilitada por el navegador en esta sesion. Si estas en desarrollo, recarga la app despues de que la PWA quede registrada o proba con build/preview.'}
          </p>

          {!promptEvent && (
            <div className="mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: '#F4F5F7', border: '1px solid #DFE0E5', color: '#6B7178' }}>
              Requisitos habituales: navegador compatible, `localhost` o HTTPS, service worker activo y manifest cargado.
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={!promptEvent}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
              style={promptEvent
                ? { background: 'linear-gradient(180deg, #94BB66, #4A9151)', border: '1px solid #56874A', color: '#F1FAEF', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }
                : { background: '#F4F5F7', border: '1px solid #DFE0E5', color: '#8B9299', boxShadow: 'none' }}
            >
              Instalar sistema
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg px-3 py-2 text-sm font-medium transition"
              style={{ background: '#FFFFFF', border: '1px solid #DFE0E5', color: '#54585E' }}
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
