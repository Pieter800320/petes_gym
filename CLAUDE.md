# CLAUDE.md — Pete's Gym (working guardrails for Claude Code)

Read `PIETER_STACK.md` first: it holds Pieter's cross-project collaboration rules (challenge him,
options labelled Recommended / Alternative / Avoid, `⚠️ CONFLICT:` format, never break working
features). This file holds only what is specific to this repo.

Blueprint (decisions, wireframes, Coach Playbook draft, roadmap):
https://claude.ai/artifact/TLW5JR7EVsawbaVmp57uh1

## 0. Current state

- **Version:** 0.9.26 (2026-10-03). All five milestones built (2026-09-30), since refined:
  - M1 Foundation: shell, Firebase sign-in + offline sync, clients, notes, settings, theme.
  - M2 Train: one screen — day list. The open exercise card (the same in Train and in Edit) has four bands: cue + alternative; a 2×2
    grid of pills Sets, Reps, Rest, Weight (−/+; "—" when empty; tap the value to type; Weight steps 0.5 kg
    (Pieter, 2026-10-01: bigger jumps are typed); private `ExerciseRow.load`); a private note for
    next time (`ExerciseRow.memo`, dot after the name; both never exported or sent to Claude); actions
    (Video, Swap to a library exercise or your own name, Remove in red on the right). Then the dial
    (Start → clock; ❚❚/▶ on the dial's edge pauses/resumes, paused time not counted; Finish → session recorded
    with mid-session changes; no per-set logging), stats.
  - M3 Export: HTML + Word in Swiss Print (see Design below), EN/DE (German via Claude, cached per programme);
    video link on its own line under each exercise, always red (a YouTube search link looks the same to
    the client). Always light, also on a dark-mode phone (bright gyms, printing): Pieter, 2026-10-01.
  - M4 Create: Claude co-author (`src/claude/chat.ts`, tools in `programmeTools.ts`), highlights,
    undo, health strip, attachments, editable Coach Playbook (Settings).
  - M5 Import: old programmes (Word/PDF/HTML/MD/photos) → archived programmes (`/import`), and
    questionnaire answers → client profiles. Hardened in 0.6.3: client matching in
    `src/data/clientMatch.ts` (ambiguous names must be chosen by hand), earlier answers never lost,
    large CSVs read in batches, truncation is an error, unsaved results kept on the device.
  - Client page box leads with the current programme; else the latest archived/imported one
    ("Last programme", Make current / Build next block); else the latest draft (Continue in Create).
    "No programmes yet" only when the client has none (Pieter, 2026-10-01).
  - Desktop: swipe-to-delete rows also get a bin button on hover/focus (`SwipeRow`).
  - Haptics (Android): light tick on every tap, strong pulse on Start/Finish and confirmed deletes;
    switch in Settings. iPhones can't vibrate from web apps.
  - Design (0.9.0, Pieter 2026-10-01): **Swiss Print** everywhere — app, programme views (Create sheet,
    Clients card, programme page) and both exports form one whole. Chosen after testers said the old
    Oswald/Plex/orange look seemed AI-made; Classic and Clinic were tried in 0.8.0 and removed.
    Mockups: https://claude.ai/artifact/BffcD8HQ28uQtTyPqTWhuq.
  - 0.9.3 (Pieter's list, 2026-10-03): the cue is editable in Train's open card, and swapping to a
    different exercise clears the old cue and alternative. Back arrows return to the previous screen
    (`TopBar` + `util/navHistory.ts`; label reads "Back" when that isn't the page above); the Create
    tab still reopens the last programme, and its arrow then shows the list of drafts. Deleting
    leaves no dead page in the history (`leaveFor`). Toasts are sized by their text. Swipe rows leave
    a 12px gap before Delete, and a confirmed touch delete swallows the browser's late click (it used
    to open the next draft). Exports: fixed columns that fit a phone, no "Day 1 —" after the red
    number, long words wrap, goal on its own row, Word keeps each day on one page and has no
    spelling squiggles, file names use ae/oe/ue/ss.
  - 0.9.4 → 0.9.9 (Pieter, 2026-10-03): on desktop (≥900px) the main action is not a round dial
    but a rectangular red button in the navigation rail, under the tabs ("Start session", "New
    programme", "Add client"; a running session shows clock + FINISH with a Pause button below).
    `Dial` portals into `#rail-action` there. Toasts sit under the page. The phone keeps the round dial.
  - 0.9.5 (Pieter, 2026-10-03): the phone's Back button closes the open sheet (top one only when
    stacked) instead of leaving the page. Each open sheet adds one marked step to the history
    (`Sheet.tsx`, `sheetMark` in `util/navHistory.ts`).
  - 0.9.6 (Pieter, 2026-10-03): the HTML export carries its own font (`export/exportFonts.ts`,
    four weights as data: URLs, ~150 KB per file; the extended set only when a name needs it) and
    fetches nothing. Preview shows the exported page in a sheet inside the app (sealed iframe), not
    in a new tab. An out-of-credits reply from Claude is worded plainly.
  - 0.9.7 (Pieter, 2026-10-03): screens appear complete instead of filling in piece by piece.
    `store.ts` remembers each live query's last result while the app is open (`lastResults`, also
    programmes and chats) and shows it at once; listeners still update it. Train keeps a greyed
    START in place while loading and waits for the session history before choosing the day.
  - 0.9.10 (Pieter, 2026-10-03): an open progression is a blue panel (rule, then the table) like
    the export's; tables with more than three columns become one block per row on a narrow screen
    (`BlockLine` in `DayList.tsx`, `.block-table.stacks`). Train also lists the programme-wide
    progression, closed, after the day's own. Desktop: the scrollbar's strip is always reserved
    (`scrollbar-gutter`), so the page no longer shifts when a sheet opens.
  - 0.9.11 (Pieter, 2026-10-03): a progression belongs on the day its exercise is trained. Claude
    is told so in Create (`chat.ts`, tool descriptions) and in import (`importProgramme.ts`); the
    progression edit sheet has "Shown on" (a day, or every day) to move one by hand.
  - 0.9.12 (Pieter, 2026-10-03): the open exercise card is the same in Edit as in Train (cue,
    four pills, note, actions); Edit adds Alternative, Superset, ↑ ↓ and Delete, the name is
    changed with Swap, and "+ Exercise" opens the picker. (It also added a "split a combined
    progression per column" action; removed again in 0.9.15, Pieter: too complicated, a one-off.)
  - 0.9.13 (Pieter, 2026-10-03), Edit programme step 1. Division of labour: Train adjusts today's
    session; Edit programme does all of that plus structure. The sheet is titled "Edit
    programme" with Done and a Saving…/Saved note; editable text is underlined; add lines are
    in order (+ Exercise, + Section, progressions, + Progression for this day); deleting
    lives in ⋯ menus per day (move up/down, duplicate, delete) and per section (move up/down,
    delete) and names what goes with it; section length and note are editable (the note now shows
    in Train and on the programme page too); day titles wrap and drop "Day 1 —". Reached from
    Train ("Edit programme ›") and from a link on the programme page.
  - 0.9.14, step 2: the card's ↑ ↓ carry an exercise over a section's edge; "Move to another
    day…" puts it in the other day's section of the same name, else its last section
    (`moveRowInSession`, `moveRowToSession`); after any delete in the sheet a bar offers Undo for
    10 s or until the next edit (`ProgrammeSheet` compares `programmeCounts` before and after).
  - 0.9.15 (Pieter, 2026-10-03): "as simple as possible; the layout says what each control
    does". Split removed. All action links are red: "+ …" lines in Edit, and both "Edit
    programme ›" and "Rework with Claude ›" in Train. The Edit card groups everything that moves
    the exercise in one labelled row (MOVE: ↑ Up, ↓ Down, To another day…), above Video · Swap …
    Delete.
  - 0.9.16 (Pieter, 2026-10-03), buttons unified: one red filled button per screen for what the
    screen is for; anything that leads to another place or tool is a red text link with "›"; no
    outlined rectangles on pages (`.btn-outline` and `.button-pair` are gone). You page: no
    buttons. A client's page: "Send to [name]" (archived: "Make current" + "Build next block ›").
    Programme page: one button, then "Edit programme ›" and "Rework with Claude ›" as in Train;
    "Edit programme" left the ⋯ menu. Train keeps "+ Exercise": adding one mid-workout is an
    in-the-moment change; structure lives in Edit programme.
  - 0.9.17 (Pieter, 2026-10-03, replaces the 0.9.16 button rule: "one big red button looks cheap,
    two red links is too much red"). Buttons: a pair of rectangles, the main action red and the
    second outlined (`.button-pair`); anything further is a quiet grey text link, so red appears
    once. You page: none. Client page: Send to [name] + Rework with Claude. Programme page:
    Open in Train / Send + Edit programme, then "Rework with Claude ›" quiet. Train: "Edit
    programme ›" red, "Rework with Claude ›" quiet. The in-app programme views (programme page,
    Edit programme, the card on a client's page) now follow the theme: dark in dark mode
    (`--paper-*` in tokens.css); exports and Preview stay white. The read-only exercise card on
    the programme page shows Cue / Alternative / Rest as labelled lines and a red "▶ Video".
  - 0.9.18 (Pieter, 2026-10-03): Settings opens from a gear in the top bar of the three tabs
    (beside the note pen; `openSettings()` in noteEvents.ts, the shell owns the one
    SettingsSheet); it is no longer on the You page. Settings → Download backup saves one JSON
    file with every collection (`readAllData` in store.ts); the API key is never in it. There is
    no restore in the app yet.
  - 0.9.19 (Pieter, 2026-10-03): Train can run a client's session. "Open in Train" in a client
    programme's ⋯ menu makes Train show that programme (banner "Training with [name] · Back to
    mine ›"); tweaks are saved to the client's programme and finished sessions are listed on the
    client's page. Which programme Train shows is per device (`getTrainProgrammeId` in
    settings.ts; null = Pete's own). "Load in Train" (copying a client's programme to Pete) is
    removed; reuse comes back with the programme library.
  - 0.9.20 (Pieter, 2026-10-03; removed again in 0.9.25): programme library (`/library`, from the Create page): every
    programme of every client, searchable (title, goal, client, exercise) and filterable by days
    per week and by labels. Labels come from Claude (`claude/tagProgrammes.ts`, Haiku, fixed
    vocabulary, cost kind `tags`) or are toggled by hand in the programme's sheet there;
    `Programme.tags` is written only by the library (`saveProgramme` leaves it out). "Use a copy
    for…" makes a draft for any client (`copyProgrammeTo`: no weights, private notes, client
    note or translations).
  - 0.9.21 (Pieter, 2026-10-03): profile pipeline. The Fitness Profile questionnaire is a page of the
    app (`/fit/:uid/:token`, `FitnessProfileScreen`, shown before the sign-in gate; questions in
    `data/fitnessProfile.ts`; redesigned in 0.9.22, see below). "Send fitness profile link"
    creates an invite (`data/invites.ts`, `users/{uid}/invites/{token}`) and shares its personal link;
    an open link for the same person is reused. Answers show on Clients as "New answers from X";
    `AnswersSheet` turns them into a new or updated profile through the same `mergeProfile` as the
    CSV import, with no Claude call, then deletes the invite. Unanswered links can be cancelled on
    Clients. The Google Form link is gone; the CSV import stays for older responses.
    **Needs the invite block in `firestore.rules` published in the Firebase console.**
  - 0.9.22 (Pieter, 2026-10-03): the questionnaire redesigned and bilingual. English/Deutsch switch
    (German on a German phone; the choice is remembered on the device). Choices are stored by option
    id, so the profile is always written in English; typed answers stay as written. Goal, days per
    week, session length, where they train and one open question on injuries, pain or medical
    conditions are required ("at home" also asks for the equipment there, `showIf`). A six-question
    yes/no health screen was built here and removed in 0.9.24 (Pieter: only the open question). Days
    and session length are single choices; "No preference" stands alone. German uses "du".
  - 0.9.23 (Pieter, 2026-10-03): DSGVO. The questionnaire ends with a framed explicit consent
    (Art. 9(2)(a), Art. 7) and a "Privacy notice ›" link to the full Art. 13 notice in a sheet, EN/DE,
    all in `data/privacy.ts`. The time, notice version and language of each consent travel with the
    answers (`_consent`) and end up as the last line of the profile's questionnaire text. Under 16
    cannot send. `CONTROLLER` in privacy.ts holds Pieter's name, address and email (public on the
    form). Not legal advice; Pieter should have the text checked.
  - 0.9.25 (Pieter, 2026-10-03): the programme library is removed completely (screen, Claude
    labels, `Programme.tags`, `copyProgrammeTo`); a programme can again only be duplicated for
    the same client. Train: which day is due stands on its own line above the day's title ("Up
    next" in red; "Up next: day N" in grey when another day is open) and its number in the day
    picker has a red foot; it left the grey sub line. Settings is four ruled groups of like rows
    (This device, Claude, Your data, Account): name left, control or chevron right.
  - 0.9.26 (Pieter, 2026-10-03): backups and notifications. `data/backups.ts`: a snapshot of the
    whole account is saved in Firestore (`users/{uid}/backups/{id}` + `parts`) every week when the app
    opens online; the last three are kept. Settings → Backups lists them, makes one by hand, and
    restores from one or from a downloaded file (`restoreData` replaces every backed-up collection;
    the state before a restore is itself saved for 21 days). Invites are not backed up. Answers
    waiting on Clients show as a count on the tab and a toast when they arrive. Email: Settings →
    "Email when answers arrive" stores the address of an Apps Script in Pieter's Google account
    (`meta/settings.notifyUrl`); each new invite carries it and the questionnaire calls it after
    sending (`pingNotify`, Google script addresses only, no data sent).
