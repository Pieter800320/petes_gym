/*
 * Prints a Word document as HTML, tables included, so an old programme can be read and converted.
 *
 *   node docx.ts "<path to file.docx>"
 *
 * Uses the app's own Word reader (mammoth, from the repo's node_modules), as the app's importer does.
 */
import { readFileSync } from 'node:fs'
import mammoth from 'mammoth'

const [file] = process.argv.slice(2)
if (!file) throw new Error('Which file? node docx.ts "<path to file.docx>"')
const { value } = await mammoth.convertToHtml({ buffer: readFileSync(file) })
console.log(value)
