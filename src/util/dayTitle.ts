/** "Day 2 — Lower Strength + Box Jumps" → { main: "Lower Strength", extra: "+ Box Jumps" }. */
export function splitDayTitle(title: string, index: number): { main: string; extra: string } {
  const clean = title.replace(/^\s*(day|tag)\s*\d+\s*[—–:\-·.]*\s*/i, '').trim()
  if (!clean) return { main: `Day ${index + 1}`, extra: '' }
  const plus = clean.search(/\s\+\s/)
  return plus < 0 ? { main: clean, extra: '' } : { main: clean.slice(0, plus), extra: `+ ${clean.slice(plus + 3)}` }
}