- **Verified:** Claude turn and archive conversion tested against the real API (Node). Signed-in UI
  checked in Chrome for M1–M2; Create/Export/Import UI still needs a hands-on pass on phone + PC.
  0.6.x: import matching/CSV batching/merge logic unit-checked (Node); the 0.6.3 import changes and
  pause/resume are not yet tested against the real API or in the signed-in app.
  0.6.9–0.7.3: swipe Delete and haptics tested with real touch input in headless Chrome (CDP
  `Input.dispatchTouchEvent`; one buzz per action); open-card touch targets measured ≥48px at 360 and
  390px. Swipe fix confirmed on Pieter's phone. Swap-with-own-name and the exercise note checked in
  isolation, not yet in the signed-in app.
  0.9.0: Train and programme views rendered dark + light in headless Chrome on fixtures built from the
  real classes; sample HTML export screenshotted (desktop light, phone dark); sample .docx opened in
  Word and checked as PDF. Not yet seen in the signed-in app. 0.9.1: export screenshotted with the
  phone in dark mode (stays light); client-box selection logic checked on all status combinations (Node).
  0.9.3: the real app was run in headless Chrome on an in-memory stand-in for Firestore and sign-in
  (a temporary Vite config that swaps `firebase/firestore`, `src/firebase.ts` and `AuthProvider`):
  navigation (35 checks), Train cue and swap, swipe/delete/toast with real touch events all pass.
  Sample exports checked on a 360px phone, desktop, printed PDF and in Word (PDF, 0 spelling flags).
  The production build opens with the server gone (service worker, fonts, both export modules cached).
  Firestore refuses reads and writes without sign-in (HTTP 403). Not yet seen on Pieter's phone.
  0.9.4–0.9.5: same method. Dial in the rail checked at 1280 and 920px wide (phone unchanged).
  Sheet + Back: 50 checks (stacked sheets, hand-over, close-then-navigate, delete from a sheet,
  scroll kept), in the dev and the production build, phone and desktop. Not yet on a real phone.
  0.9.6: five sample exports opened with the network off at 360 and 900px: every part renders in
  Schibsted Grotesk, nothing is fetched. In-app preview checked on phone and desktop sizes.
  0.9.18–0.9.20: gear and backup (22 checks), training with a client (20), library search,
  filters, hand labels and copy (24), all on the in-memory backend. Claude's labelling call is
  NOT tested against the real API (no credits); it follows translate.ts's pattern.
  0.9.21: send link → fill in → new answers → profile, for an existing and a new client, link
  reuse, dead link, cancel (34 checks) on the in-memory backend. 0.9.22: the new form in German
  and English, dependent questions, required answers, English profile from German answers (36).
  0.9.23: consent box, notice in both languages, age limit, proof of consent in the profile (9). The database rules for invites are
  NOT tested (no emulator on this PC) and nothing was run against the real Firestore.
  0.9.11: moving a progression between days and to/from "every day" checked in the app (15
  checks). The new wording in Claude's instructions is NOT tested against the real API (no credits).
  0.9.7: with 40–160 ms added to every listener's first answer, switching tabs went from 4–6
  repaints per tab to one; START no longer disappears on Train. All earlier checks pass again.

