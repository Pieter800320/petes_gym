# CLAUDE.md — Pete's Gym (working guardrails for Claude Code)

Read `PIETER_STACK.md` first: it holds Pieter's cross-project collaboration rules (challenge him,
options labelled Recommended / Alternative / Avoid, `⚠️ CONFLICT:` format, never break working
features). This file holds only what is specific to this repo.

Blueprint (decisions, wireframes, Coach Playbook draft, roadmap):
https://claude.ai/artifact/TLW5JR7EVsawbaVmp57uh1

## 0. Current state

- **Version:** 0.9.61 (2026-10-06). All five milestones built (2026-09-30), since refined:
  - M1 Foundation: shell, Firebase sign-in + offline sync, clients, notes, settings, theme.
  - M2 Train: one screen — day list. The open exercise card (the same in Train and in Edit) has four bands: cue + alternative; a 2×2
    grid of pills Sets, Reps, Rest, Weight (−/+; "—" when empty; tap the value to type; Weight steps 0.5 kg
    (Pieter, 2026-10-01: bigger jumps are typed); private `ExerciseRow.load`); a private note for
    next time (`ExerciseRow.memo`, dot after the name; both never exported or sent to Claude); actions
    (Video, Swap to a library exercise or your own name, Remove from programme in red on the right). One rule for Swap and for Claude's rewrites
    (0.9.50): the same exercise (same `exerciseKey`) keeps weight and note; a different one clears both (Swap also clears cue and alternative). Then the dial
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
  - 0.9.27 (Pieter, 2026-10-04): a Create chat can't outgrow its Firestore document. Over 700 KB (`CHAT_DOC_WARN_BYTES`) Create sends nothing and offers "Start fresh chat": the chat moves to `users/{uid}/chatArchives` (backed up, purged with its programme; nothing in the app reads it yet) and an empty one starts, so the next message resends the full `<context>`; `archivedCostUsd` keeps the cost total. A reply that would pass 1 MB drops the undo point, else resets the chat (`recordTurn` → `reset`; that reply's text is not kept). Logic checked in Node on stubs (14 checks); the banner is not yet seen in the app.
  - 0.9.28 (Pieter, 2026-10-04): ids are unique within a programme whatever Claude sends. `write_session` keeps only ids of the session it replaces (a new session keeps none), `set_block_progression` only the table's own; a row Claude moves to another day gets a new id but keeps Pete's weight and note; a result with duplicate ids is refused. Programmes already saved with duplicates are repaired when read (`withUniqueIds` in `decodeProgramme`: later copies become `id_2`, `id_3`…; written by the next save). Checked in Node (18 checks), not in the app or against the real API.
  - 0.9.29 (Pieter, 2026-10-04): Undo in Create never silently discards Pete's own edits. When he changed the programme by hand after Claude's reply (`editedSince`: `describeEdits(baseline, programme)`), the undo line says "Undo also removes your edits since Claude's reply" and Undo needs a second tap (`ConfirmButton`); otherwise one tap as before. `undo()` flushes pending edits first, so the autosave timer can't write them back. Weights, private notes, row order, markers and start date are not in `describeEdits` (its text goes to Claude), so `untoldEdits` in `CreateScreen.tsx` compares those. Not yet seen in the app.
  - 0.9.30 (Pieter, 2026-10-04): a session is only finished on purpose. FINISH needs a second tap within 3 s (`Dial`'s `confirmLabel`: the label reads "TAP AGAIN" and the button gets a second ring, `.dial.armed`) and does nothing in the first 1.5 s after Start (`ignoreUntil`), so a double tap on START can't end the session. "Session saved" stays 10 s with Undo: the saved workout is deleted and the session runs on from its original start (`restoreActiveWorkout`; refused when another session was started meanwhile). `toast(message, action?)` takes one optional action. Not yet seen in the app.
  - 0.9.31 (Pieter, 2026-10-04): a backup or restore is only reported done when the server has it (`data/backups.ts` awaits its writes, 60 s timeout, online only). A snapshot's description is written last with `complete: true` and older snapshots are deleted only after that; a failed one is taken back. Restore checks the data's shape before anything is written (`checkBackupData`, also when a file is chosen), writes everything before deleting anything, in awaited batches of at most 400 documents or 4 M characters, and names the part it stopped at. Restore buttons are off while one runs (`ConfirmButton` `disabled`). Checked in Node on a stand-in for Firestore (17 checks), not against the real one.
  - 0.9.32 (Pieter, 2026-10-04): a page opened on a questionnaire link (`isPublicForm` in `firebase.ts`) keeps Firestore's cache and the sign-in state in memory only, so no `firestore/*` or `firebaseLocalStorageDb` database is left in the client's browser; the signed-in app keeps its persistent cache. Still left on the client's device: the app's own files (service worker cache) and possibly Firebase's `firebase-heartbeat-database` (no personal data). Not checked in a browser.
  - 0.9.33 (Pieter, 2026-10-04): only Pieter's account can use the app's data. `firestore.rules`: the owner block also requires `uid == 'PETE_UID'`; the invite block is unchanged. Pieter's UID is in the file and the rules were published on 2026-10-04 (a wrong UID there locks Pieter out as well). In the app, any other Google account sees "No access" before the shell renders (`OWNER_EMAIL` in `firebaseConfig.ts`, `NoAccessScreen`); that is UX only, the rules enforce it. Not tested: no second account, no emulator.
  - 0.9.34 (Pieter, 2026-10-04): the questionnaire tells "no connection" from "link no longer usable". `readInvite` returns ok / gone / offline (gone only when the server refuses); offline shows "No connection" with Try again. `submitAnswers` sends once and waits for that one write however long it takes; after 20 s the page says "Still sending… please keep this page open" and Send stays off. A refusal counts as delivered when the invite can no longer be read (answered, or cancelled by Pieter: then the client sees "Thank you" although nothing arrived). New texts in EN and DE. Checked in Node on stubs (17 checks), not in a browser.
  - 0.9.35 (Pieter, 2026-10-04): a fitness profile link is only shared once its invite is on the server. `Invite.pending` (from `hasPendingWrites`) marks one the server doesn't have yet; `prepareLink` creates the invite, or waits for a queued one, for at most 10 s and fails with "No connection: …" offline. `useProfileLink` drives both lines (client menu, new-client sheet): an invite already on the server is shared in the same tap; otherwise the line reads "Preparing link…", then "Share link ›", and the next tap shares (the share sheet needs a fresh tap). `linkFor` is gone. Checked in Node on stubs (10 checks), not in a browser.
  - 0.9.36 (Pieter, 2026-10-04): "Delete forever" removes a client or programme from the in-app backups too. `scrubDeleted` (`data/backups.ts`, called from `DeletedScreen`) notes the ids in `meta/settings.pendingScrub`, then `scrubSnapshots` rewrites every snapshot that holds any of it without it (same date and kind) and deletes the old one; without a connection it runs at the next online start (`runPendingScrubs` in `App.tsx`, before the weekly backup). Purging a client also deletes its fitness profile links. Clients shows "N clients inactive for 2+ years: review ›" (a filter, nothing is deleted automatically; `KEEP_YEARS`). Privacy notice changed to match (EN + DE), `PRIVACY_VERSION` 2026-10-05; **Pieter should have the new wording checked**. Downloaded backup files are outside the app's reach. Checked in Node on a stand-in for Firestore (19 checks), not against the real one.
  - 0.9.37 (Pieter, 2026-10-04): the export's Share button opens the share sheet reliably. Building and sharing are two steps (`ExportSheet.tsx`: `ready` file + `key` of the form it was built from): English is built when the sheet opens and 400 ms after each change; German never by itself (cost): the button reads "Translate & prepare", then "Share". Share is on only while the file matches the form and calls `shareOrDownload` with nothing awaited before it. A refused share (`NotAllowedError`) saves the file and says so. The German translation cache is saved without strings the programme no longer has. Not yet seen in the app or on a phone.
  - 0.9.38 (Pieter, 2026-10-04): a session running on another programme is named in Train ("A session with [client] is running ([programme], since HH:MM)") with "Go to that session ›" (Train switches to that programme) and "Discard that session". If its programme was deleted: "Save what was done" (`finishWorkout` without a session records the exercises it started with, no changes) or "Discard". Not yet seen in the app.
  - 0.9.39 (Pieter, 2026-10-04): a programme in Recently deleted can't be worked on. Create shows "This programme is in Recently deleted." with Restore instead of the chat (deleted with its client: "Restore the client from Recently deleted", no button) and forgets it as the tab's last programme; deleting from the programme page forgets it too. The programme page of a deleted programme shows only the banner and the read-only document: no buttons, no "Rework with Claude", no ⋯ menu. Not yet seen in the app.
  - 0.9.40 (Pieter, 2026-10-04): stopping or losing a reply in Create is explained. Stopped before anything was saved: the message and its attachments are back in the box ("Stopped. Nothing was saved; …"). Stopped in a later round: "You stopped Claude. The changes so far are kept." A reply that uses all 12 tool rounds ends with "Claude reached its limit of 12 steps for one reply. Send "continue" to let it finish." A failed or stopped request is charged from the stream's partial message (`stream.currentMessage`: input tokens, not the output cut off). History storage unchanged. Checked in Node on a stub client (7 checks), not against the real API.
  - 0.9.41 (Pieter, 2026-10-04): Send in Create waits for attachments. While a file is being read (PDFs and photos go through Claude), Send and Ctrl+Enter are off, a dashed chip "Reading [file]…" stands in the chips row and the box reads "Reading the file…" (`reading` in `CreateScreen.tsx`); before, a message sent meanwhile went without the file, which then landed in the next one. Not yet seen in the app.
  - 0.9.42 (Pieter, 2026-10-04): photos are made smaller before Claude reads them (`prepareImage` in `claude/extract.ts`): longest edge 1568 px (all the light model looks at), JPEG at 0.85, then 0.7 and 0.55 if it is still over the API's limit. Limits from Anthropic's vision docs on 2026-10-04: 10 MB per image measured on the base64 text (the audit assumed 5 MB), 8000 px per side. The 20 MB cap now applies to PDFs only. HEIC/HEIF count as photos and are tried; where the browser can't decode one: "this photo format can't be read here. Save it as JPEG and try again." Type-checked only: not run in a browser or against the real API.
  - 0.9.43 (Pieter, 2026-10-04): the health strip stops crying wolf. Injury keywords match whole words and only in the client's injuries field (`contraindicationsFor` in `data/health.ts`): "discomfort", "plays tennis" and "work-life balance" no longer flag back, elbow and balance; an injuries field that only says none / keine gives nothing. `targetRange` reads hours and German ("1 hour", "1,5 Std", "1–1.5 h", "1:00") and "up to 30 min" / "bis 30 Minuten" as 20–30 (`UP_TO_TOLERANCE_MIN`); before, "1 hour" was read as −4 to 6 minutes and flagged every session. Intervals count work plus rest per round ("4 × 20s/40s" is 4 min, was 80 s) and "20s/40s × 6" is six sets (`programmeUtils.ts`). Checked in Node (47 checks).
  - 0.9.44 (Pieter, 2026-10-04): the app loads in parts. Create, the programme page, both importers, Notes, Recently deleted and the questionnaire are fetched when first opened (`lazy` in `App.tsx`; the rest 1.5 s after the shell appears, so opening them shows no "Loading…"); the export sheet and the answers sheet load with their page. Prices and the cost ledger moved to `claude/cost.ts` (no SDK; `client.ts` re-exports them). First load: 1,569 kB before, 1,168 kB now (main script 324 kB, Firebase 639 kB); a client's questionnaire adds 17 kB and no longer loads the Anthropic SDK, zod or the exercise picker's code paths behind it. All 34 scripts are in the service worker's precache. The unused `<datalist>` of exercise names is gone. Also: cost amounts were shown without their "$" (`formatUsd`); fixed. Checked: production build served locally, the questionnaire page and the sign-in page render in headless Chrome; not seen signed in, and offline not re-tested.
  - 0.9.45 (Pieter, 2026-10-04): less redrawing, no visible change. Create: a streaming reply is put on screen at most once per frame (`streamed` buffer + `requestAnimationFrame`) and `Bubble` is memoised on `role` and `text`, so earlier messages aren't parsed again for every piece of text. Edit programme: `DayList` is `memo`, and `DayEditor` in `ProgrammeSheet.tsx` gives each day handlers that stay the same between renders (`changeDay` reads the latest programme from a ref) and its own slice of the highlight sets (`useDayMarks`), so typing in one day redraws that day only. Library search uses a text built once per exercise (`SEARCH_TEXT`). Clients: one pass over the programmes (`byClient`) instead of one per client. Shell: the waiting-answers list is memoised, so its effect no longer runs on every render. Checked in Node (19 checks: DayList renders in all three modes with marks, search gives the same results as before); the redraw counts themselves were not measured in the browser.
  - 0.9.46 (Pieter, 2026-10-04): Create edits through `useProgrammeDraft` like Train and the programme page; its own copy of the autosave logic is gone (`local`, `manualChange`, `flushEdits`, the unmount effect, `AUTOSAVE_MS`). Effect: once an edit is saved the sheet shows the stored programme again, so a change from another device (or from Train) appears without closing the sheet, and the next edit starts from it. The hook's `preview()` now marks a preview (`previewing`), so a save landing while Claude works can't flip the screen back to the stored programme; `flush()` and `preview(null)` end it. Closing the sheet while Claude works no longer drops the live preview. Type-checked and linted; not yet seen in the app.
  - 0.9.47 (Pieter, 2026-10-04): sturdier writes in `data/store.ts`. Deleting, restoring and purging a client go through `commitInChunks` (450 writes per batch; Firestore refuses more than 500, so "Delete forever" failed whole for a long-term client). `saveProgramme` is an update, not a merge: a late autosave of a programme that was deleted forever meanwhile no longer brings back a half-empty document, and that refusal (`not-found`) is not shown as an error. Make current is one batch (`setCurrentProgramme`: archive the others + activate this one); a current programme lying in Recently deleted is archived just after (`archiveDeletedCurrent`, only deleted ones, so a slow answer can't archive a newer choice). `restoreProgramme` takes the programme, not its id: one that was current comes back as archived when the client has another current one; restoring a client keeps only the most recently changed of its programmes current. Checked in Node on a stand-in for Firestore (29 checks, 705 writes in batches of 450 + 255), not against the real one.
  - 0.9.48 (Pieter, 2026-10-04): live edits are signposted (wording only). Create shows a quiet line above the Programme bar when the programme is not a draft: "This is [name]'s / your current programme: changes apply to it straight away. Undo is offered after each reply.", or "This is an archived programme: changes apply to it directly." (`.banner.live-note`). In Train the card's red action reads "Remove from programme", armed "Sure? It's removed for good" (it always deleted the exercise from the programme, not only for today). Not yet seen in the app: check that the longer label fits the action row on a 360px phone.
  - 0.9.49 (Pieter, 2026-10-04): "Build next block" no longer bumps a year: `nextTitle` (`data/programmeActions.ts`) adds one only to a trailing number of up to three digits ("Block 2" → "Block 3", "Phase 10 (copy)" → "Phase 11 (copy)"); "Strength Oct 2026" becomes "Strength Oct 2026 · next block" (was "Oct 2027"). The other half of this audit item, the German translation cache growing without limit, was already done in 0.9.37 (pairs the programme no longer has are dropped on save); copies keep the cache on purpose. Checked in Node (6 checks).
  - 0.9.50 (Pieter, 2026-10-04): one rule for the private weight and note when a row's exercise changes: the same exercise (same `exerciseKey`, so a respelling counts) keeps both; a different one clears both. Swap in the card (`DayList.tsx`) used to clear the weight always and keep the note always, so "hinge deeper" stayed on a completely different exercise; Claude's `write_session` kept the note always and compared names as raw text. Swap still clears cue and alternative for a different exercise. Checked in Node through the real tool (7 checks); the Swap path is not yet seen in the app.
  - 0.9.51 (Pieter, 2026-10-04): for iPhone and iPad, and for older browsers. An iOS-only block at the end of `app.css` (`@supports (-webkit-touch-callout: none)`) sets the text fields that were under 16px to 16px, because Safari zooms into smaller ones and stays zoomed; the fields are listed by class (a blanket rule would have shrunk the 20 and 26px titles), so a new small field must be added there. On iOS the section name and section note in Edit therefore show at 16px instead of 11 and 13px; the audit's `transform: scale()` alternative was left out because it can't be checked here. `field-sizing: content` is in every current browser since June 2026 (MDN, read 2026-10-04); for older ones `AutoTextarea` (`util/useAutosize.ts`) sets the height from the text, on the eight boxes that rely on it (day title and focus, section note, cue, private note, programme title and goal, the Create composer). No effect where the browser supports it. NOT tested: no iOS device or Safari on this PC.
  - 0.9.52 (Pieter, 2026-10-04): Settings → Account has a second, quiet action for a computer that isn't Pete's: "Sign out and remove everything from this device" (two taps). `wipeDevice` in `firebase.ts` (on the auth context as `signOutAndWipe`) shuts the database down, clears its offline copy, removes every `pg_` and `petesgym.` key from localStorage (import drafts, a running session, settings, the Anthropic key), empties sessionStorage, signs out and reloads. It first gives unsent changes 3 s to reach the server; if they don't: "Some changes haven't synced yet…" with "Wipe anyway" for 8 s (the audit said 3 s; too short to read and decide). If another tab holds the database copy it can't be cleared: the sign-in screen then says so once (`WIPE_NOTE_KEY`). Plain "Sign out" is unchanged and still leaves the data on the device. Nothing is deleted from the account. Checked in Node on stand-ins (16 checks); NOT run in a browser, so the real clearing of IndexedDB is unconfirmed.
  - 0.9.53 (Pieter, 2026-10-04): the email notice covers links already sent. Saving or changing the script address in Settings (`saveNotifyUrl` in `data/invites.ts`, now given the invites) also writes it into every invite that is not answered yet, and clearing it removes it from them; before, only links created afterwards carried it, and a changed address left old links calling the old one. Answered invites are left alone. The sheet's text says so, and adds one line: someone holding a link could make it send Pete that email, nothing more. `firestore.rules` unchanged (Pete's own writes fall under the owner rule). Checked in Node on a stand-in for Firestore (9 checks), not against the real one.
  - 0.9.54 (Pieter, 2026-10-04): two small leaks closed. Coach Playbook: unsaved text is kept on the device (`pg_playbook_draft_v1`, written 500 ms after typing stops and when the sheet closes); reopening starts from it with "Unsaved changes restored · Discard". Save and Discard clear it; "Reset to the default text" leaves the default as the unsaved text until it is saved. Import programmes: one queue (`queue` + `working` refs in `ImportScreen.tsx`); files added while others convert, and "Try again", join it instead of starting a second loop, which doubled the calls to Claude and showed "Save all" while it still ran. The third part of this audit item, `ConfirmButton`'s `disabled`, came with 0.9.31. Type-checked and linted; not yet seen in the app.
  - 0.9.55 (Pieter, 2026-10-04): tooling. `strict` is on in both tsconfigs (the code already passed it). `npm test` runs vitest (new devDependency) over `src/**/*.test.ts`: 111 tests in 8 files for the helpers where this audit's bugs lived (`programmeUtils` steppers, sets and interval time; `health` injury words and session length; `clientMatch`; `programmeTools` id rules and the weight/note rule; `programmeIds` repair; `importProfiles` CSV splitting and profile merge; `fitnessProfile` required answers and answers → profile; `backups.parseBackupFile`; `nextTitle`). They run in Node; modules that reach Firebase are mocked. The deploy workflow now runs lint, then test, then build: a push that fails one is not deployed. §3 lists the new step. No UI test framework (audit: avoid for now). `vite.config.ts` takes `defineConfig` from `vitest/config` for the `test` block.
  - 0.9.56 (Pieter, 2026-10-06): Claude no longer works inside the app; programmes are built in Claude Code on the PC (§4) and land in the app as drafts. One switch, `CLAUDE_IN_APP` in `src/claude/inApp.ts` (false): nothing was removed, true brings it all back. With it off: Create is the list of drafts plus the library; a draft opens on its own page (`draftPath`; `/create/:id` forwards to `/programmes/:id`), where a client's draft has "Make current" as its red button (Send follows once it is current) and a line saying it is a draft; NEW and "+ New programme" start a blank programme with the Edit sheet open (`state.edit`). Hidden: the chat, every "Rework with Claude" (the client page shows "Edit programme" in its place), "Build with Claude", the API key and costs in Settings, and both importers (their routes still exist). The Coach Playbook stays in Settings: Claude Code reads it. Export in German takes its text only from the programme's cache and never calls Claude; a missing text gives "German is missing for N texts… Ask Claude Code on the PC"; the personal note is exempt and goes out as typed. Privacy notice (EN + DE): the sentence on AI training now says Pieter switched it off in his Claude account (it used to rest on the API's terms), `PRIVACY_VERSION` 2026-10-06; **Pieter should have the wording checked, and whether a personal Claude subscription needs a data-processing agreement.** Checked in Node: the programme page, Create and a client's page rendered to text with the store mocked (5 checks: buttons and links per status, nothing of Claude left). NOT seen in the app or on a phone; taps, the Edit sheet opening on a new programme and the German export are untested.
  - 0.9.57 (Pieter, 2026-10-06): the export has a third language, Afrikaans (his father is the first client for it). `ExportLang` `'af'` with its own labels in `exportModel.ts` (Oefenprogram vir N weke, Doel, Hoe gereeld, Sessielengte, Oefening / Stelle × Herh. / Rus, Of), file suffix `_AF`, Word language af-ZA. Its text lives in `Programme.translationsAf` (`{src, af}` pairs; `saveProgramme` leaves it out, like the German cache) and is only ever written from Claude Code (`tools/translate.ts af …`); the app never translates Afrikaans, also with `CLAUDE_IN_APP` on. A missing text gives "Afrikaans is missing for N texts…"; the personal note goes out as typed. Checked in Node: one sample programme built and rendered to HTML in Afrikaans (labels, translated text, exercise names kept). NOT seen in the app; the Word export in Afrikaans is not opened.
  - 0.9.58 (Pieter, 2026-10-06), polish pass 1 and 2: measure, then nothing jumps. Measured first with `tools/ui` (§5): at start the app showed four pictures in a row (blank, "Loading…", Train's frame in a system font, the fonts swapping in weight by weight, then the data); with the light theme chosen on a dark phone it started dark and turned light; Clients moved its list down 64 px on every visit when the "fitness profile links sent" line arrived; a client's page and the programme page filled in in two steps. Now: (1) `data/live.ts` listens to the five everyday collections (clients, programmes, notes, workouts, invites) once for as long as the app is open; every hook in `store.ts` and `useInvites` reads from it and filters on the device, so a screen has its data when it opens (`lastResults`, the per-screen listeners and the second invites listener are gone; unchanged documents keep their object, programmes are decoded once). (2) The start frame: `index.html` carries the app's empty outline (`.shell.splash`, the same as `<Splash />`) and a script that sets the theme and the status-bar colour before anything is drawn; `App.tsx` keeps that frame until sign-in, all five collections, the fonts and the first screen's code are there (`useStartReady`, at most 4 s), then the first screen appears once, complete. A device never signed in shows no navigation in the frame (`pg_signed_in`). (3) Fonts: own `@font-face` rules with `font-display: block` (`styles/fonts.css`), preloaded from `index.html`; text is never drawn in a system font first. (4) Screens fetched on demand use `later()` in `App.tsx` instead of `lazy()`: once loaded they render at once; all are fetched 0.4 s after the first screen; the Suspense fallback is empty, not "Loading…". (5) Desktop: the rail's action button is there in the first frame (`useLayoutEffect` in `useRailSlot`). `useProgramme` treats a programme as "not there" only after 0.5 s, so one created a moment ago doesn't flash "isn't here any more". Recorded after: every start is two pictures (frame, then the complete screen) and every tab switch or page change one, with 0 layout shifts, on phone and desktop, dark and light, signed out, and first-ever start. `tools/livecheck.ts` ran the same listener calls against the real database under its rules (5 collections answer, counts only). One jump is left: a new draft's row shows in Create's list behind the closing sheet just before its page opens. NOT seen on a phone; the first start after this update reads notes and sessions whole once, so offline it may show less until it has been online.
  - 0.9.59 (Pieter, 2026-10-06), polish pass 3: movement with meaning. Pages change inside the browser's view transitions (Pieter chose them over hand-written transitions and an animation library). One place does it: the shell renders `<Routes location={shown}>` with `useShownLocation` (`util/pageTransition.ts`), which follows the router's location inside `document.startViewTransition`, so every link, `navigate()` and the Back button are covered. Kinds, set as `<html data-nav>`: `forward` (opened from another page: in from the right), `back` (in from the left), `tab` (between the tabs, and a replaced page: a fade). The old page leaves in 100 ms, the new one starts 60 ms in and takes 220 ms, travelling 28 px (`--motion-leave/-wait/-arrive/-shift`, `--ease-arrive` in tokens.css; the rules are "Page changes" in app.css). Pictured apart: the page (`.shell-main`), the navigation (stays put, no fade) and the dial (changes its word in place). The first screen fades in after the start frame the same way. No transition: where the browser has none (the page then changes at once, as before), under "reduce motion", when the browser animated the step itself (`hasUAVisualTransition`, the swipe back on an iPhone), and for a sheet's own history step. The old page is kept until the new page's code is loaded (`prepare`), and `TopBar` works out its back arrow once per page, so the leaving page doesn't change while it leaves. Scroll memory follows the shown page. Recorded: states and layout shifts as in 0.9.58 (one state per step, 0 shifts); frames in the middle of a change looked at for forward, back and a page opened from a closing sheet. NOT seen on a phone or an iPhone; how it feels at real speed is Pieter's to judge.
  - 0.9.60 (Pieter, 2026-10-06, after seeing 0.9.59 on his phone: "the speed is fine, but there are flickers"). (1) Tapping a client in a scrolled list showed the top of Clients for a moment: reproduced (`scrolled` in tools/ui). `useScrollMemory` ran again when the navigation type changed, which is at the tap, and scrolled the page still on screen to its top; it now runs only when the shown page changes. Also the page's frame no longer glides between the old and new page's place (`::view-transition-group(page)` has no animation) and the old page's picture is hung where it was (`--leaving-shift`). (2) At start the phone's own icon picture gave way to an empty frame before the app faded in. The start frame is now that picture: the icon in the middle (`.splash`, `--splash-icon` 128 px), on the manifest's dark background when installed (`display-mode: standalone`) and the theme's colour in a browser tab; it fades out while the app fades in (`useReveal`, `data-nav="start"`). The navigation outline and the `pg_signed_in` hint of 0.9.58 are gone. NOT reproduced: the phone's own picture can't be shown here, so whether the icon's size and place match it is Pieter's to say. (3) An exercise's card and a progression's table open by growing to their height in 0.3 s and close in 0.22 s (`Drop` in DayList.tsx, `.drop` in app.css, `--motion-open/-close`); before, they appeared and vanished at once. The card stays mounted until it has closed. Recorded: frames in the middle of each looked at.
  - 0.9.61 (Pieter, 2026-10-06, after 0.9.60 on his phone). (1) Back from a client with a long page showed another picture for a moment: reproduced (`tall-back` in tools/ui). The browser restored the list's scroll position at the Back step, on the page still on screen, which jumped to its bottom. `history.scrollRestoration = 'manual'` (main.tsx): scroll is restored only by `useScrollMemory`, when the page stepped back to is shown. (2) The exercise card "janks": growing the height step by step laid the whole page out again for every picture. Rewritten as `components/Drop.tsx`: the page takes its new layout once, and only drawing moves (the panel is uncovered with `clip-path`, everything below slides with `translate`/`transform`, Web Animations), starting one picture after the card is on the page. One card closing while another opens add up. `.ex.open`'s panel styles now hang on `.ex:has(> .drop)` and its 6 px vertical margins are gone. Recorded: 2 layout shifts where there were 24, evenly spaced frames; the one long gap that remains is building the card, before the movement starts. tools/ui now prints how evenly the half second after each step was drawn. (3) Start: Pieter saw the big icon dip, sometimes shake, then become small. The small one was the start frame's 128 px icon; it is now 244 px (a 160 px disc, Android's guideline size). The dip and the shake are NOT understood and not reproduced: they may happen between Android's own start picture and the page, before any of the app's code runs. A screen recording from his phone is the next step; no more guessing at this one.
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
| Fonts | Schibsted Grotesk, the latin files of `@fontsource` (400–800) through our own `styles/fonts.css` (`font-display: block`, preloaded), also embedded in each HTML export; Arial in Word exports | One family for app and HTML export; bundled for offline; no swap from a system font at start; the export fetches nothing; Arial is on every client PC |

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
  Exception: `src/data/backups.ts` awaits its writes (online-only, with a timeout).
  Exception: `prepareLink` in `data/invites.ts` awaits the invite's creation (10 s timeout): a link is useless to the client until the invite is on the server.
- **Fitness Profile invites** are the only data reachable without signing in. Keep it that way: the
  rules let a link holder `get` one unanswered invite and set its `answers`/`answeredAt` once, nothing
  more. `submitAnswers` is the one awaited write (the client must know it arrived). A change to the
  rules is live only after Pieter publishes `firestore.rules` in the console.
- **Privacy texts must stay true** (`data/privacy.ts`). Whenever client data starts going somewhere
  new (another provider, another Claude feature, analytics), or the storage period changes, update
  the notice and the consent and set `PRIVACY_VERSION` to the new date.
- **Screens read through `data/live.ts`.** Clients, programmes, notes, sessions and invites are
  each listened to once, whole, for as long as the app is open; the hooks in `store.ts` filter and
  sort on the device. Don't start another `onSnapshot` on one of these in a screen or a hook: it
  answers later than the page opens and the page then fills in piece by piece. A new everyday
  collection goes into `LIVE_COLLECTIONS`.
- **Nothing jumps.** A screen appears once, complete: no "Loading…" word, nothing arriving late
  that moves its neighbours, text only in its own font. Check a change to a screen with
  `node tools/ui/run.ts` (§5): the screen's step should stay one state with 0 layout shifts.
  `index.html`'s start frame and `<Splash />` are the same markup; change both.
- **Page changes move through `util/pageTransition.ts`.** Don't animate a page's arrival in the
  page itself, and don't call `startViewTransition` elsewhere. Inside the routed pages
  `useLocation()` is the page on screen, which lags the address by one transition; a page that
  reads `window.history` or the address directly must not change while it is leaving (see
  `TopBar`). Durations, distance and easing are tokens (`--motion-*`, `--ease-*`). A new element
  that must stay still or change in place during a page change gets its own
  `view-transition-name`; two elements on screen must never share one.
- **A movement must not lay the page out for every picture.** Animate how things are drawn
  (`transform`, `translate`, `opacity`, `clip-path`), not their size or place in the layout
  (`height`, `margin`, grid tracks): the layout changes once, the drawing moves. Something that
  opens under a line uses `components/Drop.tsx`. Record a new movement with `tools/ui/run.ts` and
  read its "frames after" line and its layout shifts; test page changes from a scrolled list and
  from a long page, with Back as well as the arrow.
- **Avoid composite indexes.** In the one-off reads that remain (`getDocs`), don't combine
  `where()` with `orderBy()` on another field; filter in Firestore, sort on the device.
- **The Anthropic API key never leaves the device.** It lives in localStorage (`src/settings.ts`).
  Never write it to Firestore, logs, or the repo.
- **Programme structure is free-shaped** (`src/data/types.ts`): Claude decides sessions, section titles
  and progression blocks. Only `ExerciseRow` has fixed fields. Do not hard-code training phases.
- **Ids are unique per programme; tools only keep ids from the session they replace**
  (`sessionIds` in `programmeTools.ts`; `duplicateIds` / `withUniqueIds` in `data/programmeIds.ts`).
  Anything new that copies or moves sessions, sections, rows or blocks must mint new ids (`newId()`).
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
2. `npm test` — the tests of the pure helpers pass (`src/**/*.test.ts`, vitest). A bug fixed in one
   of those helpers gets a test with it.
3. `npm run build` — type-checks (strict) and builds.
4. Bump `version` in `package.json` for every release (shown in Settings).
5. Update §0 above when a milestone lands.

The deploy workflow runs lint, test and build in that order; a push that fails one is not deployed.

## 4. Building programmes from Claude Code (`tools/`, since 2026-10-06)

Pieter could not buy API credits, so the AI work moved here: programmes are built and reworked in
Claude Code on his PC, which reads and writes the same Firestore the app uses. In the app,
Claude is switched off since 0.9.56 (`CLAUDE_IN_APP`); Create shows the drafts. How to work is in `.claude/skills/programme/SKILL.md`.

- `tools/` is not part of the app: its own `package.json` (`firebase-admin`), not in the bundle,
  the tests or the deploy. Node runs the `.ts` files directly. `npm run lint` at the root covers it.
- The service-account key lives outside the repo (`~/.petesgym/service-account.json`). It bypasses
  `firestore.rules`. Never copy it into the repo, print it or read it.
- `read.ts` reads; `draft.ts` creates one new programme, as a draft (or, for an old programme
  converted from a document, as archived with the document's date; `docx.ts` reads Word
  files); `change.ts` changes
  one programme's content and can undo its last change (before-states in `~/.petesgym/undo`).
  `translate.ts` fills a programme's German or Afrikaans cache (`translationsDe`,
  `translationsAf`), which is where the export sheet takes that language from. `profile.ts` changes a client's six profile texts, with
  undo. Nothing else writes. Weights and private notes are never
  shown to Claude and survive a change by the 0.9.50 rule.
- `shape.ts`, `db.ts` and `translate.ts` repeat five small rules of the app (`newId`,
  `exerciseKey`, the library link, the `[{cells}]` table encoding, `clientFacingStrings`) because
  the app's files don't load in plain Node. Change one, change both.
- Checked on 2026-10-06 against the real database: `node selftest.ts` (25 checks, for a
  programme, a profile and an archived import: change, weight and note rule, stale file refused, undo, undo
  refused after an edit in the app). Client data is processed under Pieter's Claude subscription;
  he switched model training off there on 2026-10-06. No old programme has been imported this
  way yet. The German cache was filled for one programme (158 strings); the export with it is not
  yet seen in the app.
- `livecheck.ts` signs in as the owner (a token made by the service account) with the browser SDK
  and listens the way `src/data/live.ts` does, against the real database and its rules. It prints
  counts and times only. Run it after changing how the app listens.

## 5. Looking at the UI (`tools/ui`, since 2026-10-06)

`node tools/ui/run.ts [scenario…]` (from the repo root) builds the real app on a stand-in backend
and records how its screens appear in a headless Chrome the size of a phone, slowed down four
times. Nothing of it is deployed.

- `tools/ui/vite.config.ts` swaps `firebase/app`, `firebase/auth`, `firebase/firestore` and the
  service worker for the files in `tools/ui/fake/`; everything else is the app's own code. The
  data is made up (`fake/seed.ts`): no real person is in it. The stand-in answers each listener
  after a delay (`fake/options.ts`: `?auth=…&cold=…&db=…&jitter=…`), like a cold start on a phone.
- Per scenario it writes `tools/ui/out/<name>/frames/*.jpg` (every picture the screen showed, named
  by its time) and `report.json`, and prints a timeline: each state of the page (text and
  background) and each layout shift with the element that moved and by how much. `out/` is not in
  git. Scenarios are in `run.ts` (`SCENARIOS`): cold starts (dark, light chosen, on Clients,
  first-ever, signed out, desktop), tab switches, into a client and a programme and back, opening
  a tab the moment the app is up, creating a programme.
- A screen that appears well: one state per step, 0 layout shifts. Add a scenario for a screen
  before polishing it, and compare the timeline before and after.
- When the app uses a Firestore call the stand-in lacks, add it to `fake/firestore.ts`.
- Limits: it shows order and jumps, not real speed (no Firebase SDK to load, no service worker);
  animations are recorded frame by frame but not judged; nothing replaces a look on the phone.
