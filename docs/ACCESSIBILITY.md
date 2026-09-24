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

### Time tracking

- **Names, not ticking text:** the Start/Stop timer buttons (card, task panel, header) have an accessible name built from `formatDuration` (minute granularity: `"12 min"`, `"1 h 05 min"`) — idle is `Start timer for "<title>"`, running is `Stop timer for "<title>", <duration> tracked`. The live `formatClock` readout (`"12:34"`) next to the icon is always in an `aria-hidden="true"` span, so assistive tech never hears a name that changes every second.
- **Announcements, not live ticking:** starting, stopping, adding time and deleting an entry each announce once through `useLiveAnnouncer` (e.g. `Timer started for "…"`, `Timer stopped for "…", 12 min tracked`, `Added 15 min`, `Entry deleted`); starting a timer while another is running announces both the stop and the start in one message. The clock itself never triggers an announcement — only the plugin's discrete state changes do.
- **Discarded (under a minute) entries:** an entry that ends with a duration under `TIMER_MIN_ENTRY_SECONDS` (60 s) is discarded, not saved — stopping or switching away from such a timer announces `Timer stopped for "<title>" — under a minute, not recorded` instead of the usual "<duration> tracked" text (card, task panel, header); the discarded entry never appears once the entry list refreshes.
- **Stale-close notice:** if a running timer goes stale (computer asleep or browser closed for more than 10 minutes), `app/plugins/timer.client.ts` announces the notice text exactly once (`watch` on `store.timerNotice`) the moment it appears; the visible notice bar in `pages/index.vue` itself carries no live region, so it is never announced twice. If the stale entry itself ran under a minute, it is discarded and the notice text says so instead of giving a stop time.
- **Manual time entry validation:** the minutes field's out-of-range error uses `role="alert"` and `aria-describedby`, matching the existing error convention.
- **Add time popover, entries collapsible:** the task panel's quick-add buttons and minutes field live in a popover behind an "Add time" trigger; a successful add closes the popover and returns focus to that trigger. The entry list is closed by default behind an "Entries (n)" disclosure button (hidden when there are no entries), whose chevron rotation is skipped for `prefers-reduced-motion`.
- **Hydration:** the ticking clock reads a shared `useState('timerNow', …)` clock; the `aria-hidden` clock text itself is wrapped in `<ClientOnly>` in every place it appears (card, task panel, header) so a client/server time difference can never produce a hydration-mismatch warning.

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
  - timer started/stopped, time added or an entry deleted, and a stale timer's close notice (once)

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
