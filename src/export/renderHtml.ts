/*
 * Self-contained HTML export in Swiss Print, the app's own design: black ink on white, one red pen,
 * blue ink for progression tables, square corners, Schibsted Grotesk with tabular figures.
 * Structure: masthead, then per day a ruled table with section rows, video links and progression blocks.
 */
import type { ExportBlock, ExportDoc } from './exportModel'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STYLE = `
  :root {
    --paper: #FFFFFF; --ink: #111111; --ink-soft: #5A5A57; --ink-faint: #75756F;
    --rule: #D8D8D4; --accent: #E0241A; --blue: #1F4FA0; --blue-soft: #1F4FA014;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #121212; --ink: #F0F0EC; --ink-soft: #A5A5A0; --ink-faint: #8A8A85;
      --rule: #333333; --accent: #FF4A3D; --blue: #7FA8F0; --blue-soft: #7FA8F01f;
    }
  }
  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font-family: 'Schibsted Grotesk', 'Helvetica Neue', Arial, sans-serif; padding: clamp(20px, 5vw, 56px) 16px 64px; margin: 0; -webkit-font-smoothing: antialiased; }
  main { max-width: 780px; margin: 0 auto; }
  h1, h2 { text-wrap: balance; }
  header.masthead { border-bottom: 3px solid var(--ink); padding-bottom: 22px; margin-bottom: 28px; }
  .eyebrow { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin: 0 0 10px; }
  h1 { font-size: clamp(2rem, 5.4vw, 3rem); font-weight: 800; letter-spacing: -0.035em; margin: 0 0 20px; line-height: 1.02; }
  .stat-row { display: flex; flex-wrap: wrap; gap: 18px 40px; margin: 0; }
  .stat { border-top: 2px solid var(--ink); padding-top: 8px; min-width: 7rem; }
  .stat dt { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); font-weight: 700; margin-bottom: 4px; }
  .stat dd { margin: 0; font-size: 1rem; max-width: 46ch; line-height: 1.4; }
  .stat dd.num { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .personal-note { margin-top: 24px; }
  .personal-note p { margin: 0 0 12px; font-size: 0.97rem; line-height: 1.55; max-width: 62ch; }
  .personal-note p:last-child { margin-bottom: 0; }
  .markers { margin-top: 24px; }
  .markers h3 { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 6px; font-weight: 700; }
  .markers ul { margin: 0; padding-left: 1.2em; font-size: 0.97rem; line-height: 1.55; }
  section.day { margin-top: 48px; padding-top: 14px; border-top: 3px solid var(--ink); }
  section.day:first-of-type { margin-top: 36px; padding-top: 0; border-top: 0; } /* the masthead rule already sits above day 1 */
  .day-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
  .day-num { font-size: 2.8rem; font-weight: 800; letter-spacing: -0.04em; color: var(--accent); line-height: 1; flex-shrink: 0; }
  h2 { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; margin: 0; line-height: 1.15; }
  .day-sub { margin: 4px 0 18px; color: var(--ink-soft); font-size: 0.95rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  thead th { text-align: left; font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint); font-weight: 700; padding: 0 10px 8px 0; border-bottom: 2px solid var(--ink); }
  tbody td { padding: 12px 10px 12px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tbody tr.group td { padding: 22px 10px 6px 0; border-bottom: 1px solid var(--ink); font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink); font-weight: 700; }
  tbody tr.group td span { color: var(--ink-faint); margin-left: 10px; font-weight: 500; }
  tbody tr.group-note td { padding-top: 6px; color: var(--ink-soft); font-size: 0.88rem; }
  td.ex { font-weight: 600; }
  td.ex .video { display: block; margin: 4px 0 2px; line-height: 1; }
  td.ex a { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); text-decoration: none; }
  td.ex a.search { color: var(--ink-faint); }
  td.sets, td.rest { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; } /* tabular figures on numbers only: this face also widens punctuation */
  td.notes { color: var(--ink-soft); }
  td.ex .cue { display: block; margin-top: 3px; font-weight: 400; font-size: 0.88rem; color: var(--ink-soft); }
  td.ex .alt { display: block; font-weight: 400; font-size: 0.8rem; color: var(--ink-faint); }
  table.day-table td.sets, table.day-table td.rest, table.day-table th:nth-child(2), table.day-table th:nth-child(3) { width: 1%; white-space: nowrap; padding-left: 14px; }
  .prog-block { margin-top: 24px; padding: 16px 18px; background: var(--blue-soft); border-top: 3px solid var(--blue); }
  .prog-block h3 { margin: 0 0 3px; font-size: 1rem; color: var(--blue); font-weight: 800; letter-spacing: -0.01em; }
  .prog-block p.lead { margin: 0 0 14px; font-size: 0.88rem; color: var(--ink-soft); }
  .prog-block table thead th { border-bottom-color: var(--blue); }
  .prog-block td { border-bottom-color: var(--rule); }
  .prog-block th, .prog-block td { width: auto !important; }
  @media (max-width: 520px) { .day-head { gap: 10px; } .day-num { font-size: 2.2rem; } }
  @media print { body { padding: 0; } section.day { break-inside: avoid-page; } .prog-block { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
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
  const [hEx, hSets, hRest] = d.columnHeaders
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
      <table class="day-table">
        <thead><tr><th>${esc(hEx)}</th><th>${esc(hSets)}</th><th>${esc(hRest)}</th></tr></thead>
        <tbody>${s.groups
          .map(
            (g) =>
              (g.title ? `<tr class="group"><td colspan="3">${esc(g.title)}${g.duration ? `<span>${esc(g.duration)}</span>` : ''}</td></tr>` : '') +
              (g.note ? `<tr class="group-note"><td colspan="3">${esc(g.note)}</td></tr>` : '') +
              g.rows
                .map(
                  (r) => `
          <tr>
            <td class="ex">${esc(r.name)}<span class="video"><a href="${esc(r.videoUrl)}" target="_blank" rel="noopener"${r.hasVideo ? '' : ' class="search"'}>▶ Video</a></span>${r.cue ? `<span class="cue">${esc(r.cue)}</span>` : ''}${r.alternative ? `<span class="alt">${esc(r.alternative)}</span>` : ''}</td>
            <td class="sets">${esc(r.prescription)}</td>
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap">
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
