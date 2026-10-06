/*
 * Records how the app's screens appear: node tools/ui/run.ts [scenario…]   (from the repo root)
 *
 * Builds the real app on the stand-in backend (vite.config.ts here), serves it, and drives a
 * headless Chrome the size of a phone with a slowed-down processor. For each scenario it writes to
 * tools/ui/out/<scenario>/:
 *   - frames/NNN_<ms>.jpg   every picture the screen showed, named by the time it appeared
 *   - report.json           what the page showed when (text and background), and every layout
 *                           shift: which element moved, from where to where
 * and prints a summary. A screen that appears well shows few states and no shifts.
 *
 * Without arguments every scenario runs. `--no-build` reuses the last build.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(HERE, 'out')
const PORT = 4179
const DEBUG_PORT = 9333
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync)
/** A phone is several times slower than this PC. */
const CPU_SLOWDOWN = 4
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
/** The stand-in backend's delays (fake/options.ts): a cold start on a phone. */
const BACKEND = 'auth=250&cold=350&db=60&jitter=60'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ── What runs inside the page ────────────────────────────────────────
const RECORDER = `(() => {
  const rec = (window.__rec = { states: [], shifts: [], marks: [] })
  const describe = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement)
    if (!el) return '?'
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : ''
    return el.tagName.toLowerCase() + cls + ' "' + (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) + '"'
  }
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      rec.shifts.push({
        t: Math.round(e.startTime),
        value: Number(e.value.toFixed(4)),
        sources: (e.sources || []).slice(0, 5).map((s) => ({ node: describe(s.node), fromY: Math.round(s.previousRect.y), toY: Math.round(s.currentRect.y), fromH: Math.round(s.previousRect.height), toH: Math.round(s.currentRect.height) })),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
  let last = null
  const tick = () => {
    if (document.body) {
      const bg = getComputedStyle(document.body).backgroundColor
      const text = (document.body.innerText || '').replace(/\\s+/g, ' ').trim()
      if (bg + text !== last) {
        last = bg + text
        rec.states.push({ t: Math.round(performance.now()), bg, chars: text.length, text: text.slice(0, 140) })
      }
    }
    requestAnimationFrame(tick)
  }
  tick()
})()`

// ── A small Chrome DevTools client ───────────────────────────────────
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

// ── Scenarios ────────────────────────────────────────────────────────
interface Step {
  label: string
  /** JavaScript run in the page: usually a click. */
  run: string
  waitMs: number
}
interface Scenario {
  /** Where the page opens, after the "#". */
  start: string
  dark?: boolean
  /** A PC window instead of a phone. */
  desktop?: boolean
  /** Starts signed out: the sign-in screen. */
  signedOut?: boolean
  /** Saved before the page loads, e.g. Pete's theme choice. */
  storage?: Record<string, string>
  settleMs: number
  steps?: Step[]
}

const click = (selector: string) => `document.querySelector(${JSON.stringify(selector)}).click()`
const tab = (name: string) => click(`a.nav-link[href="#/${name}"]`)

const SCENARIOS: Record<string, Scenario> = {
  // Opening the app, as on a phone in dark mode.
  'cold-start': { start: '/train', dark: true, settleMs: 2500 },
  // The phone is dark, Pete chose the light theme.
  'cold-start-light-chosen': { start: '/train', dark: true, storage: { pg_theme_v1: 'light' }, settleMs: 2500 },
  'cold-start-clients': { start: '/clients', dark: true, settleMs: 2500 },
  // Moving between the tabs: the first visit of each, then coming back.
  tabs: {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Clients, first visit', run: tab('clients'), waitMs: 900 },
      { label: 'Create, first visit', run: tab('create'), waitMs: 900 },
      { label: 'Train again', run: tab('train'), waitMs: 700 },
      { label: 'Clients again', run: tab('clients'), waitMs: 700 },
      { label: 'Create again', run: tab('create'), waitMs: 700 },
    ],
  },
  // Into a client, into their programme, and back out.
  deeper: {
    start: '/clients',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Open a client', run: click('a.line-link[href^="#/clients/c"]'), waitMs: 900 },
      { label: 'Open their programme', run: click('.paper-day'), waitMs: 900 },
      { label: 'Back to the client', run: 'history.back()', waitMs: 700 },
      { label: 'Back to Clients', run: 'history.back()', waitMs: 700 },
    ],
  },
  // Train: an exercise opens under its line, and closes again.
  'open-card': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Open the first exercise', run: click('.ex-line'), waitMs: 800 },
      { label: 'Close it', run: click('.ex-line'), waitMs: 600 },
    ],
  },
  // From a list scrolled down: into a client near the bottom, and back to the same place.
  scrolled: {
    start: '/clients',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Scroll down', run: 'window.scrollTo(0, 700)', waitMs: 400 },
      { label: 'Open a client', run: click('a.line-link[href="#/clients/c15"]'), waitMs: 900 },
      { label: 'Back to the list', run: 'history.back()', waitMs: 900 },
    ],
  },
  // A page opened the moment the app is up, before the other screens were fetched in the background.
  'early-open': {
    start: '/train',
    dark: true,
    settleMs: 0,
    steps: [{ label: 'Create as soon as the tabs are there', run: `new Promise((done) => { const t = setInterval(() => { const a = document.querySelector('a.nav-link[href="#/create"]'); if (a) { clearInterval(t); a.click(); done() } }, 10) })`, waitMs: 1500 }],
  },
  // Writing: a new blank programme opens with its edit sheet, and a tweak in Train shows at once.
  writes: {
    start: '/create',
    dark: true,
    settleMs: 2000,
    steps: [
      { label: 'NEW', run: click('.dial'), waitMs: 700 },
      { label: 'Pick the first person', run: click('.sheet .line-link'), waitMs: 1200 },
    ],
  },
  // A start while signed out.
  'signed-out': { start: '/train', dark: true, signedOut: true, settleMs: 2000 },
  // On the PC: the navigation is a rail on the left.
  'desktop-start': { start: '/clients', desktop: true, settleMs: 2500, steps: [{ label: 'Train', run: tab('train'), waitMs: 800 }] },
}

