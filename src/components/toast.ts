/** One button at the end of a toast, e.g. Undo. */
export interface ToastAction {
  label: string
  run: () => void
}

/** What a 'pg:toast' or 'pg:error' event carries: the text alone, or the text with an action. */
export type ToastDetail = string | { text: string; action?: ToastAction }

/** Show a short confirmation from anywhere: toast('Note saved'). Rendered by <Snackbar />. With an action it stays longer. */
export function toast(message: string, action?: ToastAction) {
  window.dispatchEvent(new CustomEvent<ToastDetail>('pg:toast', { detail: action ? { text: message, action } : message }))
}
