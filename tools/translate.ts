/*
 * German or Afrikaans text for the export, written into the programme's cache for that language
 * (translationsDe, translationsAf). The export sheet takes its text from there and calls nobody,
 * so once every string is in the cache the export in that language works.
 *
 *   node translate.ts <de|af> missing <programmeId>              the strings still to translate, as a JSON list
 *   node translate.ts <de|af> save <programmeId> <pairs.json>    checks the pairs; writes nothing
 *   node translate.ts <de|af> save <programmeId> <pairs.json> --write
 *
 * pairs.json is [{ "src": "<English as printed by missing>", "text": "<the translation>" }, …].
 * Only the cache is written: the programme's own text is never changed here.
 */
import { readFileSync } from 'node:fs'
import { decodeProgramme, userCollection } from './db.ts'
import type { Client, Programme } from '../src/data/types.ts'

const LANGUAGES = { de: { field: 'translationsDe', name: 'German' }, af: { field: 'translationsAf', name: 'Afrikaans' } } as const
type Lang = keyof typeof LANGUAGES

/**
 * The strings the export translates: clientFacingStrings in src/claude/translate.ts plus the two
 * the export sheet adds (ExportSheet.tsx, germanText). Exercise names stay as in the library.
 * Where the programme has no goal, frequency or session length, the sheet starts from the client's.
 */
function wantedStrings(p: Programme, client: Partial<Client>): string[] {
  const out: string[] = [p.title, p.goal || client.goals || '', p.personalNote, ...p.successMarkers]
  const block = (b: Programme['progression']) => {
    if (b) out.push(b.title, b.rule, ...b.columns, ...b.rows.flat())
  }
  block(p.progression)
  for (const s of p.sessions) {
    out.push(s.title, s.focus)
    for (const sec of s.sections) {
      out.push(sec.title, sec.duration, sec.note)
      for (const r of sec.rows) out.push(r.prescription, r.rest, r.notes, r.alternative)
    }
    s.progressionBlocks.forEach(block)
  }
  // Only strings with letters need translating ("3 × 8", "90s" pass through unchanged).
  const text = [...new Set(out.map((s) => s.trim()).filter((s) => /[a-zA-Z]{2,}/.test(s) && !/^\d+\s*s$/.test(s)))]
  return text.concat([p.frequency || client.frequency || '', p.sessionLength || client.sessionLength || ''].filter(Boolean))
}

const USAGE = 'Usage: node translate.ts <de|af> missing <programmeId> | <de|af> save <programmeId> <pairs.json> [--write]'
const [langArg, command, id, file, flag] = process.argv.slice(2)
if (!(langArg in LANGUAGES) || !id || (command !== 'missing' && command !== 'save')) {
  console.log(USAGE)
  process.exit(0)
}
const lang = langArg as Lang
const { field, name } = LANGUAGES[lang]

const ref = userCollection('programmes').doc(id)
const snap = await ref.get()
if (!snap.exists) throw new Error(`No programme with id ${id}.`)
const programme = decodeProgramme(snap.data()!, snap.id)
const client = ((await userCollection('clients').doc(programme.clientId).get()).data() ?? {}) as Partial<Client>
const wanted = wantedStrings(programme, client)
/** The cache as stored: German pairs carry their text as `de`, Afrikaans ones as `af`. */
const cache = ((programme[field] ?? []) as unknown as Record<string, string>[]).map((t) => ({ src: t.src, text: t[lang] }))
const known = new Set(cache.map((t) => t.src))
const missing = wanted.filter((s) => !known.has(s))

if (command === 'missing') {
  console.log(JSON.stringify(missing, null, 2))
} else {
  if (!file) throw new Error(USAGE)
  const pairs = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as { src: string; text: string }[]
  const problems: string[] = []
  const given = new Map<string, string>()
  for (const [i, t] of pairs.entries()) {
    if (typeof t?.src !== 'string' || typeof t?.text !== 'string' || !t.text.trim()) problems.push(`pair ${i + 1}: needs "src" and a non-empty "text"`)
    else if (!missing.includes(t.src)) problems.push(`pair ${i + 1}: "${t.src}" is not a string this programme still needs`)
    else if (given.has(t.src)) problems.push(`pair ${i + 1}: "${t.src}" is given twice`)
    else given.set(t.src, t.text)
  }
  const still = missing.filter((s) => !given.has(s))
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  // As the app saves it: without strings the programme no longer has, so the cache doesn't grow with every edit.
  const inUse = new Set(wanted)
  const kept = [...cache, ...missing.filter((s) => given.has(s)).map((src) => ({ src, text: given.get(src)! }))].filter((t) => inUse.has(t.src))
  console.log(JSON.stringify({ title: programme.title, language: name, strings: wanted.length, inCacheBefore: wanted.length - missing.length, added: given.size, dropped: cache.length + given.size - kept.length, stillMissing: still }, null, 2))
  if (flag !== '--write') {
    console.log('Checked only; nothing was written. Add --write to save the cache.')
  } else {
    // Refused by the server when the programme changed between the read above and this write.
    await ref.update({ [field]: kept.map((t) => ({ src: t.src, [lang]: t.text })), updatedAt: Date.now() }, { lastUpdateTime: snap.updateTime })
    console.log(still.length ? `Saved. ${still.length} strings are still without ${name}.` : `Saved. Every string has ${name} now.`)
  }
}
