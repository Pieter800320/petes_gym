/*
 * Editable Word export in Swiss Print, matching the HTML as closely as Word allows.
 * Arial throughout: every PC and Mac has it, so the document looks right without installing
 * Schibsted Grotesk, and a plain grotesque is what the Swiss style is built on.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ITableCellBorders,
} from 'docx'
import type { ExportBlock, ExportDoc } from './exportModel'

const INK = '111111'
const SOFT = '5A5A57'
const FAINT = '75756F'
const ACCENT = 'E0241A'
const BLUE = '1F4FA0'
const RULE = 'D8D8D4'
const BLUE_WASH = 'EDF1F8'
const FONT = 'Arial'

/** Word sizes are half-points. */
const pt = (n: number) => n * 2

/** Column widths in twentieths of a point for a 17 cm text block (≈ 9640 twips). */
const DAY_COLUMNS = [6440, 1900, 1300]

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const line = (color: string, size = 4) => ({ style: BorderStyle.SINGLE, size, color })
const bottomOnly = (color: string, size = 4): ITableCellBorders => ({ top: none, left: none, right: none, bottom: line(color, size) })

const label = (text: string, color = FAINT) =>
  new TextRun({ text: text.toUpperCase(), font: FONT, size: pt(7.5), bold: true, color, characterSpacing: 10 })

function cell(children: Paragraph[], opts: { borders?: ITableCellBorders; fill?: string; width?: number; span?: number } = {}) {
  return new TableCell({
    children,
    columnSpan: opts.span,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: opts.borders ?? bottomOnly(RULE),
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  })
}

const para = (runs: (TextRun | ExternalHyperlink)[], spacingAfter = 0) => new Paragraph({ children: runs, spacing: { after: spacingAfter } })
const text = (t: string, o: { color?: string; bold?: boolean; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, size: pt(o.size ?? 10), color: o.color ?? INK, bold: o.bold, italics: o.italics })

function blockTable(b: ExportBlock): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ spacing: { before: 240 } })]
  if (b.title) out.push(para([text(b.title, { color: BLUE, bold: true, size: 11 })], 40))
  if (b.rule) out.push(para([text(b.rule, { color: SOFT, size: 9.5 })], 120))
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: b.columns.map((c) => cell([para([label(c)])], { borders: { top: line(BLUE, 18), left: none, right: none, bottom: line(BLUE, 8) }, fill: BLUE_WASH })),
        }),
        ...b.rows.map(
          (r) =>
            new TableRow({
              children: r.map((c, i) => cell([para([text(c, { bold: i === 0, color: i === 0 ? INK : SOFT, size: 9.5 })])], { fill: BLUE_WASH })),
            }),
        ),
      ],
    }),
  )
  return out
}

export async function renderDocx(d: ExportDoc): Promise<Blob> {
  const children: (Paragraph | Table)[] = []

  // ── Masthead ──
  children.push(para([label(d.eyebrow, ACCENT)], 120))
  children.push(
    new Paragraph({
      children: [new TextRun({ text: d.title, font: FONT, size: pt(26), bold: true, color: INK, characterSpacing: -10 })],
      spacing: { after: 240 },
    }),
  )
  if (d.stats.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: d.stats.map((s) =>
              cell([para([label(s.label)], 60), para([text(s.value, { bold: s.numeric, size: s.numeric ? 12 : 10.5 })])], { borders: { top: line(INK, 12), left: none, right: none, bottom: none } }),
            ),
          }),
        ],
      }),
    )
  }
  for (const p of d.noteParagraphs) children.push(new Paragraph({ children: [text(p, { size: 10.5 })], spacing: { before: 160, line: 300 } }))
  if (d.markers.length) {
    children.push(new Paragraph({ children: [label(d.markersTitle)], spacing: { before: 240, after: 60 } }))
    for (const m of d.markers) children.push(new Paragraph({ children: [text(m, { size: 10.5 })], bullet: { level: 0 } }))
  }
  if (d.blockProgression) children.push(...blockTable(d.blockProgression))
  // Thick rule under the masthead, like the HTML.
  children.push(new Paragraph({ border: { bottom: line(INK, 18) }, spacing: { before: 200, after: 200 } }))

  // ── Sessions ──
  d.sessions.forEach((s, index) => {
    children.push(
      new Paragraph({
        pageBreakBefore: index > 0,
        // Each later day opens its page under a thick rule; day 1 already sits under the masthead rule.
        border: index > 0 ? { top: line(INK, 18) } : undefined,
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({ text: `${s.number}  `, font: FONT, size: pt(26), bold: true, color: ACCENT, characterSpacing: -10 }),
          new TextRun({ text: s.title, font: FONT, size: pt(16), bold: true, color: INK, characterSpacing: -6 }),
        ],
      }),
    )
    if (s.focus) children.push(para([text(s.focus, { color: SOFT, size: 10 })], 200))

    const [hEx, hSets, hRest] = d.columnHeaders
    const rows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [hEx, hSets, hRest].map((h, i) => cell([para([label(h)])], { borders: bottomOnly(INK, 12), width: DAY_COLUMNS[i] })),
      }),
    ]
    for (const g of s.groups) {
      if (g.title) {
        rows.push(
          new TableRow({
            children: [
              cell([para([label(g.title, INK), ...(g.duration ? [new TextRun({ text: `   ${g.duration}`, font: FONT, size: pt(7.5), color: FAINT })] : [])])], {
                span: 3,
                borders: bottomOnly(INK, 8),
              }),
            ],
          }),
        )
      }
      if (g.note) rows.push(new TableRow({ children: [cell([para([text(g.note, { color: SOFT, size: 9.5 })])], { span: 3 })] }))
      for (const r of g.rows) {
        rows.push(
          new TableRow({
            children: [
              cell(
                [
                  para([text(r.name, { bold: true, size: 10 })]),
                  // Own line under the name, so every exercise has the link in the same place.
                  para([new ExternalHyperlink({ link: r.videoUrl, children: [new TextRun({ text: '▶ VIDEO', font: FONT, size: pt(7.5), bold: true, color: r.hasVideo ? ACCENT : FAINT })] })]),
                  ...(r.cue ? [para([text(r.cue, { color: SOFT, size: 9 })])] : []),
                  ...(r.alternative ? [para([text(r.alternative, { color: FAINT, size: 8.5 })])] : []),
                ],
                { width: DAY_COLUMNS[0] },
              ),
              cell([para([text(r.prescription, { bold: true, size: 9.5 })])], { width: DAY_COLUMNS[1] }),
              cell([para([text(r.rest, { bold: true, size: 9.5 })])], { width: DAY_COLUMNS[2] }),
            ],
          }),
        )
      }
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: DAY_COLUMNS, rows }))
    for (const b of s.blocks) children.push(...blockTable(b))
  })

  const doc = new Document({
    creator: "Pete's Gym",
    title: d.documentTitle,
    styles: { default: { document: { run: { font: FONT, size: pt(10), color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1130, right: 1130 } } },
        children: [...children, new Paragraph({ alignment: AlignmentType.LEFT })],
      },
    ],
  })
  return Packer.toBlob(doc)
}
