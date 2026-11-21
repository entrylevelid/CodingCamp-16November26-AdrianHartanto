# Implementation Plan: todo-life-dashboard

## Overview

Implement a zero-dependency, single-page personal dashboard as three static files (`index.html`, `css/style.css`, `js/app.js`). All logic lives in vanilla JavaScript organized into namespaced controller objects. State persists entirely in `localStorage`. The page must work in Chrome, Firefox, Edge, and Safari at viewport widths from 320 px to 2560 px.

## Tasks

- [x] 1. Scaffold project structure and StorageService
  - [x] 1.1 Create the file layout: `index.html`, `css/style.css`, `js/app.js`
    - Create the three files with the directory structure defined in the design
    - `index.html` links to `css/style.css` and `js/app.js`
    - `app.js` runs on `DOMContentLoaded`
    - _Requirements: 7.5_
  - [x] 1.2 Implement `StorageService` with `get`, `set`, and `remove` methods
    - Wrap every `localStorage` write in `try/catch`; log `console.warn` on failure
    - Wrap `JSON.parse` in `try/catch` in `get`; return `null` on parse error
    - Use the `tld_` key-prefix convention for all five storage keys
    - Show one-time non-blocking banner if every write fails
    - _Requirements: 7.3_
  - [x] 1.3 Write property tests for StorageService round-trip
    - **Property 9: Task list persistence round-trip** — `load(save(arr))` deep-equals `arr`
    - **Property 11: Link list persistence round-trip** — `load(save(arr))` deep-equals `arr`
    - **Validates: Requirements 4.11, 4.12, 5.7**

- [x] 2. Implement ThemeController
  - [x] 2.1 Implement `ThemeController` with init and toggle behavior
    - On init: read `tld_theme` (default `"light"`); set `data-theme` attribute on `<html>` before any widget renders
    - On toggle: flip theme, persist via `StorageService`, apply within 100 ms
    - Add toggle button to `index.html` in a fixed-position container
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 2.2 Add CSS custom properties for light and dark themes to `style.css`
    - Define color tokens using CSS custom properties under `:root` and `[data-theme="dark"]`
    - Ensure theme applies to all four widget areas
    - _Requirements: 6.2, 6.4_
  - [x] 2.3 Write property test for theme toggle involution
    - **Property 12: Theme toggle is an involution** — two toggles return to original theme and persist final value
    - **Validates: Requirements 6.2, 6.3**

- [x] 3. Checkpoint — StorageService and ThemeController
  - Ensure unit tests for StorageService pass. Verify theme applies before widget render (no flash of wrong theme). Ask the user if questions arise.

- [x] 4. Implement GreetingController
  - [x] 4.1 Add Greeting_Widget markup to `index.html` and implement `GreetingController`
    - Markup: time display, date display, greeting display, name input (max 50 chars), submit button
    - On init: load `tld_userName`, pre-populate input, render greeting and date; start `setInterval` updating time display only when wall-clock minute changes
    - Greeting prefix logic keyed on local hour (05–11, 12–17, 18–20, 21–23 / 00–04)
    - Date format: full weekday name, full month name, day number — no year
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.6_
  - [x] 4.2 Implement name submit handler
    - Trim value; if non-empty: `StorageService.set("tld_userName", value)`; if empty/whitespace: `StorageService.remove("tld_userName")`
    - Re-render greeting within 500 ms, no page reload
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_
  - [x] 4.3 Write property test for greeting prefix coverage
    - **Property 1: Greeting prefix covers all 24 hours without gaps or overlaps** — `fc.integer({ min: 0, max: 23 })`, assert result ∈ four prefix strings
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
  - [x] 4.4 Write property test for whitespace name rejection
    - **Property 2: Whitespace-only names are rejected** — `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))`, assert no `tld_userName` key stored and greeting has no name suffix
    - **Validates: Requirements 2.5, 2.7**
  - [x] 4.5 Write property test for name round-trip
    - **Property 3: Name round-trip** — valid name saved → page reload → input pre-populated and greeting displays it
    - **Validates: Requirements 2.2, 2.6**

- [x] 5. Implement TimerController
  - [x] 5.1 Add Timer_Widget markup to `index.html` and implement `TimerController`
    - Markup: MM:SS display, Start button, Stop button, Reset button, duration `<input type="number" min="1" max="99">`
    - State: `{ status: "reset"|"running"|"paused", remaining, sessionDuration, intervalId }`
    - On init: load `tld_sessionDuration` (default 25), set `remaining = sessionDuration * 60`, render
    - Start: `setInterval` decrement by 1 s; Stop: `clearInterval`; Reset: restore full duration
    - Button enabled/disabled per state machine rules
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9_
  - [x] 5.2 Implement countdown-to-zero alert and duration-change handling
    - On `remaining === 0`: auto-stop; play 1–3 s tone via `AudioContext` (wrap in `try/catch`)
    - Duration change while not running: persist and reset immediately
    - Duration change while running: store pending value; apply only on next Reset
    - Clamp out-of-range values: `Math.max(1, Math.min(99, value))`
    - _Requirements: 3.6, 3.10, 3.11, 3.12, 3.13, 3.14_
  - [x] 5.3 Write property test for session duration persistence
    - **Property 13: Session duration persists across reloads** — `fc.integer({ min: 1, max: 99 })`, save D → reload → `timer.remaining === D * 60`
    - **Validates: Requirements 3.10, 3.11, 3.14**

- [x] 6. Checkpoint — GreetingController and TimerController
  - Ensure all property tests and unit tests for greeting prefix and timer state machine pass. Ask the user if questions arise.