interface Recording {
  states: { t: number; bg: string; chars: number; text: string }[]
  shifts: { t: number; value: number; sources: { node: string; fromY: number; toY: number; fromH: number; toH: number }[] }[]
  marks: { t: number; label: string }[]
}

async function record(chrome: Chrome, name: string, scenario: Scenario): Promise<Recording & { frames: number }> {
  const dir = join(OUT, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'frames'), { recursive: true })

  await chrome.send('Emulation.setDeviceMetricsOverride', scenario.desktop ? DESKTOP : PHONE)
  await chrome.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scenario.dark ? 'dark' : 'light' }] })
  // A blank page first, so the app's own page starts from nothing; storage is set on its origin.
  await chrome.send('Page.navigate', { url: `http://localhost:${PORT}/blank.html` })
  await sleep(300)
  await chrome.evaluate(`localStorage.clear(); sessionStorage.clear(); ${Object.entries(scenario.storage ?? {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join(';')}`)

  let frames = 0
  let startedAt = 0
  chrome.on('Page.screencastFrame', (params) => {
    const { data, sessionId, metadata } = params as { data: string; sessionId: number; metadata: { timestamp: number } }
    startedAt ||= metadata.timestamp
    const ms = Math.round((metadata.timestamp - startedAt) * 1000)
    writeFileSync(join(dir, 'frames', `${String(frames++).padStart(3, '0')}_${ms}.jpg`), Buffer.from(data, 'base64'))
    void chrome.send('Page.screencastFrameAck', { sessionId })
  })
  await chrome.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
  await chrome.send('Page.navigate', { url: `http://localhost:${PORT}/?${BACKEND}${scenario.signedOut ? '&out=1' : ''}#${scenario.start}` })
  await sleep(scenario.settleMs)
  for (const step of scenario.steps ?? []) {
    await chrome.evaluate(`window.__rec.marks.push({ t: Math.round(performance.now()), label: ${JSON.stringify(step.label)} }); ${step.run}`)
    await sleep(step.waitMs)
  }
  await chrome.send('Page.stopScreencast')
  const recording = await chrome.evaluate<Recording>('window.__rec')
  writeFileSync(join(dir, 'report.json'), JSON.stringify(recording, null, 2))
  return { ...recording, frames }
}

function summarise(name: string, r: Recording & { frames: number }) {
  console.log(`\n=== ${name}: ${r.states.length} states, ${r.shifts.length} layout shifts (total ${r.shifts.reduce((n, s) => n + s.value, 0).toFixed(3)}), ${r.frames} frames`)
  const events = [
    ...r.marks.map((m) => ({ t: m.t, line: `>> ${m.label}` })),
    ...r.states.map((s) => ({ t: s.t, line: `state  ${s.bg.replace(/\s/g, '')}  ${s.chars} chars  ${s.text.slice(0, 90)}` })),
    ...r.shifts.map((s) => ({ t: s.t, line: `SHIFT  ${s.value}  ${s.sources.map((x) => `${x.node} y ${x.fromY}→${x.toY}`).join(' | ')}` })),
  ].sort((a, b) => a.t - b.t)
  for (const e of events) console.log(`${String(e.t).padStart(6)} ms  ${e.line}`)
}

// ── Run ──────────────────────────────────────────────────────────────
if (!CHROME) throw new Error('Chrome is not installed where expected.')
const args = process.argv.slice(2)
const wanted = args.filter((a) => !a.startsWith('--'))
for (const name of wanted) if (!SCENARIOS[name]) throw new Error(`No scenario "${name}". There are: ${Object.keys(SCENARIOS).join(', ')}`)

const npx = (command: string[]): ChildProcess => spawn('npx', command, { cwd: ROOT, shell: true, stdio: 'ignore' })
if (!args.includes('--no-build')) {
  await new Promise<void>((resolve, reject) => npx(['vite', 'build', '--config', 'tools/ui/vite.config.ts']).on('exit', (code) => (code === 0 ? resolve() : reject(new Error('The test build failed.')))))
}
writeFileSync(join(HERE, 'dist', 'blank.html'), '<!doctype html><title>blank</title>')

const profile = mkdtempSync(join(tmpdir(), 'pg-chrome-'))
const server = npx(['vite', 'preview', '--config', 'tools/ui/vite.config.ts'])
const browser = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://localhost:${PORT}/blank.html`).then((r) => r.ok, () => false)) break
    await sleep(200)
  }
  const chrome = new Chrome()
  await chrome.connect()
  await chrome.send('Page.enable')
  await chrome.send('Emulation.setDeviceMetricsOverride', PHONE)
  await chrome.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER })
  for (const name of wanted.length ? wanted : Object.keys(SCENARIOS)) summarise(name, await record(chrome, name, SCENARIOS[name]))
  console.log(`\nFrames and reports: ${OUT}`)
} finally {
  browser.kill()
  // The preview server runs under a shell: end the whole tree.
  if (server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  await sleep(500)
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}
