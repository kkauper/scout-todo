# Accessibility

Scout targets **WCAG 2.2 Level AA**. This page states what that covers, how it is built, and how far it has been verified.

## Status

| | |
|---|---|
| Target | WCAG 2.2 AA |
| Code audit | Done (September 2026): board, task panel and forms, global and visual. All confirmed failures fixed. |
| Automated checks | Contrast ratios computed from the theme tokens (see [THEMING.md](THEMING.md#accessibility-tokens)) |
| Assistive-technology testing | **Not yet done.** See [Testing checklist](#testing-checklist) |

This isn't a formal conformance claim until the manual test pass below is complete.

## How it works

### Keyboard

- Every action works without a mouse, including moving tasks, which otherwise needs drag and drop.
- **Move a task:** focus a card title, then
  - <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> moves it within its column
  - <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> moves it to the previous or next column

  Focus stays on the moved card and the new position is announced. The same moves are in the card's menu ("Move up", "Move down", "Move to…") and in the task panel's column select.
- **Search:** <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd> opens it. <kbd>↑</kbd>/<kbd>↓</kbd> choose a result, <kbd>Enter</kbd> opens it, <kbd>Esc</kbd> closes the search.
- **Skip link:** the first <kbd>Tab</kbd> on the board page shows "Skip to board".
- **Columns:** each column's menu moves it left or right, hides it or deletes it.

### Focus

- Opening a task moves focus to the panel heading. Closing it (<kbd>Esc</kbd> or ×) returns focus to the card.
- On phones the task panel is a modal dialog, and the board and header behind it are `inert`.
- On desktop the panel doesn't block the board. While it's open, the board scroller gets `scroll-padding-inline-end`, so a focused card is never hidden under the panel (SC 2.4.11).
- Focus outlines still show in Windows High Contrast (`forced-colors`), where Tailwind's `box-shadow` rings disappear.

### Screen readers

- **Cards:** each card title is a `<button>` whose description reads out the column, due date or overdue state, what blocks it, its size, checklist progress and the move shortcut.
- **Live region:** one polite region (`useLiveAnnouncer`) announces status changes that don't move focus:
  - task moves
  - links added or removed
  - checklist changes
  - search result counts
  - AI progress
  - a successful password change
  - a task deleted in another tab

  Errors use `role="alert"` next to the field and are linked to it with `aria-invalid` and `aria-describedby`.
- **Landmarks:** each column is a `<section>` named by its heading. The mobile column switcher is a `<nav>`, not a tablist, because all columns stay rendered and visible.
- **Picker names:** each picker's accessible name contains its visible text, e.g. "Deadline: No deadline" (SC 2.5.3).
- **KPI charts:** every bar and segment has a text alternative.

### Visual

- **Colour is never the only signal.** Column type, blocked, overdue, size and project/tag all come with an icon or text.
- **Contrast**, measured from the actual tokens in both themes:

  | Element | Contrast | Required |
  |---|---|---|
  | Error text | ≥ 4.7:1 | 4.5:1 |
  | Input borders | ≥ 3.2:1 | 3:1 |
  | KPI bar segments | ≥ 3.5:1 | 3:1 |

- **Touch and click targets** are at least 24×24 px.
- **Text spacing:** badges grow with text instead of clipping it (SC 1.4.12).
- **Motion:** `prefers-reduced-motion` turns off animations, drag tweening and smooth scrolling.
- **Language and zoom:** `<html lang="en">` is set, and pinch zoom isn't blocked.

## Known limitations

- The search and picker comboboxes (reka-ui `Listbox`) use `aria-activedescendant` but not the full ARIA 1.2 combobox pattern (`role="combobox"`, `aria-expanded`). How much that matters depends on the screen reader.
- On touch devices, reordering by drag needs a 250 ms long press, and nothing on screen hints at it. The card menu and panel column select are the alternatives.
- Decorative borders (`--border`) stay below 3:1 on purpose. Every control that needs a visible boundary uses `--input`.

## Testing checklist

- [ ] VoiceOver + Safari (macOS, iOS): sign in, search, open/edit a task, move a task by keyboard, add a link, convert a sub-todo
- [ ] NVDA + Firefox or Chrome: same flows
- [ ] Keyboard only, no mouse: all flows, visible focus throughout
- [ ] Windows High Contrast mode
- [ ] 200% and 400% zoom; 320 px wide viewport
- [ ] Text-spacing bookmarklet (SC 1.4.12)
- [ ] axe DevTools scan of board, panel, dialogs, login

Record the results and dates here once done.
