/*
 * Fitness Profile links. Pete creates an invite (users/{uid}/invites/{token}) and sends its link;
 * the client, who has no account, opens it and sends their answers into that one document.
 * The database rules (firestore.rules) allow exactly that and nothing else: anyone holding the
 * link may read the invite while it is unanswered and fill in its answers once. After that the
 * link is dead: the answers can be read by Pete only.
 */
import { useEffect, useState } from 'react'
import { collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, setDoc, updateDoc, waitForPendingWrites } from 'firebase/firestore'
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
  /** Not stored: this device has written the invite but the server doesn't have it yet, so its link would not open. */
  pending: boolean
}

type StoredInvite = Omit<Invite, 'id' | 'pending'>

const invitesOf = (uid: string) => collection(requireDb(), 'users', uid, 'invites')

/** How long "Send fitness profile link" waits for a new invite to reach the server. */
const LINK_TIMEOUT_MS = 10_000
const NO_CONNECTION = 'No connection: the link would not work for the client yet. Send it when you have signal.'

/** The address a client opens. It names Pete's account and the invite; neither is a secret on its own. */
function inviteLink(uid: string, token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/fit/${uid}/${token}`
}

/** The link already waiting for this person, if there is one: sending it twice mustn't leave two links open. */
function openInvite(invites: Invite[], clientId: string | null, name: string): Invite | undefined {
  return invites.find((i) => i.answeredAt === null && (clientId ? i.clientId === clientId : i.clientId === null && i.name === name.trim()))
}

/** This person's link when its invite is already on the server (it can be shared in the same tap), else null. */
export function readyLink(uid: string, invites: Invite[], clientId: string | null, name: string): string | null {
  const open = openInvite(invites, clientId, name)
  return open && !open.pending ? inviteLink(uid, open.id) : null
}

/**
 * The link to send, once it will work: the invite is created if this person has none, and the
 * link is returned only when the server has it. Awaited, unlike other writes in the app: a link
 * is useless to the client until then. Without a connection, or after 10 s, it fails with a
 * message for Pete; an invite created meanwhile stays queued and is reused on the next try.
 */
export async function prepareLink(uid: string, invites: Invite[], clientId: string | null, name: string): Promise<string> {
  const open = openInvite(invites, clientId, name)
  if (open && !open.pending) return inviteLink(uid, open.id)
  if (!navigator.onLine) throw new Error(NO_CONNECTION)
  let token: string
  let arrived: Promise<void>
  if (open) {
    // Written earlier and still waiting to be sent: wait for the queue rather than write a second one.
    token = open.id
    arrived = waitForPendingWrites(requireDb())
  } else {
    const ref = doc(invitesOf(uid))
    const data: StoredInvite = { clientId, name: name.trim(), createdAt: Date.now(), answeredAt: null, ...(isNotifyUrl(notifyUrl) ? { notifyUrl } : {}) }
    token = ref.id
    arrived = setDoc(ref, data)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(NO_CONNECTION)), LINK_TIMEOUT_MS)
  })
  try {
    await Promise.race([arrived, timeout])
  } catch (err) {
    if (err instanceof Error && err.message === NO_CONNECTION) throw err
    // Refused by the server, not a matter of signal.
    console.error(err)
    throw new Error('The link could not be created. Try again.', { cause: err })
  } finally {
    clearTimeout(timer)
  }
  return inviteLink(uid, token)
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
      // Also told when a write of this device reaches the server, for `pending`.
      { includeMetadataChanges: true },
      (snap) => setInvites(snap.docs.map((d) => ({ ...(d.data() as StoredInvite), id: d.id, pending: d.metadata.hasPendingWrites })).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))),
      (err) => console.error(err),
    )
  }, [user])
  return invites
}

// ── Email when answers arrive ────────────────────────────────────────
//
// users/{uid}/meta/settings.notifyUrl is the address of a script in Pete's own Google account that
// emails him. Each invite carries it, so the client's page can call it after sending: new ones get
// it when they are made, and the ones still unanswered when the address is saved or changed.

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

/**
 * Saves the address (empty switches the emails off) and gives it to the links already sent and
 * not yet answered, so they email Pete too and none keeps calling an address he has replaced.
 */
export function saveNotifyUrl(uid: string, url: string, invites: Invite[]) {
  const next = url.trim()
  setDoc(settingsRef(uid), { notifyUrl: next }, { merge: true }).catch(reportWriteError)
  for (const invite of invites) {
    if (invite.answeredAt !== null || (invite.notifyUrl ?? '') === next) continue
    updateDoc(doc(invitesOf(uid), invite.id), { notifyUrl: next || deleteField() }).catch(reportWriteError)
  }
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
    const d = snap.data() as StoredInvite
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
