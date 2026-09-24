/**
 * App-wide polite live region (rendered once in app.vue). Use for status
 * messages that don't move focus: moves, adds/removes, result counts.
 * Errors keep using role="alert" next to the field.
 */
export function useLiveAnnouncer() {
  const message = useState<string>('a11yAnnouncement', () => '')

  function announce(text: string) {
    // Clear first so repeating the same text is announced again.
    message.value = ''
    setTimeout(() => {
      message.value = text
    }, 50)
  }

  return { message, announce }
}
