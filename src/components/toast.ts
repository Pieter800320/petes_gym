/** Show a short confirmation from anywhere: toast('Note saved'). Rendered by <Snackbar />. */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('pg:toast', { detail: message }))
}