## 1. Stack (fixed)

| Layer | Choice | Why |
|---|---|---|
| App | React 19 + TypeScript + Vite, installable PWA (`vite-plugin-pwa`) | One codebase for phone and PC |
| Data | Firebase Firestore with `persistentLocalCache` | Offline-first; syncs phone ↔ PC |
| Auth | Firebase Auth, Google sign-in | |
| Hosting | GitHub Pages via `.github/workflows/deploy.yml`, base `/petes_gym/` | Free, deploys on push to `main` |
| Routing | `HashRouter` | GitHub Pages has no rewrites |
| Fonts | Schibsted Grotesk via `@fontsource` (latin, 400–800), also embedded in each HTML export; Arial in Word exports | One family for app and HTML export; bundled for offline; the export fetches nothing; Arial is on every client PC |

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
- **Fitness Profile invites** are the only data reachable without signing in. Keep it that way: the
  rules let a link holder `get` one unanswered invite and set its `answers`/`answeredAt` once, nothing
  more. `submitAnswers` is the one awaited write (the client must know it arrived). A change to the
  rules is live only after Pieter publishes `firestore.rules` in the console.
- **Privacy texts must stay true** (`data/privacy.ts`). Whenever client data starts going somewhere
  new (another provider, another Claude feature, analytics), or the storage period changes, update
  the notice and the consent and set `PRIVACY_VERSION` to the new date.
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
  is a full equal. 48px minimum touch targets. One CTA per screen; a second action is an outlined rectangle beside it, further ones quiet text links (`Dial`: round on the phone, a
  rail button on desktop; give it both `label` and `longLabel`). Swiss Print: black ink, one red pen
  (accent), blue ink for Pete's edits and progression tables, square corners (the dial stays round),
  sentence-case bold headings, small uppercase labels. Letter case, tracking, heading weight and
  control corners are tokens (`--display-case`, `--label-case`, `--radius-control`…); don't
  hard-code them in app.css. Tabular figures only on the session clock: Schibsted widens punctuation.
