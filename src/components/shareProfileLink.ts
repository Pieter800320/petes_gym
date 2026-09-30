import { toast } from './toast'
import { FITNESS_PROFILE_URL } from '../config'

/**
 * Shares the Fitness Profile questionnaire link through the phone's share sheet (WhatsApp etc.).
 * Where sharing isn't available (most desktop browsers), the message is copied instead.
 */
export async function shareProfileLink(firstName?: string) {
  const hello = firstName ? `Hi ${firstName}!` : 'Hi!'
  const text = `${hello} Please fill in this short fitness profile (about 7 minutes). It helps me design the right programme for you:`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Fitness Profile', text, url: FITNESS_PROFILE_URL })
      return
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${FITNESS_PROFILE_URL}`)
    toast('Link copied. Paste it into WhatsApp.')
  } catch {
    toast(FITNESS_PROFILE_URL)
  }
}
