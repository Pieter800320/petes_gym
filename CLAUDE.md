# CLAUDE.md — Pete's Gym (working guardrails for Claude Code)

Read `PIETER_STACK.md` first: it holds Pieter's cross-project collaboration rules (challenge him,
options labelled Recommended / Alternative / Avoid, `⚠️ CONFLICT:` format, never break working
features). This file holds only what is specific to this repo.

Blueprint (decisions, wireframes, Coach Playbook draft, roadmap):
https://claude.ai/artifact/TLW5JR7EVsawbaVmp57uh1

## 0. Current state

- **Version:** 0.1.0, milestone **M1 Foundation**: app shell, Firebase sign-in + offline sync,
  clients, notes (general and per client), exercise library browser, settings, light/dark theme.
- **Next:** M2 Train (programme view, session tabs, live session with set logging + stopwatch),
  then M3 Export (HTML + Word, Sophie house style, EN/DE), M4 Create (Claude), M5 Archive import.

## 1. Stack (fixed)

| Layer | Choice | Why |
|---|---|---|
| App | React 19 + TypeScript + Vite, installable PWA (`vite-plugin-pwa`) | One codebase for phone and PC |
| Data | Firebase Firestore with `persistentLocalCache` | Offline-first; syncs phone ↔ PC |
| Auth | Firebase Auth, Google sign-in | |
| Hosting | GitHub Pages via `.github/workflows/deploy.yml`, base `/petes_gym/` | Free, deploys on push to `main` |
| Routing | `HashRouter` | GitHub Pages has no rewrites |
| Fonts | Oswald / IBM Plex Sans / IBM Plex Mono via `@fontsource` (latin subsets) | Match the Sophie export style; bundled for offline |

## 2. Rules specific to this repo

- **Offline writes are fire-and-forget.** Never `await` a Firestore write in UI code: the promise only
  resolves when the server acknowledges, which never happens without signal. Use the helpers in
  `src/data/store.ts` (they attach `.catch(reportWriteError)`).
- **Avoid composite indexes.** Don't combine `where()` with `orderBy()` on another field; filter in
  Firestore, sort on the device (see `useNotes`).
- **The Anthropic API key never leaves the device.** It lives in localStorage (`src/settings.ts`).
  Never write it to Firestore, logs, or the repo.
- **Programme structure is free-shaped** (`src/data/types.ts`): Claude decides sessions, section titles
  and progression blocks. Only `ExerciseRow` has fixed fields. Do not hard-code training phases.
- **Exercise library:** `src/data/exercises.json` is extracted from Falkenburg (`Pieter800320/train`,
  `var EX=`), the master list. Keys follow Falkenburg's `exKey()`. Never invent YouTube links. If there's
  no library video, fall back to a YouTube search URL (`videoUrl()`).
- **Styling:** tokens only (`src/styles/tokens.css`), no raw hex in components. Dark-first; light mode
  is a full equal. 48px minimum touch targets. One CTA per screen.
- **Sheets:** use `components/Sheet.tsx` (bottom sheet on phone, dialog ≥900px). Keep it the single
  sheet implementation; don't hand-roll another.
- **Exports** (M3) follow `Sophie_8Week_Program.html` in `Desktop\Pete's Gym` exactly: warm paper, Oswald
  headings, IBM Plex body, rust accent, no branding.

## 3. Delivery checklist

1. `npm run lint` — zero warnings.
2. `npm run build` — type-checks and builds.
3. Bump `version` in `package.json` for every release (shown in Settings).
4. Update §0 above when a milestone lands.
