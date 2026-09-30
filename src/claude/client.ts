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

/** USD per million tokens. Cache writes are the 5-minute ones (1.25× input). */
interface Price {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

// Longest prefix first: 'claude-sonnet-5-5' must not match the 'claude-sonnet-5' row.
const PRICES: [string, Price][] = [
  ['claude-opus-5-5', { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }],
  ['claude-opus-4', { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }],
]

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/**
 * What a response cost in USD, from the token counts the API returns (thinking is part of the
 * output tokens). `model` is the one that answered: a refusal fallback can differ from the one asked.
 */
export function costUsd(model: string, usage: Usage): number {
  const price = PRICES.find(([prefix]) => model.startsWith(prefix))?.[1]
  if (!price) return 0
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  )
}

export type CostKind = 'create' | 'translate' | 'import'

/** Where spending is recorded (the Firestore ledger); set once the user is signed in (App.tsx). */
let costSink: ((kind: CostKind, usd: number) => void) | null = null

export function setCostSink(sink: ((kind: CostKind, usd: number) => void) | null) {
  costSink = sink
}

/** Adds a response's cost to the ledger and returns it. */
export function trackCost(kind: CostKind, response: { model: string; usage: Usage }): number {
  const usd = costUsd(response.model, response.usage)
  if (usd > 0) costSink?.(kind, usd)
  return usd
}

/** "$0.042" for small amounts, "$1.20" from a dollar up. */
export function formatUsd(usd: number): string {
  return usd < 1 ? `${usd.toFixed(3)}` : `${usd.toFixed(2)}`
}

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
