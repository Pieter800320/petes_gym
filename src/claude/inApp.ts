/*
 * Whether Claude works inside the app: the Create chat, "Rework with Claude", the two importers,
 * translating in the export sheet, and the API key and costs in Settings.
 *
 * Off since 0.9.56 (Pieter, 2026-10-06): programmes are built in Claude Code on the PC and land in
 * the app as drafts (CLAUDE.md §4). Create is where drafts are checked, edited by hand and made
 * current. Nothing was removed: set this to true and the chat and the rest are back as they were.
 */
export const CLAUDE_IN_APP: boolean = false

/** Where a draft opens: the chat while Claude is in the app, else its own page. */
export function draftPath(id: string): string {
  return CLAUDE_IN_APP ? `/create/${id}` : `/programmes/${id}`
}
