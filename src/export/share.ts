/* Hands a generated file to the OS share sheet (WhatsApp, email, Drive) or downloads it. */

/**
 * Must be called straight from a tap, with nothing awaited before it: the browser only opens the
 * share sheet in answer to a tap, and refuses (NotAllowedError) once that tap is a moment old.
 * download-fallback: sharing is supported but was refused, so the file was saved instead.
 */
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'download-fallback' | 'cancelled'> {
  let refused = false
  // Android Chrome shares HTML files; some browsers refuse .docx, so check before trying.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'cancelled'
      refused = (err as DOMException).name === 'NotAllowedError'
      // Any other share failure: fall through to a download.
    }
  }
  download(file)
  return refused ? 'download-fallback' : 'downloaded'
}

export function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
