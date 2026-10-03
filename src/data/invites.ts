/*
 * Fitness Profile links. Pete creates an invite (users/{uid}/invites/{token}) and sends its link;
 * the client, who has no account, opens it and sends their answers into that one document.
 * The database rules (firestore.rules) allow exactly that and nothing else: anyone holding the
 * link may read the invite while it is unanswered and fill in its answers once. After that the
 * link is dead: the answers can be read by Pete only.
 */
import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
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
}

const invitesOf = (uid: string) => collection(requireDb(), 'users', uid, 'invites')

function reportWriteError(err: unknown) {
  console.error('Firestore write failed', err)
  window.dispatchEvent(new CustomEvent('pg:error', { detail: 'Could not save. Check your connection and try again.' }))
}

/** Creates the invite and returns its token. The link works once this has reached the server. */
function createInvite(uid: string, clientId: string | null, name: string): string {
  const ref = doc(invitesOf(uid))
  const data: Omit<Invite, 'id'> = { clientId, name: name.trim(), createdAt: Date.now(), answeredAt: null }
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

// ── The client's side (no account) ───────────────────────────────────

/** How long the form waits for the server before saying the connection failed. */
const SEND_TIMEOUT_MS = 20_000

/**
 * What the form needs to know about its link. Null when the link is wrong, not active yet, or
 * already used: the rules refuse to show an answered invite to anyone but Pete.
 */
export async function readInvite(uid: string, token: string): Promise<{ name: string } | null> {
  try {
    const snap = await getDoc(doc(invitesOf(uid), token))
    if (!snap.exists()) return null
    const d = snap.data() as Omit<Invite, 'id'>
    return d.answeredAt === null ? { name: d.name } : null
  } catch {
    return null
  }
}

/**
 * Sends the answers. Unlike writes in the app itself this one is awaited: the client must be told
 * for certain whether Pete received them, so it fails after a while without a connection.
 */
export async function submitAnswers(uid: string, token: string, answers: Answers): Promise<void> {
  const write = updateDoc(doc(invitesOf(uid), token), { answers, answeredAt: Date.now() })
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), SEND_TIMEOUT_MS))
  await Promise.race([write, timeout])
}
