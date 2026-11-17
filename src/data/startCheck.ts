/**
 * At start, Firebase Auth asks Google whether the saved sign-in is still valid (accounts:lookup)
 * before it says who is signed in, and nothing of the app (not even the device's own copy of the
 * data) shows until it has. Without a connection that fails at once; on a connection that doesn't
 * work (weak signal in the gym, Wi-Fi without internet) the phone counts as online and Firebase
 * waits 30 s. Measured with tools/offline/run.ts: 30.2 s before the first screen could appear.
 *
 * This lets that one question wait at most START_CHECK_MS while the app is starting. Unanswered,
 * it fails as "no connection", which Firebase answers by keeping the saved sign-in: the app opens
 * from the device and syncs when the signal is back. Any other answer from Google (the account
 * was disabled, the sign-in revoked) still signs out, as before. Later lookups (signing in) are
 * left alone.
 */
export const START_CHECK_MS = 3000
const LOOKUP = 'identitytoolkit.googleapis.com/v1/accounts:lookup'

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** fetch, with the start-up sign-in check given at most `ms` until `started` settles. */
export function capStartCheck(fetchImpl: typeof fetch, started: Promise<unknown>, ms = START_CHECK_MS): typeof fetch {
  let starting = true
  void started.finally(() => {
    starting = false
  })
  return (input, init) => {
    if (!starting || !urlOf(input).includes(LOOKUP)) return fetchImpl(input, init)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('No answer at start', 'TimeoutError')), ms)
    init?.signal?.addEventListener('abort', () => controller.abort(init.signal?.reason))
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
  }
}
