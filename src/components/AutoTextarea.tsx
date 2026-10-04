import type { TextareaHTMLAttributes } from 'react'
import { useAutosize } from '../util/useAutosize'

/** A textarea that grows with its text in every browser (see useAutosize). Use it wherever the stylesheet sets `field-sizing: content`. */
export function AutoTextarea({ value, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string }) {
  const ref = useAutosize(value)
  return <textarea ref={ref} value={value} {...rest} />
}
