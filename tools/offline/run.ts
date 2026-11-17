/*
 * How long the app waits at start when the phone has a connection that doesn't work:
 *   node tools/offline/run.ts            (from the repo root)
 *
 * Loads the app's own Firebase set-up (src/firebase.ts) in a headless Chrome, signs in as the
 * owner with a token made by the service account (as tools/livecheck.ts does), lets the device's
 * copy of the clients fill, then reloads the page three ways:
 *   online     nothing held back
 *   lie-fi     Google's servers never answer (weak signal, or Wi-Fi without internet that hangs)
 *   refused    Google's servers refuse at once (Wi-Fi without internet that says so)
 * and prints when Firebase said who is signed in and when the first list of clients arrived.
 * The app shows its first screen only after both. Counts and times only; nothing is written,
 * and the Chrome profile (with its copy of the data) is deleted at the end.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp as adminApp, cert } from 'firebase-admin/app'
import { getAuth as adminAuth } from 'firebase-admin/auth'
import { createServer } from 'vite'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const PORT = 5197
const DEBUG_PORT = 9337
/** Longer than Firebase's own 30 s wait, so a hang shows as the full wait. */
const GIVE_UP_MS = 45_000
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync)
if (!CHROME) throw new Error('Chrome is not installed where expected.')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

class Chrome {
  private socket!: WebSocket
  private nextId = 1
  private waiting = new Map<number, (result: Record<string, unknown>) => void>()
  private handlers = new Map<string, (params: Record<string, unknown>) => void>()
  async connect() {
    for (let i = 0; i < 50; i++) {
      try {
        const pages = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
        const page = pages.find((p) => p.type === 'page')
        if (page) {
          this.socket = new WebSocket(page.webSocketDebuggerUrl)
          await new Promise((resolve, reject) => {
            this.socket.onopen = resolve
            this.socket.onerror = reject
          })
          this.socket.onmessage = (event) => {
            const message = JSON.parse(String(event.data)) as { id?: number; method?: string; result?: Record<string, unknown>; params?: Record<string, unknown> }
            if (message.id !== undefined) this.waiting.get(message.id)?.(message.result ?? {})
            else if (message.method) this.handlers.get(message.method)?.(message.params ?? {})
          }
          return
        }
      } catch {
        // Chrome is still starting.
      }
      await sleep(200)
    }
    throw new Error('Chrome did not start.')
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve) => this.waiting.set(id, resolve))
  }
  on(method: string, handler: (params: Record<string, unknown>) => void) {
    this.handlers.set(method, handler)
  }
  async evaluate<T>(expression: string): Promise<T> {
    const { result } = (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as { result: { value: T } }
    return result.value
  }
}

interface Log {
  auth: number | null
  signedIn: boolean | null
  clients: number | null
  fromCache: boolean | null
  count: number | null
}

type Mode = 'online' | 'lie-fi' | 'refused'
async function reload(chrome: Chrome, mode: Mode): Promise<Log> {
  await chrome.send('Fetch.disable')
  if (mode !== 'online') {
    // Only Google's servers: the page itself still loads, as it does from the service worker.
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*googleapis.com*' }, { urlPattern: '*google.com*' }] })
    chrome.on('Fetch.requestPaused', (params) => {
      // lie-fi: never answered. refused: the connection fails at once.
      if (mode === 'refused') void chrome.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'InternetDisconnected' })
    })
  }
  await chrome.send('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
  const started = Date.now()
  let log: Log | null = null
  while (Date.now() - started < GIVE_UP_MS) {
    await sleep(100)
    log = await chrome.evaluate<Log | null>('window.__log ? { ...window.__log } : null').catch(() => null)
    if (log && log.auth !== null && (log.signedIn === false || log.clients !== null)) break
  }
  return log ?? { auth: null, signedIn: null, clients: null, fromCache: null, count: null }
}

const uid = /uid == '([A-Za-z0-9]{20,})'/.exec(readFileSync(join(ROOT, 'firestore.rules'), 'utf8'))![1]
const admin = adminApp({ credential: cert(process.env.PETESGYM_KEY ?? join(homedir(), '.petesgym', 'service-account.json')) })
const token = await adminAuth(admin).createCustomToken(uid)

const server = await createServer({ root: HERE, configFile: false, logLevel: 'silent', server: { port: PORT, strictPort: true, fs: { allow: [ROOT] } } })
await server.listen()
const profile = mkdtempSync(join(tmpdir(), 'pg-offline-'))
const browser = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
try {
  const chrome = new Chrome()
  await chrome.connect()
  await chrome.send('Page.enable')
  await chrome.send('Page.navigate', { url: `http://localhost:${PORT}/index.html` })
  for (let i = 0; i < 100 && !(await chrome.evaluate<boolean>('Boolean(window.__signIn)').catch(() => false)); i++) await sleep(200)
  const count = await chrome.evaluate<number>(`window.__signIn(${JSON.stringify(token)})`)
  console.log(`Signed in; ${count} clients in the device's copy.\n`)
  const rounds = Number(process.argv.find((a) => a.startsWith('--rounds='))?.slice(9) ?? 1)
  for (const mode of ['online', 'lie-fi', 'refused'] as Mode[]) {
    for (let i = 0; i < rounds; i++) {
      const log = await reload(chrome, mode)
      const auth = log.auth === null ? `no answer in ${GIVE_UP_MS / 1000} s` : `${log.auth} ms (${log.signedIn ? 'signed in' : 'SIGNED OUT'})`
      const clients = log.clients === null ? '—' : `${log.clients} ms (${log.count}, ${log.fromCache ? 'from the device' : 'from the server'})`
      console.log(`${mode.padEnd(8)} sign-in known ${auth.padEnd(28)} clients ${clients}`)
    }
  }
} finally {
  browser.kill()
  await server.close()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}
process.exit(0)
