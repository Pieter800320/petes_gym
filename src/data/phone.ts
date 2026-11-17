/** Country code for a number written the national way, with a leading 0 (Pete's clients are in Germany). */
export const DEFAULT_COUNTRY = '49'

/**
 * A client's mobile number as WhatsApp wants it: country code and number, digits only
 * ("+49 151 2345 6789" → "4915123456789"). A number starting with a single 0 is read as German,
 * "00" as an international prefix, and "(0)" after a country code is dropped. Null when it can't
 * be read as a phone number (letters, no country code and no leading 0, too short or too long):
 * the link is then shared the usual way.
 */
export function whatsappNumber(mobile: string | undefined): string | null {
  const raw = (mobile ?? '').trim().replace(/\(0\)/g, '')
  if (!raw || /[^\d+\s\-()./]/.test(raw)) return null
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.lastIndexOf('+') > 0) return null
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = DEFAULT_COUNTRY + digits.slice(1)
  else return null
  // E.164: at most 15 digits, no leading 0; 8 is the shortest real mobile number with its country code.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

/** Opens a WhatsApp chat with this number, the message already typed (the app on a phone, WhatsApp Web on a PC). */
export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
