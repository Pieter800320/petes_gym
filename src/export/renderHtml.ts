/*
 * Self-contained HTML export in the house style of Sophie_8Week_Program.html.
 * The stylesheet is Sophie's, extended with: section rows inside a day's table, video links,
 * "how you'll know it's working" markers and a block-wide progression table.
 */
import type { ExportBlock, ExportDoc } from './exportModel'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STYLE = `
  :root {
    --paper: #EEEBE3; --ink: #1B1D18; --ink-soft: #5B584E; --ink-faint: #857F70;
    --rule: #D9D4C7; --rule-strong: #B8B2A0; --accent: #C6491D; --accent-soft: #C6491D1a;
    --teal: #2B6358; --teal-soft: #2b635814; --row-alt: #E6E2D8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #17181A; --ink: #EDEAE1; --ink-soft: #A9A498; --ink-faint: #726D62;
      --rule: #34322C; --rule-strong: #46443B; --accent: #FF7A45; --accent-soft: #ff7a4526;
      --teal: #4FA697; --teal-soft: #4fa69722; --row-alt: #1D1F21;
    }
  }
  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', system-ui, sans-serif; padding: clamp(20px, 5vw, 56px) 16px 64px; margin: 0; }
  main { max-width: 780px; margin: 0 auto; }
  h1, h2, .day-num { font-family: 'Oswald', 'Arial Narrow', sans-serif; text-transform: uppercase; text-wrap: balance; }
  header.masthead { border-bottom: 3px solid var(--ink); padding-bottom: 22px; margin-bottom: 28px; }
  .eyebrow { font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin: 0 0 8px; }
  h1 { font-size: clamp(1.7rem, 4.4vw, 2.5rem); font-weight: 600; letter-spacing: 0.01em; margin: 0 0 18px; line-height: 1.1; }
  .stat-row { display: flex; flex-wrap: wrap; gap: 22px 40px; margin: 0; }
  .stat dt { font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 4px; }
  .stat dd { margin: 0; font-size: 1rem; max-width: 46ch; line-height: 1.4; }
  .stat dd.num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; font-size: 1.15rem; }
  .personal-note { margin-top: 22px; }
  .personal-note p { margin: 0 0 12px; font-size: 0.94rem; line-height: 1.55; max-width: 62ch; }
  .personal-note p:last-child { margin-bottom: 0; }
  .markers { margin-top: 22px; }
  .markers h3 { font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 6px; font-weight: 600; }
  .markers ul { margin: 0; padding-left: 1.2em; font-size: 0.94rem; line-height: 1.55; }
  section.day { margin-top: 46px; padding-top: 28px; border-top: 1px solid var(--rule-strong); }
  section.day:first-of-type { margin-top: 38px; }
  .day-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
  .day-num { font-size: 2.6rem; font-weight: 700; color: var(--accent); line-height: 1; flex-shrink: 0; }
  h2 { font-size: 1.3rem; font-weight: 500; margin: 0; line-height: 1.2; }
  .day-sub { margin: 4px 0 18px 68px; color: var(--ink-soft); font-size: 0.92rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  thead th { text-align: left; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); font-weight: 600; padding: 0 10px 8px; border-bottom: 2px solid var(--ink); }
  tbody td { padding: 11px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tbody tr:nth-child(even) { background: var(--row-alt); }
  tbody tr.group td { background: var(--paper); padding: 18px 10px 6px; border-bottom: 1px solid var(--rule-strong); font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
  tbody tr.group td span { color: var(--ink-faint); margin-left: 8px; letter-spacing: 0.06em; }
  tbody tr.group-note td { background: var(--paper); padding-top: 4px; color: var(--ink-soft); font-size: 0.86rem; }
  td.ex { font-weight: 500; }
  td.ex a { display: inline-block; margin-left: 6px; padding: 0 5px; border: 1px solid currentColor; border-radius: 4px; font-size: 0.66rem; font-family: 'IBM Plex Mono', monospace; color: var(--accent); text-decoration: none; vertical-align: 1px; }
  td.ex a.search { color: var(--ink-faint); }
  td.sets, td.rest { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.notes { color: var(--ink-soft); }
  td.notes span { display: block; }
  th:nth-child(1), td:nth-child(1) { width: 28%; }
  th:nth-child(2), td:nth-child(2) { width: 16%; }
  th:nth-child(4), td:nth-child(4) { width: 12%; }
  .prog-block { margin-top: 22px; padding: 18px 20px; background: var(--teal-soft); border: 1px solid var(--teal); }
  .prog-block h3 { margin: 0 0 3px; font-size: 0.95rem; color: var(--teal); font-weight: 700; letter-spacing: 0.02em; }
  .prog-block p.lead { margin: 0 0 14px; font-size: 0.86rem; color: var(--ink-soft); }
  .prog-block table thead th { border-bottom-color: var(--teal); }
  .prog-block td { border-bottom-color: var(--teal-soft); }
  .prog-block th, .prog-block td { width: auto !important; }
  @media (max-width: 520px) { .day-sub { margin-left: 0; } .day-head { gap: 10px; } .day-num { font-size: 2rem; } }
  @media print { body { padding: 0; } section.day { break-inside: avoid-page; } }
`

