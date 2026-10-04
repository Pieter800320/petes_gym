/*
 * What Claude costs: prices, the cost of a response, and the ledger hook. Kept apart from
 * client.ts so the parts of the app that only show or record costs don't load the Anthropic SDK.
 */
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
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`
}
