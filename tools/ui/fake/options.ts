/*
 * How the stand-in backend behaves, set from the page address before the "#":
 *   ?auth=250   ms until the sign-in state is known (the real one reads it from IndexedDB)
 *   &cold=350   ms until the very first database answer (opening the offline copy)
 *   &db=60      ms for every later first answer of a listener
 *   &jitter=60  up to this many ms more per listener, so they answer in a different order
 *   &out=1      start signed out
 */
const params = new URLSearchParams(window.location.search)
const num = (name: string, fallback: number) => (params.has(name) ? Number(params.get(name)) : fallback)

export const OPTIONS = {
  auth: num('auth', 250),
  cold: num('cold', 350),
  db: num('db', 60),
  jitter: num('jitter', 60),
  signedOut: params.get('out') === '1',
}

/** The same "random" numbers on every run, so two runs can be compared. */
let seed = 7
export function jitter(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return Math.round((seed / 2147483648) * OPTIONS.jitter)
}
