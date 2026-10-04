import { useState } from 'react'
import { shareProfileLink } from './shareProfileLink'
import { toast } from './toast'
import { useAuth } from '../auth/useAuth'
import { prepareLink, readyLink, useInvites } from '../data/invites'

type LinkState = { status: 'idle' } | { status: 'preparing' } | { status: 'ready'; link: string; name: string }

/**
 * The "Send fitness profile link" line. A link is shared only once its invite is on the server:
 * before that it would not open for the client. When the invite is already there, one tap shares
 * it. Otherwise the tap creates it and waits, and the line then reads "Share link ›": the phone's
 * share sheet only opens straight from a tap, and the wait uses that tap up.
 * clientId: the client the answers are for, or null for someone without a profile yet.
 */
export function useProfileLink(clientId: string | null, name: string): { status: LinkState['status']; tap: () => void } {
  const { user } = useAuth()
  const invites = useInvites()
  const [state, setState] = useState<LinkState>({ status: 'idle' })
  const person = name.trim()
  const firstName = person.split(/\s+/)[0] || undefined
  // A link prepared for a name that has been retyped since is not this person's.
  const current: LinkState = state.status === 'ready' && state.name !== person ? { status: 'idle' } : state

  function tap() {
    if (!user || current.status === 'preparing') return
    if (current.status === 'ready') {
      shareProfileLink(current.link, firstName)
      setState({ status: 'idle' })
      return
    }
    const ready = readyLink(user.uid, invites, clientId, person)
    if (ready) {
      shareProfileLink(ready, firstName)
      return
    }
    setState({ status: 'preparing' })
    prepareLink(user.uid, invites, clientId, person).then(
      (link) => setState({ status: 'ready', link, name: person }),
      (err: unknown) => {
        setState({ status: 'idle' })
        toast(err instanceof Error ? err.message : 'The link could not be created. Try again.')
      },
    )
  }

  return { status: current.status, tap }
}
