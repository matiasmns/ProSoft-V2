import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30

export function registerProsoftPwa() {
  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('PWA lista. Los recursos del frontend quedan disponibles offline.')
    },
    onNeedRefresh() {
      const applyUpdate = () => { void updateSW(true) }

      if (document.visibilityState === 'hidden') {
        applyUpdate()
        return
      }

      const onVisibilityChange = () => {
        if (document.visibilityState !== 'hidden') return
        document.removeEventListener('visibilitychange', onVisibilityChange)
        applyUpdate()
      }

      document.addEventListener('visibilitychange', onVisibilityChange)
    },
    onRegisteredSW(_swUrl: string | undefined, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return

      window.setInterval(() => {
        if (!navigator.onLine) return
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
    onRegisterError(error: unknown) {
      console.error('No se pudo registrar la PWA.', error)
    },
  })
}
