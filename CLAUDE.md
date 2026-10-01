# CLAUDE.md — Pete's Gym (working guardrails for Claude Code)

Read `PIETER_STACK.md` first: it holds Pieter's cross-project collaboration rules (challenge him,
options labelled Recommended / Alternative / Avoid, `⚠️ CONFLICT:` format, never break working
features). This file holds only what is specific to this repo.

Blueprint (decisions, wireframes, Coach Playbook draft, roadmap):
https://claude.ai/artifact/TLW5JR7EVsawbaVmp57uh1

## 0. Current state

- **Version:** 0.7.2 (2026-10-01). All five milestones built (2026-09-30), since refined:
  - M1 Foundation: shell, Firebase sign-in + offline sync, clients, notes, settings, theme.
  - M2 Train: one screen — day list (tap an exercise: sets/reps −/+, swap to a library exercise or
    your own typed name, a private Weight field
    (`ExerciseRow.load`) and note for next time (`ExerciseRow.memo`; both open card only, never
    exported or sent to Claude; a dot marks a note on the closed line)), dial
    (Start → clock; ❚❚/▶ on the dial's edge pauses/resumes, paused time not counted; Finish → session recorded
    with mid-session changes; no per-set logging), stats.
  - M3 Export: HTML + Word in the Sophie house style, EN/DE (German via Claude, cached per programme);
    video link on its own line under each exercise.
  - M4 Create: Claude co-author (`src/claude/chat.ts`, tools in `programmeTools.ts`), highlights,
    undo, health strip, attachments, editable Coach Playbook (Settings).
  - M5 Import: old programmes (Word/PDF/HTML/MD/photos) → archived programmes (`/import`), and
    questionnaire answers → client profiles. Hardened in 0.6.3: client matching in
    `src/data/clientMatch.ts` (ambiguous names must be chosen by hand), earlier answers never lost,
    large CSVs read in batches, truncation is an error, unsaved results kept on the device.
  - Desktop: swipe-to-delete rows also get a bin button on hover/focus (`SwipeRow`).
- **Verified:** Claude turn and archive conversion tested against the real API (Node). Signed-in UI
  checked in Chrome for M1–M2; Create/Export/Import UI still needs a hands-on pass on phone + PC.
  0.6.x: import matching/CSV batching/merge logic unit-checked (Node); the 0.6.3 import changes and
  pause/resume are not yet tested against the real API or in the signed-in app.

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

- **No nested arrays in Firestore.** Progression-table rows are encoded as `[{cells}]` in
  `store.ts` (encode/decodeProgramme). Chat history is stored as a JSON string for the same reason.
- **Claude history is append-only** (`chat.ts`): never edit or drop earlier turns. Thinking
  blocks are bound to the conversation, and the prompt cache depends on an unchanged prefix.
- **Claude models** (Pieter's cost decision, 2026-09-30): `MODEL_DESIGN = claude-sonnet-5-5` (Create chat,
  archive import), `MODEL_LIGHT = claude-haiku-4-5` (translation, questionnaire import, reading files;
  send no `effort`). Forced `tool_choice` is rejected; steer via the prompt. Every response goes
  through `trackCost()` (prices in `client.ts`; update them when models change).
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
