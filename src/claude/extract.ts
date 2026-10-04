/*
 * Turns an uploaded file (client profile, old programme) into plain text.
 * Word/HTML/text are converted on the device; PDFs and photos are transcribed once by Claude.
 * Keeping attachments as text keeps chat history small enough for Firestore and cheap to resend.
 */
import { getClaude, MODEL_LIGHT, trackCost } from './client'

/** Largest PDF sent to Claude for transcription (the API allows 32 MB per request). */
const MAX_TRANSCRIBE_BYTES = 20 * 1024 * 1024
/**
 * Longest edge of a photo sent to Claude. The light model looks at no more than 1568 px (Anthropic's
 * vision docs, standard tier, read 2026-10-04); anything bigger is only a slower upload.
 */
const MAX_IMAGE_EDGE = 1568
/** The API's limit for one image, measured on its base64 text (same docs: 10 MB on the Claude API). */
const MAX_IMAGE_BASE64_CHARS = 10 * 1024 * 1024
/** JPEG qualities tried in turn until the photo fits. */
const JPEG_QUALITIES = [0.85, 0.7, 0.55]

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

function isImage(file: File): boolean {
  // Phones often give HEIC photos no type at all, so the file name counts too.
  return file.type.startsWith('image/') || /.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
}

/** The scaled photo as a JPEG. OffscreenCanvas where the browser has it, else a canvas element. */
async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', quality))
}

/**
 * A photo as Claude should get it: scaled down to MAX_IMAGE_EDGE (never up) and saved as JPEG.
 * A phone photo of 5–12 MB becomes a few hundred KB, which is as much as the model reads anyway.
 */
async function prepareImage(file: File): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // HEIC outside Safari, or a damaged file.
    throw new Error(`${file.name}: this photo format can't be read here. Save it as JPEG and try again.`)
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    for (const quality of JPEG_QUALITIES) {
      const data = toBase64(await (await encodeJpeg(bitmap, width, height, quality)).arrayBuffer())
      if (data.length <= MAX_IMAGE_BASE64_CHARS) return { data, mediaType: 'image/jpeg' }
    }
    throw new Error(`${file.name} is too large to send, even made smaller.`)
  } finally {
    bitmap.close()
  }
}

async function transcribe(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf && !isImage(file)) throw new Error(`${file.name}: unsupported file type.`)
  if (isPdf && file.size > MAX_TRANSCRIBE_BYTES) throw new Error(`${file.name} is larger than 20 MB.`)
  let source
  if (isPdf) {
    source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(await file.arrayBuffer()) } } as const
  } else {
    const image = await prepareImage(file)
    source = { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } } as const
  }

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