- **Haptics:** one global click listener (`src/haptics.ts`) covers every button, link and tab. Don't call
  `navigator.vibrate` directly; mark an element `data-haptic="strong"` (session-level actions) or
  `data-haptic="none"` when it calls `haptic()` itself (see `ConfirmButton`).
- **Navigation:** back arrows go through `TopBar`'s `back` (it steps back in the history; `to` is
  only the fallback). After deleting the thing a page shows, leave with `leaveFor()` rather than
  `navigate()`, so the phone's Back button can't return to it.
- **Sheets:** use `components/Sheet.tsx` (bottom sheet on phone, dialog ≥900px). Keep it the single
  sheet implementation; don't hand-roll another. An open sheet owns a history step (Back closes
  it), so `navigate(-1)` from inside a sheet only closes the sheet: to leave the page from a
  sheet use `leaveFor()` or a normal `navigate(path)`.
- **Exports** (M3) and in-app programme views (`.paper-*`, `.doc`) share the Swiss Print layout: thick
  rule under the masthead and above each later day, red day numbers, ruled section headers, blue
  progression blocks, no branding. Change one, change all three (`renderHtml.ts`, `renderDocx.ts`,
  the paper rules in app.css). Colour differs by purpose (Pieter, 2026-10-03): exports and the
  export Preview are always white; the in-app views follow the theme.

## 3. Delivery checklist

1. `npm run lint` — zero warnings.
2. `npm run build` — type-checks and builds.
3. Bump `version` in `package.json` for every release (shown in Settings).
4. Update §0 above when a milestone lands.
