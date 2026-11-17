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
  const rec = (window.__rec = { states: [], shifts: [], marks: [], ticks: [] })
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
  const tick = (now) => {
    rec.ticks.push(Math.round(now * 10) / 10)
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
  requestAnimationFrame(tick)
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
/** A tap as the screen delivers it: finger down, up, then the click, all to whatever lies on top at the middle of the element. */
const tapAt = (selector: string) => `(() => {
  const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  const hit = document.elementFromPoint(x, y)
  for (const type of ['pointerdown', 'pointerup']) hit.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y }))
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
})()`
/**
 * A tap in the order a phone delivers it: finger down, finger up, and only then the click, hit-tested
 * again at that moment (after the page has reacted to the finger lifting), like Chrome on Android.
 */
const fingerTap = (selector: string) => `(() => {
  const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true }
  document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', opts))
  setTimeout(() => {
    document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerup', opts))
    requestAnimationFrame(() => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', opts)))
  }, 80)
})()`
/** Adds to the step's line in the timeline what the resting face is doing: its state, what is faded, where the clock is, what lies on top at an exercise. */
const REST_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  const dial = document.querySelector('.dial').getBoundingClientRect()
  const line = document.querySelector('.ex-line').getBoundingClientRect()
  const top = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2)
  mark.label += ': rest=' + document.documentElement.dataset.rest + ', page opacity ' + getComputedStyle(document.querySelector('.big-title')).opacity + ', nav opacity ' + getComputedStyle(document.querySelector('.nav')).opacity
    + ', clock middle at ' + Math.round((dial.top + dial.height / 2) / innerHeight * 100) + '% of the screen, dial says "' + document.querySelector('.dial-sub').textContent + '", open cards ' + document.querySelectorAll('.drop').length
    + ', paused ' + document.querySelector('.dial').classList.contains('dial-paused') + ', on top at the exercise: ' + top.tagName.toLowerCase() + ', scrollY ' + Math.round(scrollY)
})()`
/** The resting face outside Train: its state, the page's and the clock's opacity, where the clock is, the address and scroll. */
const GLOBAL_REST_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  const clock = document.querySelector('.rest-clock .dial')
  const dock = document.querySelector('.rest-clock .dial-dock')
  const r = clock ? clock.getBoundingClientRect() : null
  mark.label += ': rest=' + document.documentElement.dataset.rest + ', page opacity ' + getComputedStyle(document.querySelector('.shell-main')).opacity
    + ', resting clock ' + (dock ? getComputedStyle(dock).visibility + ' ' + getComputedStyle(dock).opacity + ' at ' + Math.round((r.top + r.height / 2) / innerHeight * 100) + '%, says "' + document.querySelector('.rest-clock .dial-sub').textContent + '", paused ' + clock.classList.contains('dial-paused') : 'none')
    + ', at ' + location.hash + ', scrollY ' + Math.round(scrollY)
    + ', dials ' + document.querySelectorAll('.dial').length
})()`
/** Where the programme page's button pair is, against the tabs, and which exercise the document shows first. */
const BAR_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  const bar = document.querySelector('.action-bar').getBoundingClientRect()
  const nav = document.querySelector('.nav').getBoundingClientRect()
  const first = [...document.querySelectorAll('.paper-doc .ex')].find((e) => e.getBoundingClientRect().top >= 0)
  mark.label += ': bar bottom ' + Math.round(bar.bottom) + ', nav top ' + Math.round(nav.top) + ', bar on screen ' + (bar.bottom <= innerHeight) + ', scrollY ' + Math.round(scrollY) + ', first exercise in view "' + (first ? first.querySelector('.ex-name').textContent + '" (' + first.dataset.row + ')' : '"')
})()`
/** Which exercise the Edit sheet shows at its top, and which card is open there. */
const SHEET_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  const body = document.querySelector('.sheet .sheet-body')
  const top = body.getBoundingClientRect().top
  const first = [...body.querySelectorAll('.ex')].find((e) => e.getBoundingClientRect().top >= top)
  const open = body.querySelector('.ex.open .ex-name')
  mark.label += ': sheet scrollTop ' + Math.round(body.scrollTop) + ', first exercise "' + (first ? first.querySelector('.ex-name').textContent + '" (' + first.dataset.row + ') ' + Math.round(first.getBoundingClientRect().top - top) + 'px down' : '"') + ', open card "' + (open ? open.textContent : '') + '"'
})()`
/** The fitness profile link line in the open menu: its title and meta. */
const LINK_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  const line = [...document.querySelectorAll('.sheet button')].find((b) => /profile link|Share link/.test(b.textContent))
  mark.label += ': "' + (line ? line.innerText.replace(/\\n+/g, ' / ') : 'no link line') + '"'
})()`
/** What the app opened or shared so far (needs the recorders of 'whatsapp-link'). */
const OPENED_PROBE = `(() => {
  const mark = window.__rec.marks[window.__rec.marks.length - 1]
  mark.label += ': ' + (window.__opened.length ? window.__opened.map((o) => decodeURIComponent(o).slice(0, 170)).join(' | ') : 'nothing')
  window.__opened = []
})()`
const tab = (name: string) => click(`a.nav-link[href="#/${name}"]`)

const SCENARIOS: Record<string, Scenario> = {
  // Opening the app, as on a phone in dark mode.
  'cold-start': { start: '/train', dark: true, settleMs: 2500 },
  // As the installed app opens: at its root address, which forwards to Train.
  'cold-start-root': { start: '/', dark: true, settleMs: 2500 },
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
  // A client's profile sheet: every box is as tall as its text.
  'edit-profile': {
    start: '/clients/c1',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'More', run: click('.icon-btn[aria-label^="More for"]'), waitMs: 700 },
      { label: 'Edit profile', run: click('.sheet .line-link'), waitMs: 900 },
      { label: 'Scroll the sheet to its end', run: `document.querySelector('#client-background').scrollIntoView({ block: 'end' })`, waitMs: 500 },
    ],
  },
  // The same on the PC.
  'desktop-card': {
    start: '/train',
    desktop: true,
    settleMs: 2500,
    steps: [
      { label: 'Open the first exercise', run: click('.ex-line'), waitMs: 1200 },
      { label: 'Close it', run: click('.ex-line'), waitMs: 800 },
    ],
  },
  // The PC again, seven times over: a fault at the end of the opening showed in about one opening
  // in four. Every frame after loading should be about the same size on disk; a much smaller one is a broken picture.
  'desktop-card-loop': {
    start: '/train',
    desktop: true,
    settleMs: 2500,
    steps: Array.from({ length: 14 }, (_, i) => ({ label: i % 2 ? 'Close' : 'Open', run: click('.ex-line'), waitMs: i % 2 ? 700 : 1000 })),
  },
  // Train: with one exercise open, another is tapped: the first closes while the second opens.
  'switch-card': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Open the first exercise', run: click('.ex-line'), waitMs: 700 },
      { label: 'Open the third', run: `document.querySelectorAll('.ex-line')[2].click()`, waitMs: 800 },
    ],
  },
  // Train: start a session (the dial becomes the clock), then finish it with two taps.
  session: {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 2000 },
      { label: 'FINISH, first tap', run: click('.dial'), waitMs: 600 },
      { label: 'FINISH, second tap', run: click('.dial'), waitMs: 1200 },
    ],
  },
  // Train: a running session left untouched fades out around the clock (the resting face). A tap
  // on a faded exercise brings the app back and opens nothing; a tap on the resting clock works as
  // always and stays resting, Pause and Resume included. The app is left and come back to: resting
  // at once. Finishing on the resting clock brings the app back by itself.
  rest: {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 9000 },
      { label: 'Still awake', run: REST_PROBE, waitMs: 2500 },
      { label: 'Resting', run: REST_PROBE, waitMs: 300 },
      { label: 'Tap a faded exercise', run: fingerTap('.ex-line'), waitMs: 1200 },
      { label: 'Awake again', run: REST_PROBE, waitMs: 10800 },
      { label: 'Resting again', run: REST_PROBE, waitMs: 300 },
      { label: 'FINISH, first tap, on the resting clock', run: tapAt('.dial'), waitMs: 800 },
      { label: 'Still resting, armed', run: REST_PROBE, waitMs: 3000 },
      { label: 'Pause, on the resting clock', run: tapAt('.dial-side'), waitMs: 1200 },
      { label: 'Still resting, paused', run: REST_PROBE, waitMs: 300 },
      { label: 'Resume, on the resting clock', run: tapAt('.dial-side'), waitMs: 1200 },
      { label: 'Still resting, running', run: REST_PROBE, waitMs: 300 },
      { label: 'Tap the empty screen', run: tapAt('.ex-line'), waitMs: 1200 },
      { label: 'Awake', run: REST_PROBE, waitMs: 300 },
      { label: 'Tap an exercise, awake', run: fingerTap('.ex-line'), waitMs: 800 },
      { label: 'It opens', run: REST_PROBE, waitMs: 300 },
      { label: 'Close it', run: fingerTap('.ex-line'), waitMs: 800 },
      { label: 'Leave the app and come back', run: `document.dispatchEvent(new Event('visibilitychange'))`, waitMs: 600 },
      { label: 'Resting at once', run: REST_PROBE, waitMs: 300 },
      { label: 'FINISH, first tap', run: tapAt('.dial'), waitMs: 600 },
      { label: 'FINISH, second tap', run: tapAt('.dial'), waitMs: 1200 },
      { label: 'Back by itself', run: `(() => { const mark = window.__rec.marks[window.__rec.marks.length - 1]; mark.label += ': rest=' + document.documentElement.dataset.rest + ', nav opacity ' + getComputedStyle(document.querySelector('.nav')).opacity + ', dial says "' + document.querySelector('.dial-short').textContent + '"' })()`, waitMs: 300 },
    ],
  },
  // Train: the clock swells at Start and shrinks back at Finish; in between the session is made
  // an hour and more old, to see that "1:02:05" fits the clock's face, also on the resting face.
  'long-session': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 1500 },
      { label: 'Over an hour', run: `(() => { const w = JSON.parse(localStorage.getItem('pg_active_workout_v2')); w.startedAt -= 3725000; localStorage.setItem('pg_active_workout_v2', JSON.stringify(w)); window.dispatchEvent(new Event('pg:active-workout')) })()`, waitMs: 1500 },
      { label: 'Wait', run: '0', waitMs: 9500 },
      { label: 'Resting', run: REST_PROBE, waitMs: 300 },
      { label: 'Tap the empty screen', run: tapAt('.ex-line'), waitMs: 1000 },
      { label: 'FINISH, first tap', run: tapAt('.dial'), waitMs: 600 },
      { label: 'FINISH, second tap', run: tapAt('.dial'), waitMs: 1500 },
    ],
  },
  // The same on the PC, where the dial is a button in the rail.
  'desktop-session': { start: '/train', desktop: true, settleMs: 2500, steps: [{ label: 'Start session', run: click('.dial'), waitMs: 1500 }] },
  // Pete's clock runs while he opens a client's programme (read-only, no clock there), then Train
  // shows his clock again; it was never hidden or stopped.
  // The fitness profile link goes straight to the client's WhatsApp number when the profile has one
  // (c1 has a made-up number), else through the share sheet (c0 has none). window.open and
  // navigator.share are replaced by recorders: what the app opened is added to the step's line.
  'whatsapp-link': {
    start: '/clients/c1',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Recorders', run: `window.__opened = []; window.open = (url) => { window.__opened.push('open ' + url); return null }; navigator.share = async (data) => { window.__opened.push('share ' + data.url) }`, waitMs: 100 },
      { label: 'More', run: click('.icon-btn[aria-label^="More for"]'), waitMs: 700 },
      { label: 'Line', run: LINK_PROBE, waitMs: 100 },
      { label: 'Tap the link line', run: `[...document.querySelectorAll('.sheet button')].find((b) => /profile link|Share link/.test(b.textContent)).click()`, waitMs: 1500 },
      { label: 'Line', run: LINK_PROBE, waitMs: 100 },
      { label: 'Tap again', run: `[...document.querySelectorAll('.sheet button')].find((b) => /profile link|Share link/.test(b.textContent)).click()`, waitMs: 700 },
      { label: 'Opened', run: OPENED_PROBE, waitMs: 100 },
      { label: 'Close', run: `history.back()`, waitMs: 700 },
      { label: 'Client without a number', run: `location.hash = '#/clients/c0'`, waitMs: 1200 },
      { label: 'More', run: click('.icon-btn[aria-label^="More for"]'), waitMs: 700 },
      { label: 'Line', run: LINK_PROBE, waitMs: 100 },
      { label: 'Tap the link line', run: `[...document.querySelectorAll('.sheet button')].find((b) => /profile link|Share link/.test(b.textContent)).click()`, waitMs: 1500 },
      { label: 'Tap again', run: `[...document.querySelectorAll('.sheet button')].find((b) => /profile link|Share link/.test(b.textContent)).click()`, waitMs: 700 },
      { label: 'Opened', run: OPENED_PROBE, waitMs: 100 },
      { label: 'Close', run: `history.back()`, waitMs: 700 },
      { label: 'Clients', run: tab('clients'), waitMs: 1000 },
      { label: 'ADD', run: click('.dial'), waitMs: 900 },
      { label: 'Type a name and a number', run: `(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        for (const [id, value] of [['client-name', 'Test Person'], ['client-mobile', '0151 000 00000']]) {
          const input = document.getElementById(id)
          set.call(input, value)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      })()`, waitMs: 400 },
      { label: 'Line', run: LINK_PROBE, waitMs: 100 },
    ],
  },
  'client-adjust': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 1500 },
      { label: 'Clients', run: tab('clients'), waitMs: 800 },
      { label: 'Open the client', run: click('a.line-link[href="#/clients/c0"]'), waitMs: 900 },
      { label: 'A programme', run: click('a.leader-link'), waitMs: 1000 },
      { label: 'Open an exercise', run: click('.paper-doc .ex-line'), waitMs: 900 },
      { label: 'Card', run: `(() => { const mark = window.__rec.marks[window.__rec.marks.length - 1]; mark.label += ': steppers ' + document.querySelectorAll('.paper-doc .ex.open button').length + ' buttons, dials on page ' + document.querySelectorAll('.dial').length })()`, waitMs: 300 },
      { label: 'Train', run: tab('train'), waitMs: 1200 },
      { label: 'Clock', run: `(() => { const mark = window.__rec.marks[window.__rec.marks.length - 1]; mark.label += ': dial says "' + document.querySelector('.dial').textContent + '", disabled ' + document.querySelector('.dial').disabled })()`, waitMs: 300 },
    ],
  },
  // Tabs while the clock runs: Train's clock and another tab's plain action (ADD, NEW) are
  // different buttons, so the dial must not cross-fade one into the other.
  'session-tabs': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 1500 },
      { label: 'Clients', run: tab('clients'), waitMs: 1000 },
      { label: 'Create', run: tab('create'), waitMs: 1000 },
      { label: 'Train', run: tab('train'), waitMs: 1000 },
    ],
  },
  // The resting face on any page: the clock runs, Pete is on a client's page (scrolled) and on
  // Clients; left untouched the page fades and the clock appears. A tap elsewhere brings the same
  // page back where it was; Pause works on the resting clock; the faded "Add client" can't be
  // pressed; Finish's two taps bring the page back.
  'rest-anywhere': {
    start: '/train',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'START', run: click('.dial'), waitMs: 1200 },
      { label: 'Clients', run: tab('clients'), waitMs: 800 },
      { label: 'Open the client', run: click('a.line-link[href="#/clients/c0"]'), waitMs: 900 },
      { label: 'Scroll a little', run: 'scrollTo(0, 120)', waitMs: 11000 },
      { label: 'Resting', run: GLOBAL_REST_PROBE, waitMs: 300 },
      { label: 'Tap the faded Send button', run: fingerTap('.button-pair .btn-cta'), waitMs: 1200 },
      { label: 'Awake', run: `${GLOBAL_REST_PROBE.slice(0, -4)}; window.__rec.marks[window.__rec.marks.length - 1].label += ', sheets open ' + document.querySelectorAll('.sheet, [role=dialog]').length })()`, waitMs: 10800 },
      { label: 'Resting again', run: GLOBAL_REST_PROBE, waitMs: 300 },
      { label: 'Pause, on the resting clock', run: tapAt('.rest-clock .dial-side'), waitMs: 1200 },
      { label: 'Still resting, paused', run: GLOBAL_REST_PROBE, waitMs: 300 },
      { label: 'Resume', run: tapAt('.rest-clock .dial-side'), waitMs: 800 },
      { label: 'Tap the empty screen', run: tapAt('.topbar'), waitMs: 600 },
      { label: 'Clients tab', run: tab('clients'), waitMs: 11000 },
      { label: 'Resting on Clients', run: GLOBAL_REST_PROBE, waitMs: 300 },
      { label: 'Tap where Add client is', run: fingerTap('.shell-main .dial'), waitMs: 1200 },
      { label: 'Awake, no sheet', run: `${GLOBAL_REST_PROBE.slice(0, -4)}; window.__rec.marks[window.__rec.marks.length - 1].label += ', sheets open ' + document.querySelectorAll('.sheet, [role=dialog]').length })()`, waitMs: 10800 },
      { label: 'FINISH, first tap', run: tapAt('.rest-clock .dial'), waitMs: 600 },
      { label: 'FINISH, second tap', run: tapAt('.rest-clock .dial'), waitMs: 1200 },
      { label: 'Back by itself', run: GLOBAL_REST_PROBE, waitMs: 300 },
    ],
  },
  // A programme's page: the button pair stays above the tabs while the document scrolls, and
  // Edit programme opens on the exercise in view (its card open if it was open), else at the top.
  'edit-here': {
    start: '/clients',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Open the client', run: click('a.line-link[href="#/clients/c0"]'), waitMs: 900 },
      { label: 'A programme', run: click('a.leader-link'), waitMs: 1000 },
      { label: 'At the top', run: BAR_PROBE, waitMs: 300 },
      { label: 'Edit programme, from the top', run: click('.action-bar .btn-outline'), waitMs: 1200 },
      { label: 'Sheet', run: SHEET_PROBE, waitMs: 300 },
      { label: 'Done', run: 'history.back()', waitMs: 900 },
      { label: 'Scroll into day 2', run: `scrollTo(0, document.querySelectorAll('.paper-doc .day')[1].getBoundingClientRect().top + scrollY - 40)`, waitMs: 800 },
      { label: 'Scrolled', run: BAR_PROBE, waitMs: 300 },
      { label: 'Edit programme, scrolled', run: click('.action-bar .btn-outline'), waitMs: 1200 },
      { label: 'Sheet', run: SHEET_PROBE, waitMs: 300 },
      { label: 'Done', run: 'history.back()', waitMs: 900 },
      { label: 'Open an exercise', run: `document.querySelectorAll('.paper-doc .ex-line')[5].click()`, waitMs: 900 },
      { label: 'Edit programme, card open', run: click('.action-bar .btn-outline'), waitMs: 1200 },
      { label: 'Sheet', run: SHEET_PROBE, waitMs: 300 },
      { label: 'Done', run: 'history.back()', waitMs: 900 },
      { label: 'Scroll to the end', run: 'scrollTo(0, document.body.scrollHeight)', waitMs: 800 },
      { label: 'At the end', run: BAR_PROBE, waitMs: 300 },
    ],
  },
  // A client's page: an earlier programme opened for the first time, back, and opened again.
  earlier: {
    start: '/clients',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Open the client', run: click('a.line-link[href="#/clients/c0"]'), waitMs: 900 },
      { label: 'Earlier programme, first time', run: click('a.leader-link'), waitMs: 1000 },
      { label: 'Back', run: 'history.back()', waitMs: 800 },
      { label: 'Earlier programme, second time', run: click('a.leader-link'), waitMs: 1000 },
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
  // A client far down the list whose own page is long: in, scroll their page, and Back.
  'tall-back': {
    start: '/clients',
    dark: true,
    settleMs: 2500,
    steps: [
      { label: 'Scroll the list down', run: 'window.scrollTo(0, 900)', waitMs: 400 },
      { label: 'Open the client', run: click('a.line-link[href="#/clients/c18"]'), waitMs: 900 },
      { label: 'Back', run: 'history.back()', waitMs: 900 },
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
  /** When each frame was drawn (ms), to see how evenly a movement ran. */
  ticks: number[]
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
  // How evenly the half second after each step was drawn: a smooth movement has no long gaps.
  for (const m of r.marks) {
    const times = r.ticks.filter((f) => f >= m.t && f <= m.t + 500)
    const gaps = times.slice(1).map((f, i) => f - times[i])
    if (gaps.length) events.push({ t: m.t, line: `   frames after "${m.label}": ${gaps.length} drawn, longest gap ${Math.round(Math.max(...gaps))} ms, ${gaps.filter((g) => g > 34).length} gaps over 34 ms` })
  }
  events.sort((a, b) => a.t - b.t)
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
