/* Hands a generated file to the OS share sheet (WhatsApp, email, Drive) or downloads it. */

export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  // Android Chrome shares HTML files; some browsers refuse .docx, so check before trying.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'cancelled'
      // Any other share failure: fall through to a download.
    }
  }
  download(file)
  return 'downloaded'
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

/**
 * Opens a blank tab right away, while the tap still counts as the user's action (browsers block
 * tabs opened after an await), and returns a function that shows the file in it once built.
 */
export function reserveTab(): { show: (file: File) => void; close: () => void } {
  const tab = window.open('', '_blank')
  return {
    show(file) {
      const url = URL.createObjectURL(file)
      if (tab && !tab.closed) tab.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    close() {
      tab?.close()
    },
  }
}