- [x] 7. Implement TodoController
  - [x] 7.1 Add Todo_Widget markup to `index.html` and implement `TodoController` init and render
    - Markup: list container, task text input (max 500 chars), Add button
    - On init: load `tld_todos`, render list (task description, complete-toggle, edit button, delete button)
    - Re-render clears and rebuilds list from in-memory `tasks` array
    - Display completed tasks with `.completed` CSS class (strikethrough)
    - _Requirements: 4.1, 4.10, 4.11_
  - [x] 7.2 Implement Add, Toggle, and Delete task handlers
    - Add: validate non-empty after trim; push `{ id: crypto.randomUUID(), description, completed: false }`; persist; re-render; show inline validation message on empty submit
    - Toggle: flip `completed`; persist; re-render
    - Delete: splice by id; persist; re-render
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.12_
  - [x] 7.3 Implement Edit, Save, and Cancel handlers for tasks
    - Edit start: replace display span with inline `<input>` pre-populated with current description
    - Edit save: validate non-empty; update description; persist; re-render; show inline validation message on empty submit
    - Edit cancel: re-render (discard in-flight DOM changes, no persistence write)
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.12_
  - [x] 7.4 Write property test for task addition grows the list
    - **Property 4: Task addition grows the list** — `fc.array(taskArb), fc.string({ minLength: 1, maxLength: 500 })`, assert count +1 and localStorage updated
    - **Validates: Requirements 4.2, 4.12**
  - [x] 7.5 Write property test for whitespace task rejection
    - **Property 5: Whitespace-only task descriptions are rejected** — whitespace string input, list unchanged, validation message shown
    - **Validates: Requirements 4.3**
  - [x] 7.6 Write property test for task toggle idempotence
    - **Property 6: Task toggle is idempotent across two flips** — two toggles restore original `completed` state and persist
    - **Validates: Requirements 4.4**
  - [x] 7.7 Write property test for task deletion
    - **Property 7: Task deletion removes exactly that task** — deleted task absent; all others present in original order; localStorage updated
    - **Validates: Requirements 4.5, 4.12**
  - [x] 7.8 Write property test for task edit round-trip
    - **Property 8: Task edit round-trip preserves description** — description updated; `id` and `completed` unchanged; localStorage updated
    - **Validates: Requirements 4.7, 4.12**

- [x] 8. Implement LinksController
  - [x] 8.1 Add Links_Widget markup to `index.html` and implement `LinksController` init and render
    - Markup: list container, label input, URL input, Add button
    - On init: load `tld_links`, render list (clickable button per link with delete control)
    - Link button opens URL in new tab: `window.open(url, "_blank", "noopener,noreferrer")`
    - _Requirements: 5.1, 5.5, 5.7_
  - [x] 8.2 Implement Add and Delete link handlers with URL normalization
    - Add: validate label non-empty AND URL non-empty; show separate per-field validation messages for each empty field
    - If URL lacks `http://`/`https://` prefix, prepend `https://` exactly once
    - Push `{ id: crypto.randomUUID(), label, url }`; persist; re-render
    - Delete: splice by id; persist; re-render
    - _Requirements: 5.2, 5.3, 5.4, 5.6_
  - [x] 8.3 Write property test for URL normalization
    - **Property 10: URL normalization always produces an http(s) prefix** — any non-http(s) string → stored URL starts with `https://` exactly once
    - **Validates: Requirements 5.4**

- [x] 9. Checkpoint — TodoController and LinksController
  - Ensure all property tests and unit tests for CRUD operations pass. Ask the user if questions arise.

- [x] 10. Wire App bootstrap and finalize layout
  - [x] 10.1 Implement `App` bootstrap in `app.js`
    - Instantiate and initialize all controllers in order: `ThemeController` first (before widgets render), then `GreetingController`, `TimerController`, `TodoController`, `LinksController`
    - Wire everything under a single `DOMContentLoaded` listener
    - _Requirements: 6.4, 7.1_
  - [x] 10.2 Complete responsive layout in `style.css`
    - Lay out four widgets in a grid that adapts from 320 px to 2560 px with no horizontal scroll or content overlap
    - Theme toggle fixed in viewport
    - _Requirements: 6.1, 7.4_
  - [x] 10.3 Write integration tests for end-to-end persistence round-trip
    - Simulate add task → reload page → verify task present
    - Simulate add link → reload page → verify link present
    - Simulate name set → reload → verify greeting and input pre-populated
    - Simulate duration set → reload → verify timer initialized correctly
    - _Requirements: 2.6, 3.14, 4.11, 5.7_

- [x] 11. Final checkpoint — Full suite
  - Ensure all property tests, unit tests, and integration tests pass. Verify file count: exactly one HTML, one CSS in `css/`, one JS in `js/`. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property; tag each test with `// Feature: todo-life-dashboard, Property N: <text>`
- Controllers must not call each other directly — communicate only through the DOM or `StorageService`
- `ThemeController` MUST initialize before all other controllers to prevent flash of wrong theme
- `crypto.randomUUID()` is preferred for IDs; fall back to `Date.now().toString()` for older Safari if needed
- Cross-browser and visual smoke tests (Requirement 7.2, 7.4) are manual and are not represented as coding tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "7.1", "8.1"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "5.3", "7.2", "8.2"] },
    { "id": 5, "tasks": ["7.3", "8.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["7.6", "7.7", "7.8", "10.1"] },
    { "id": 7, "tasks": ["10.2", "10.3"] }
  ]
}
```
