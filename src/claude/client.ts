/*
 * Anthropic client for the browser. The key comes from this device's localStorage (Settings) and
 * is sent only to api.anthropic.com. dangerouslyAllowBrowser is acceptable here because this is a
 * single-user app on the owner's own devices, and the key is never bundled or synced.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from '../settings'

/** Programme design and chat: judgement-heavy work gets the top model. */
export const MODEL_DESIGN = 'claude-opus-5-5'
/** Translation and archive import: mechanical work, cheaper and faster. */
export const MODEL_UTILITY = 'claude-sonnet-5-5'

/** Server-side refusal fallback: on a policy decline the API reruns on a suitable model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export class MissingApiKeyError extends Error {
  constructor() {
    super('Add your Anthropic API key in Settings (Clients → gear icon) to use Claude on this device.')
  }
}

let cached: { key: string; client: Anthropic } | null = null

export function getClaude(): Anthropic {
  const key = getApiKey()
  if (!key) throw new MissingApiKeyError()
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) }
  return cached.client
}

/** Turns an SDK error into one sentence Pete can act on. */
export function describeClaudeError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message
  if (err instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Check it in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Claude is rate-limited right now. Wait a minute and try again.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your internet connection.'
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status}). Try again.`
  if (err instanceof Error) return err.message
  return 'Something went wrong talking to Claude.'
}
