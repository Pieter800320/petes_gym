/*
 * Anthropic client for the browser. The key comes from this device's localStorage (Settings) and
 * is sent only to api.anthropic.com. dangerouslyAllowBrowser is acceptable here because this is a
 * single-user app on the owner's own devices, and the key is never bundled or synced.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from '../settings'

/** Programme design (the Create chat) and archive import: work that needs judgement. */
export const MODEL_DESIGN = 'claude-sonnet-5-5'
/** Translation, questionnaire import, reading files: simple jobs. Haiku takes no effort setting. */
export const MODEL_LIGHT = 'claude-haiku-4-5'

// Prices and the cost ledger live in cost.ts (no SDK); re-exported for the modules that call Claude.
export { costUsd, formatUsd, setCostSink, trackCost, type CostKind, type Usage } from './cost'

/** Server-side refusal fallback: on a policy decline the API reruns on a suitable model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export class MissingApiKeyError extends Error {
  constructor() {
    super('Add your Anthropic API key in Settings (the gear at the top right) to use Claude on this device.')
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
  // Out of credit arrives as a rejected request; say so plainly instead of showing the raw reply.
  if (err instanceof Anthropic.APIError && /credit balance/i.test(err.message)) return 'Your Anthropic account is out of credits. Add credits at console.anthropic.com (Billing), then try again.'
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status}). Try again.`
  if (err instanceof Error) return err.message
  return 'Something went wrong talking to Claude.'
}
