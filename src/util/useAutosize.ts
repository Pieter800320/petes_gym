/*
 * Makes a textarea as tall as its text where the browser can't do it itself. The stylesheet uses
 * `field-sizing: content` for that, which every current browser has had since mid-2026; an older
 * Safari or Firefox would keep such a box one row high and scroll inside it.
 */
import { useLayoutEffect, useRef } from 'react'

const GROWS_BY_ITSELF = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

/** Ref for a controlled textarea; pass the text it shows so the height follows it. */
export function useAutosize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (GROWS_BY_ITSELF || !el) return
    // Back to its natural height first, or the box could never get shorter again.
    el.style.height = 'auto'
    // scrollHeight leaves out the borders, which a border-box height has to include.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])
  return ref
}
