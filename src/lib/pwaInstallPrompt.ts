export const PWA_INSTALL_AVAILABILITY_EVENT = 'prosoft:pwa-install-availability'
export const PWA_INSTALL_REQUEST_EVENT = 'prosoft:pwa-install-request'

export type PwaInstallAvailability = {
  available: boolean
  installed: boolean
}

export function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  const standaloneMatch = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return standaloneMatch || navigatorWithStandalone.standalone === true
}

export function createPwaInstallAvailability(available: boolean): PwaInstallAvailability {
  return {
    available,
    installed: isStandaloneMode(),
  }
}

export function dispatchPwaInstallAvailability(detail: PwaInstallAvailability) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<PwaInstallAvailability>(PWA_INSTALL_AVAILABILITY_EVENT, { detail }))
}

export function requestPwaInstallPrompt() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(PWA_INSTALL_REQUEST_EVENT))
}
