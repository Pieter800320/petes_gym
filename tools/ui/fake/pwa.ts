// Stand-in for virtual:pwa-register/react: no service worker in the test build.
export function useRegisterSW() {
  return { needRefresh: [false, () => undefined], offlineReady: [false, () => undefined], updateServiceWorker: async () => undefined }
}
