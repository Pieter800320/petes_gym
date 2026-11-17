import { describe, expect, it } from 'vitest'
import { capStartCheck } from './startCheck'

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=x'

/** A fetch that answers only when its signal aborts (a connection that never answers). */
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
const answering: typeof fetch = async () => new Response('{}')

describe('capStartCheck', () => {
  it('gives up on the start-up sign-in check after the limit', async () => {
    const capped = capStartCheck(hanging, new Promise(() => {}), 20)
    await expect(capped(LOOKUP, { method: 'POST' })).rejects.toThrow('No answer at start')
  })

  it('leaves every other request alone', async () => {
    const capped = capStartCheck(hanging, new Promise(() => {}), 20)
    const other = capped('https://firestore.googleapis.com/x')
    const result = await Promise.race([other.then(() => 'answered', () => 'failed'), new Promise((r) => setTimeout(() => r('still waiting'), 60))])
    expect(result).toBe('still waiting')
  })

  it('passes answers through', async () => {
    const capped = capStartCheck(answering, new Promise(() => {}), 20)
    expect((await capped(LOOKUP)).ok).toBe(true)
  })

  it('stops capping once the start is over', async () => {
    const capped = capStartCheck(hanging, Promise.resolve(), 20)
    await new Promise((r) => setTimeout(r, 0))
    const result = await Promise.race([capped(LOOKUP).then(() => 'answered', () => 'failed'), new Promise((r) => setTimeout(() => r('still waiting'), 60))])
    expect(result).toBe('still waiting')
  })
})
