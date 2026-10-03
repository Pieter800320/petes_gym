/*
 * Schibsted Grotesk, built into the exported page itself (as data: URLs), so the programme looks
 * the same with no internet and nothing is fetched from Google when a client opens it.
 * Only the four weights the export uses. The extended set (ł, č, ş, ő …) is added only when the
 * text needs it: it would otherwise cost every export another ~60 KB.
 */
import latin400 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-400-normal.woff2?inline'
import latin600 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-600-normal.woff2?inline'
import latin700 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-700-normal.woff2?inline'
import latin800 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-800-normal.woff2?inline'
import ext400 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-ext-400-normal.woff2?inline'
import ext600 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-ext-600-normal.woff2?inline'
import ext700 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-ext-700-normal.woff2?inline'
import ext800 from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-ext-800-normal.woff2?inline'

/** Which characters each file covers (the font's own subset definitions). */
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const EXT_RANGE = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'
/** Letters outside the basic set: Central European, Turkish, Vietnamese and similar. */
const NEEDS_EXT = /[Ā-ɏḀ-ỿ]/

const LATIN: [number, string][] = [[400, latin400], [600, latin600], [700, latin700], [800, latin800]]
const EXT: [number, string][] = [[400, ext400], [600, ext600], [700, ext700], [800, ext800]]

const face = (weight: number, dataUrl: string, range: string) =>
  `@font-face { font-family: 'Schibsted Grotesk'; font-style: normal; font-weight: ${weight}; font-display: block; src: url(${dataUrl}) format('woff2'); unicode-range: ${range}; }`

/** The @font-face rules for a document containing `text`. */
export function embeddedFontCss(text: string): string {
  const faces = LATIN.map(([w, url]) => face(w, url, LATIN_RANGE))
  if (NEEDS_EXT.test(text)) faces.push(...EXT.map(([w, url]) => face(w, url, EXT_RANGE)))
  return faces.join('\n')
}
