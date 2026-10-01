/*
 * Turns an uploaded file (client profile, old programme) into plain text.
 * Word/HTML/text are converted on the device; PDFs and photos are transcribed once by Claude.
 * Keeping attachments as text keeps chat history small enough for Firestore and cheap to resend.
 */
import { getClaude, MODEL_LIGHT, trackCost } from './client'

/** Largest file sent to Claude for transcription (the API allows 32 MB per request). */
const MAX_TRANSCRIBE_BYTES = 20 * 1024 * 1024

export const ACCEPTED_FILES = '.pdf,.docx,.html,.htm,.md,.txt,.csv,image/*'

/** HTML → text, keeping table rows readable as "cell | cell | cell". */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,head').forEach((n) => n.remove())
  doc.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.querySelectorAll('th,td')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
    tr.replaceWith(doc.createTextNode(`\n${cells.join(' | ')}\n`))
  })
  doc.querySelectorAll('br').forEach((n) => n.replaceWith(doc.createTextNode('\n')))
  doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,section,header').forEach((n) => n.append(doc.createTextNode('\n')))
  return (doc.body.textContent ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  // Chunked to avoid call-stack limits on large files.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

async function transcribe(file: File): Promise<string> {
  if (file.size > MAX_TRANSCRIBE_BYTES) throw new Error(`${file.name} is larger than 20 MB.`)
  const data = toBase64(await file.arrayBuffer())
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const imageType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const).find((t) => t === file.type)
  if (!isPdf && !imageType) throw new Error(`${file.name}: unsupported file type.`)
  const source = isPdf
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: imageType!, data } } as const)

  // Streamed so long documents get Haiku's full output allowance without an HTTP timeout.
  const stream = getClaude().messages.stream({
    model: MODEL_LIGHT,
    max_tokens: 64000,
    messages: [
      {
        role: 'user',
        content: [
          source,
          {
            type: 'text',
            text: 'Transcribe all text in this document faithfully, in its original language. Keep headings on their own lines and write each table row as "cell | cell | cell". Output only the transcription.',
          },
        ],
      },
    ],
  })
  const response = await stream.finalMessage()
  trackCost('import', response)
  if (response.stop_reason === 'refusal') throw new Error(`Claude could not read ${file.name}.`)
  // A cut-off transcription would silently drop the end of the programme.
  if (response.stop_reason === 'max_tokens') throw new Error(`${file.name} is too long to read in one go. Split it into smaller files.`)
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    // Loaded on demand: mammoth is only needed for Word files.
    const mammoth = await import('mammoth')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
    return htmlToText(value)
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) return htmlToText(await file.text())
  if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.csv') || file.type.startsWith('text/')) return (await file.text()).trim()
  return transcribe(file)
}
