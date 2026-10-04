/*
 * Fitness Profile links. Pete creates an invite (users/{uid}/invites/{token}) and sends its link;
 * the client, who has no account, opens it and sends their answers into that one document.
 * The database rules (firestore.rules) allow exactly that and nothing else: anyone holding the
 * link may read the invite while it is unanswered and fill in its answers once. After that the
 * link is dead: the answers can be read by Pete only.
 */
import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { reportWriteError } from './store'
import { useAuth } from '../auth/useAuth'
import { requireDb } from '../firebase'
import type { Answers } from './fitnessProfile'

export interface Invite {
  /** The token in the link: a random id nobody can guess. */
  id: string
  /** The client the answers are for; null when the link was sent before a profile existed. */
  clientId: string | null
  /** First name, to greet the client on the form. */
  name: string
  createdAt: number
  /** Set by the client's device when the answers are sent. */
  answeredAt: number | null
  answers?: Answers
  /** Pete's own script to call when the answers are sent, so he gets an email (see NotifySheet). */
  notifyUrl?: string
}

const invitesOf = (uid: string) => collection(requireDb(), 'users', uid, 'invites')

/** Creates the invite and returns its token. The link works once this has reached the server. */
function createInvite(uid: string, clientId: string | null, name: string): string {
  const ref = doc(invitesOf(uid))
  const data: Omit<Invite, 'id'> = { clientId, name: name.trim(), createdAt: Date.now(), answeredAt: null, ...(isNotifyUrl(notifyUrl) ? { notifyUrl } : {}) }
  setDoc(ref, data).catch(reportWriteError)
  return ref.id
}

/** The address a client opens. It names Pete's account and the invite; neither is a secret on its own. */
function inviteLink(uid: string, token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/fit/${uid}/${token}`
}

/**
 * The link to send: the one already waiting for this person if there is one (so sending it twice
 * doesn't leave two links open), else a new one.
 */
export function linkFor(uid: string, invites: Invite[], clientId: string | null, name: string): string {
  const open = invites.find((i) => i.answeredAt === null && (clientId ? i.clientId === clientId : i.clientId === null && i.name === name.trim()))
  return inviteLink(uid, open?.id ?? createInvite(uid, clientId, name))
}

/** Removes an invite: once its answers are in a profile, or to cancel a link. */
export function deleteInvite(uid: string, token: string) {
  deleteDoc(doc(invitesOf(uid), token)).catch(reportWriteError)
}

/** Pete's invites, newest answers first. */
export function useInvites(): Invite[] {
  const { user } = useAuth()
  const [invites, setInvites] = useState<Invite[]>([])
  useEffect(() => {
    if (!user) return
    return onSnapshot(
      invitesOf(user.uid),
      (snap) => setInvites(snap.docs.map((d) => ({ ...(d.data() as Omit<Invite, 'id'>), id: d.id })).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))),
      (err) => console.error(err),
    )
  }, [user])
  return invites
}

// ── Email when answers arrive ────────────────────────────────────────
//
// users/{uid}/meta/settings.notifyUrl is the address of a script in Pete's own Google account that
// emails him. Each new invite carries it, so the client's page can call it after sending.

const settingsRef = (uid: string) => doc(requireDb(), 'users', uid, 'meta', 'settings')
/** The saved address, kept current while the app is open (watchNotifyUrl), for new invites. */
let notifyUrl = ''

/** Only Google's own script addresses are ever called. */
export const isNotifyUrl = (url: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url.trim())

export function watchNotifyUrl(uid: string, onChange?: (url: string) => void): () => void {
  return onSnapshot(settingsRef(uid), (snap) => {
    notifyUrl = String((snap.data() as { notifyUrl?: string } | undefined)?.notifyUrl ?? '')
    onChange?.(notifyUrl)
  }, (err) => console.error(err))
}

export function useNotifyUrl(): string {
  const { user } = useAuth()
  const [url, setUrl] = useState(notifyUrl)
  useEffect(() => (user ? watchNotifyUrl(user.uid, setUrl) : undefined), [user])
  return url
}

export function saveNotifyUrl(uid: string, url: string) {
  setDoc(settingsRef(uid), { notifyUrl: url.trim() }, { merge: true }).catch(reportWriteError)
}

/** Calls the script. Nothing is sent with it and nothing comes back; a failure is not the client's concern. */
export function pingNotify(url: string) {
  if (!isNotifyUrl(url)) return
  fetch(url.trim(), { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => undefined)
}

// ── The client's side (no account) ───────────────────────────────────

/** How long the form waits for the server before telling the client it is still sending. */
const SEND_TIMEOUT_MS = 20_000

/** Firestore's error code ('permission-denied', 'unavailable'…), if the error has one. */
const codeOf = (err: unknown) => (err as { code?: unknown } | null)?.code

/**
 * What the form learns about its link. gone: wrong, cancelled or already used (the rules refuse to
 * show an answered invite to anyone but Pete). offline: the server could not be asked, so the link
 * may well be fine.
 */
export type InviteRead = { kind: 'ok'; name: string; notifyUrl: string } | { kind: 'gone' } | { kind: 'offline' }

export async function readInvite(uid: string, token: string): Promise<InviteRead> {
  try {
    const snap = await getDoc(doc(invitesOf(uid), token))
    if (!snap.exists()) return { kind: 'gone' }
    const d = snap.data() as Omit<Invite, 'id'>
    return d.answeredAt === null ? { kind: 'ok', name: d.name, notifyUrl: d.notifyUrl ?? '' } : { kind: 'gone' }
  } catch (err) {
    // Only the server's own refusal means the link is dead; everything else is the connection.
    return codeOf(err) === 'permission-denied' && navigator.onLine !== false ? { kind: 'gone' } : { kind: 'offline' }
  }
}

/**
 * Sends the answers. Unlike writes in the app itself this one is awaited: the client must be told
 * for certain whether Pete received them. It is sent once and waited for however long it takes
 * (a second attempt could be refused because the first one arrived); onSlow is called when the
 * wait gets long, so the page can ask the client to keep it open.
 */
export async function submitAnswers(uid: string, token: string, answers: Answers, onSlow: () => void): Promise<void> {
  const slow = setTimeout(onSlow, SEND_TIMEOUT_MS)
  try {
    await updateDoc(doc(invitesOf(uid), token), { answers, answeredAt: Date.now() })
  } catch (err) {
    // Refused, and the invite can no longer be read either: it is answered (this write got
    // through and was then repeated) or cancelled. Either way there is nothing left to send.
    if (codeOf(err) === 'permission-denied' && (await readInvite(uid, token)).kind === 'gone') return
    throw err
  } finally {
    clearTimeout(slow)
  }
}