function renderBlock(b: ExportBlock): string {
  return `
    <div class="prog-block">
      ${b.title ? `<h3>${esc(b.title)}</h3>` : ''}
      ${b.rule ? `<p class="lead">${esc(b.rule)}</p>` : ''}
      <div class="table-wrap"><table>
        <thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows
          .map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'sets' : 'notes'}">${esc(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>
      </table></div>
    </div>`
}

export function renderHtml(d: ExportDoc): string {
  const [hEx, hSets, hNotes, hRest] = d.columnHeaders
  const sessions = d.sessions
    .map(
      (s) => `
  <section class="day">
    <div class="day-head">
      <span class="day-num">${s.number}</span>
      <h2>${esc(s.title)}</h2>
    </div>
    ${s.focus ? `<p class="day-sub">${esc(s.focus)}</p>` : ''}
    <div class="table-wrap">
      <table>
        <thead><tr><th>${esc(hEx)}</th><th>${esc(hSets)}</th><th>${esc(hNotes)}</th><th>${esc(hRest)}</th></tr></thead>
        <tbody>${s.groups
          .map(
            (g) =>
              (g.title ? `<tr class="group"><td colspan="4">${esc(g.title)}${g.duration ? `<span>${esc(g.duration)}</span>` : ''}</td></tr>` : '') +
              (g.note ? `<tr class="group-note"><td colspan="4">${esc(g.note)}</td></tr>` : '') +
              g.rows
                .map(
                  (r) => `
          <tr>
            <td class="ex">${esc(r.name)}<a href="${esc(r.videoUrl)}" target="_blank" rel="noopener"${r.hasVideo ? '' : ' class="search"'}>▶</a></td>
            <td class="sets">${esc(r.prescription)}</td>
            <td class="notes">${r.notes.map((n) => `<span>${esc(n)}</span>`).join('')}</td>
            <td class="rest">${esc(r.rest)}</td>
          </tr>`,
                )
                .join(''),
          )
          .join('')}
        </tbody>
      </table>
    </div>
    ${s.blocks.map(renderBlock).join('')}
  </section>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="${d.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.documentTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<main>
  <header class="masthead">
    <p class="eyebrow">${esc(d.eyebrow)}</p>
    <h1>${esc(d.title)}</h1>
    ${
      d.stats.length
        ? `<dl class="stat-row">${d.stats
            .map((s) => `<div class="stat"><dt>${esc(s.label)}</dt><dd${s.numeric ? ' class="num"' : ''}>${esc(s.value)}</dd></div>`)
            .join('')}</dl>`
        : ''
    }
    ${d.noteParagraphs.length ? `<div class="personal-note">${d.noteParagraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    ${d.markers.length ? `<div class="markers"><h3>${esc(d.markersTitle)}</h3><ul>${d.markers.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    ${d.blockProgression ? renderBlock(d.blockProgression) : ''}
  </header>
  ${sessions}
</main>
</body>
</html>
`
}
