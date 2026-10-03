import { toast } from './toast'

/**
 * Shares a client's personal Fitness Profile link (data/invites.ts) through the phone's share sheet
 * (WhatsApp etc.). Where sharing isn't available (most desktop browsers), the message is copied instead.
 */
export async function shareProfileLink(link: string, firstName?: string) {
  const hello = firstName ? `Hi ${firstName}!` : 'Hi!'
  const text = `${hello} Please fill in this short fitness profile (about 7 minutes). It helps me design the right programme for you:`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Fitness Profile', text, url: link })
      return
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${link}`)
    toast('Link copied. Paste it into WhatsApp.')
  } catch {
    toast(link)
  }
}
