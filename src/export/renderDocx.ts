/*
 * Editable Word export matching the HTML house style as closely as Word allows.
 * Fonts are ones every client already has (Arial Narrow for headings, Calibri for text), so the
 * document looks right on any PC or Mac without installing Oswald or IBM Plex.
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

const INK = '1B1D18'
const SOFT = '5B584E'
const FAINT = '857F70'
const ACCENT = 'C6491D'
const TEAL = '2B6358'
const RULE = 'D9D4C7'
const ROW_ALT = 'EFECE5'
const TEAL_WASH = 'EAF0EE'
const HEAD_FONT = 'Arial Narrow'
const BODY_FONT = 'Calibri'
const MONO_FONT = 'Consolas'

/** Word sizes are half-points. */
const pt = (n: number) => n * 2

/** Column widths in twentieths of a point for a 17 cm text block (≈ 9640 twips). */
const DAY_COLUMNS = [6440, 1900, 1300]

const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const line = (color: string, size = 4) => ({ style: BorderStyle.SINGLE, size, color })
const bottomOnly = (color: string, size = 4): ITableCellBorders => ({ top: none, left: none, right: none, bottom: line(color, size) })
const noBorders: ITableCellBorders = { top: none, left: none, right: none, bottom: none }

const label = (text: string, color = FAINT) =>
  new TextRun({ text: text.toUpperCase(), font: BODY_FONT, size: pt(7.5), bold: true, color, characterSpacing: 20 })

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
const text = (t: string, o: { color?: string; bold?: boolean; mono?: boolean; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: o.mono ? MONO_FONT : BODY_FONT, size: pt(o.size ?? 10), color: o.color ?? INK, bold: o.bold, italics: o.italics })

function blockTable(b: ExportBlock): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ spacing: { before: 240 } })]
  if (b.title) out.push(para([text(b.title, { color: TEAL, bold: true, size: 11 })], 40))
  if (b.rule) out.push(para([text(b.rule, { color: SOFT, size: 9.5 })], 120))
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: b.columns.map((c) => cell([para([label(c)])], { borders: bottomOnly(TEAL, 8), fill: TEAL_WASH })),
        }),
        ...b.rows.map(
          (r) =>
            new TableRow({
              children: r.map((c, i) => cell([para([text(c, { mono: i === 0, color: i === 0 ? INK : SOFT, size: 9.5 })])], { fill: TEAL_WASH })),
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
      children: [new TextRun({ text: d.title.toUpperCase(), font: HEAD_FONT, size: pt(24), bold: true, color: INK })],
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
              cell([para([label(s.label)], 60), para([text(s.value, { mono: s.numeric, size: s.numeric ? 11 : 10.5 })])], { borders: noBorders }),
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
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({ text: `${s.number}  `, font: HEAD_FONT, size: pt(26), bold: true, color: ACCENT }),
          new TextRun({ text: s.title.toUpperCase(), font: HEAD_FONT, size: pt(15), color: INK }),
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
    let stripe = false
    for (const g of s.groups) {
      if (g.title) {
        rows.push(
          new TableRow({
            children: [
              cell([para([label(g.title), ...(g.duration ? [new TextRun({ text: `   ${g.duration}`, font: BODY_FONT, size: pt(7.5), color: FAINT })] : [])])], {
                span: 3,
                borders: noBorders,
              }),
            ],
          }),
        )
      }
      if (g.note) rows.push(new TableRow({ children: [cell([para([text(g.note, { color: SOFT, size: 9.5 })])], { span: 3 })] }))
      for (const r of g.rows) {
        const fill = stripe ? ROW_ALT : undefined
        stripe = !stripe
        rows.push(
          new TableRow({
            children: [
              cell(
                [
                  para([
                    text(r.name, { bold: true, size: 10 }),
                    text('  '),
                    new ExternalHyperlink({ link: r.videoUrl, children: [new TextRun({ text: '▶ Video', font: BODY_FONT, size: pt(8), color: r.hasVideo ? ACCENT : FAINT, underline: {} })] }),
                  ]),
                  ...(r.cue ? [para([text(r.cue, { color: SOFT, size: 9 })])] : []),
                  ...(r.alternative ? [para([text(r.alternative, { color: FAINT, size: 8.5 })])] : []),
                ],
                { fill, width: DAY_COLUMNS[0] },
              ),
              cell([para([text(r.prescription, { mono: true, size: 9.5 })])], { fill, width: DAY_COLUMNS[1] }),
              cell([para([text(r.rest, { mono: true, size: 9.5 })])], { fill, width: DAY_COLUMNS[2] }),
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
    styles: { default: { document: { run: { font: BODY_FONT, size: pt(10), color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1130, right: 1130 } } },
        children: [...children, new Paragraph({ alignment: AlignmentType.LEFT })],
      },
    ],
  })
  return Packer.toBlob(doc)
}
