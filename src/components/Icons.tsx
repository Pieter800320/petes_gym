/* Stroke icons, 24px grid, inherit currentColor. */
import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconBack = () => (
  <svg {...base}><path d="M15 18l-6-6 6-6" /></svg>
)
export const IconPin = () => (
  <svg {...base}><path d="M9 4h6l-1 5 4 4H6l4-4zM12 13v7" /></svg>
)
export const IconSearch = () => (
  <svg {...base}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
)
export const IconSend = () => (
  <svg {...base}><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></svg>
)
export const IconAttach = () => (
  <svg {...base}><path d="M20.5 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" /></svg>
)
export const IconPen = () => (
  <svg {...base} strokeWidth={1.8}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
)
export const IconChevronRight = () => (
  <svg {...base} strokeWidth={1.8}><path d="M9 18l6-6-6-6" /></svg>
)
export const IconMore = () => (
  <svg {...base} strokeWidth={2.2}><circle cx="5" cy="12" r="0.8" /><circle cx="12" cy="12" r="0.8" /><circle cx="19" cy="12" r="0.8" /></svg>
)
