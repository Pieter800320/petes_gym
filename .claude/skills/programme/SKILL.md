---
name: programme
description: Build or rework a training programme for Pete or one of his clients from Claude Code, reading and writing the Pete's Gym database through the scripts in tools/. Use when Pieter says "new programme for …", "next block for …", "change … in the … programme", "rework …", or asks what a client's programme looks like.
---

# Building programmes from Claude Code

Since 2026-10-06 the AI work of Pete's Gym is done here, on Pieter's PC, instead of in the app's
Create chat. The phone and the app stay as they are; both read the same Firestore database, so a
programme written here appears in the app at once.

All database access goes through the scripts in `tools/` (run them from that folder). Never read or
write Firestore any other way, and never open the key file (`~/.petesgym/service-account.json`).

## Before the first real client

⚠️ Open point, not yet answered by Pieter: client data read here is processed under his Claude
subscription, not under the API's commercial terms. Until he says he has checked the model-training
setting in his Claude account, work only with his own profile (`self`) and do not run `clients`,
`client`, `notes`, `sessions` or `programme` for anyone else. Ask him once, then note his answer
here and remove this section. `src/data/privacy.ts` may need a line and a new `PRIVACY_VERSION`
(repo rule: privacy texts must stay true).

## Reading

| Command | Gives |
|---|---|
| `node read.ts playbook` | The Coach Playbook in use (Pete's saved text, else the app's default). **Read it first, every time**, and follow it. |
| `node read.ts clients` | Names and ids. `self` is Pieter. |
| `node read.ts client <id>` | Profile: goals, injuries, frequency, session length, equipment, background, questionnaire. |
| `node read.ts notes <id>` | Pete's notes on the client, newest first. |
| `node read.ts programmes [clientId]` | Titles, status, ids. |
| `node read.ts programme <id>` | One programme as JSON. |
| `node read.ts sessions <clientId>` | Finished sessions, with changes made in the gym. |
| `node read.ts library <words>` | Library exercises matching every word: name, patterns, equipment, contraindications, video. |

Weights and private notes (`ExerciseRow.load`, `memo`) are never in what these print. Do not try to
get at them another way.

## A new programme

1. Read the playbook, the client, their notes, their current and previous programmes, and their
   sessions. For a follow-up block say what you keep and what you change.
2. If something the playbook requires is missing, ask at most three short questions in one message.
3. Write the programme as a JSON file **in the scratchpad, not in the repo**, in the shape of `Spec`
   in `tools/draft.ts`: no ids, every row with name, prescription, rest, notes (the cue),
   alternative, superset.
4. `node draft.ts <file>` checks it and prints a summary. Go through it:
   - `notInLibrary`: use the exact library name wherever the library has the exercise; say why for
     the rest. Never invent a video link.
   - `contraindications`: hold each line against the client's injuries. The playbook treats them
     as hard limits: regress or swap, or tell Pieter plainly which ones remain and why.
   - `withoutCue`: every row needs a cue unless it was copied from Pete's own rows.
5. `node draft.ts <file> --write` saves it. It is always a **draft**; Pieter makes it current
   himself in the app. Never change a programme's status from here.
6. Report: the days at a glance, every call you made on his behalf, time per day, what is not in
   the library, any contraindication left in.

## Changing an existing programme

1. `node read.ts programme <id>` into a scratchpad file.
2. Edit that file. Keep the `id` of everything that stays the same thing; give new rows, sections,
   days and tables no id. Change only what was asked; anything else is a suggestion in your reply.
3. `node change.ts apply <file>` prints what changes, per day. Check it says what you meant.
4. `node change.ts apply <file> --write`. It refuses when the programme was edited in the app
   since step 1: read it again and redo the edit on the new state. Pete's edits are decisions.
5. "Undo that": `node change.ts undo <id> --write` puts back the state before the last change. It
   refuses when the programme was edited in the app after that change.

A change to a **current** programme is live in the gym at once. Say so before writing one, and
prefer "Build next block" in the app (a draft copy) for anything larger than a few rows.

## Rules the app's Create chat followed, which hold here too

- Everything the client sees (titles, focus, section names, cues, prescriptions, alternatives,
  goal, markers, tables) is plain language without jargon or abbreviations; cues are 8 words or
  fewer. Coach terms and reasoning go in `coachNotes` and in your reply to Pieter.
- Progression tables go where they apply. A table about one exercise goes in `progressionBlocks`
  of the day that exercise is trained; if the exercise moves, its table moves with it. Only the
  plan for the whole programme goes in `progression`.
- Prescriptions the app can count: `3 × 8–10`, `3 × 8/leg`, `4 × 20s/40s`, `2 × 30s/side`, rest as
  `90s` or `2 min`, `—` for none. The app estimates a day as sets × (40 s + rest) plus 45 s per
  exercise change, counting superset partners separately, so its figure runs high; give your own
  estimate per day and keep it within the playbook's ±5 minutes.
- Write a coaching read into `coachNotes` before anything else: what limits this client and how
  the programme deals with it.
- The personal note is Pete's. Leave it alone unless he asks for a draft.
- Programme structure is free: no fixed phases or section names.

## Not built yet

German translations into the programme's cache, profile updates from Pete's notes, importing old
programmes (Word/PDF/photos). Until they exist, those still run in the app (which needs API
credits) or wait.

## Checking the tools

`node selftest.ts` runs a change and an undo on a throwaway draft under `self` and deletes it
again (16 checks). Run it after changing anything in `tools/`. `npm run typecheck` in `tools/`
type-checks the scripts; the app's own `npm run lint` covers them too.
