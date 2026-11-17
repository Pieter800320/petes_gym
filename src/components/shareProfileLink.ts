import { toast } from './toast'
import { whatsappUrl } from '../data/phone'

/**
 * Shares a client's personal Fitness Profile link (data/invites.ts). With the client's WhatsApp
 * number (whatsappNumber in data/phone.ts) it opens a chat with them, the message already typed,
 * so they need not be a contact on Pete's phone. Otherwise through the phone's share sheet
 * (WhatsApp etc.); where sharing isn't available (most desktop browsers), the message is copied.
 */
export async function shareProfileLink(link: string, firstName?: string, whatsapp?: string | null) {
  const hello = firstName ? `Hi ${firstName}!` : 'Hi!'
  const text = `${hello} Please fill in this short fitness profile (about 5 minutes, in English or German). It helps me design the right programme for you:`
  if (whatsapp) {
    // Straight from the tap: the browser opens it only with a fresh tap, like the share sheet.
    window.open(whatsappUrl(whatsapp, `${text} ${link}`), '_blank', 'noopener')
    return
  }
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
