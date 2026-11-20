# Design Document

## Overview

The todo-life-dashboard is a zero-dependency personal dashboard delivered as three static files: `index.html`, `css/style.css`, and `js/app.js`. It runs entirely in the browser — no server, no build step, no external libraries. All state is persisted in `window.localStorage`. The page deploys directly to GitHub Pages and must work correctly in the latest stable releases of Chrome, Firefox, Edge, and Safari.

The dashboard presents four widgets in a single viewport:

| Widget | Purpose |
|---|---|
| Greeting_Widget | Current time (HH:MM), date, and personalized greeting |
| Timer_Widget | Pomodoro countdown timer with configurable session length |
| Todo_Widget | CRUD to-do list with inline editing |
| Links_Widget | Quick-launch link buttons |

A fixed Theme toggle switches between `light` and `dark` color schemes, persisting the user's preference to LocalStorage.

---

## Architecture

### File Layout

```
index.html          ← single HTML entry point
css/
  style.css         ← all styling, CSS custom properties for themes
js/
  app.js            ← all logic (widget controllers + storage layer)
```

### Module Structure (inside `app.js`)

The JavaScript is organized into self-contained, namespaced objects to keep concerns separate without a build tool:

```
StorageService      ← thin wrapper around localStorage (get/set/remove)
GreetingController  ← drives Greeting_Widget (clock tick, name management)
TimerController     ← drives Timer_Widget (countdown state machine)
TodoController      ← drives Todo_Widget (CRUD + persistence)
LinksController     ← drives Links_Widget (CRUD + persistence)
ThemeController     ← Theme toggle + persistence
App                 ← bootstraps controllers on DOMContentLoaded
```

Each controller owns its DOM queries and its slice of LocalStorage. Controllers communicate only through the DOM (event listeners) or StorageService — they do not call each other directly.

### State Machine: Timer

The Timer_Widget has three named states:

```
         Start          Stop
RESET ──────────► RUNNING ──────────► PAUSED
  ▲                  │                   │
  │                  │ countdown=0        │ Start
  └──────────────────┘                   │
        Reset (any state)                │
  ◄────────────────────────────────────-─┘
```

Transitions are triggered by user controls (Start, Stop, Reset) and by the countdown reaching zero.

### Rendering Strategy

No virtual DOM or framework. Each controller directly mutates the relevant DOM nodes using `textContent`, `classList`, and `setAttribute`. List widgets (Todo, Links) use a single re-render function that clears the list element and rebuilds it from the in-memory array — this keeps sync logic simple and correct.

---

## Components and Interfaces

### StorageService

```js
StorageService.get(key)           // returns parsed JSON or null
StorageService.set(key, value)    // serializes value to JSON and saves
StorageService.remove(key)        // removes key
```

Storage keys:

| Key | Value type | Default |
|---|---|---|
| `tld_userName` | string | — |
| `tld_theme` | `"light"` \| `"dark"` | `"light"` |
| `tld_sessionDuration` | number (1–99) | `25` |
| `tld_todos` | `Task[]` | `[]` |
| `tld_links` | `Link[]` | `[]` |

All keys are prefixed with `tld_` to avoid collisions with other pages on the same origin.

### GreetingController

**Inputs:** DOM nodes for time display, date display, greeting display, name input, name submit button.

**Behavior:**
- On init: load `tld_userName`, pre-populate input, render greeting. Start a `setInterval` that fires every second and updates the time display only when the wall-clock minute changes.
- On name submit: trim value; if non-empty, `StorageService.set("tld_userName", value)`; if empty or all-whitespace, `StorageService.remove("tld_userName")`. Re-render greeting within 500 ms.

**Greeting prefix rules (by local hour):**

| Hour range | Prefix |
|---|---|
| 05–11 | Good morning |
| 12–17 | Good afternoon |
| 18–20 | Good evening |
| 21–23, 00–04 | Good night |

### TimerController

**Inputs:** DOM nodes for display, Start button, Stop button, Reset button, duration input.

**State:** `{ status: "reset"|"running"|"paused", remaining: number, sessionDuration: number, intervalId: null|number }`

**Behavior:**
- On init: load `tld_sessionDuration` (default 25), set `remaining = sessionDuration * 60`, render.
- Start: `setInterval` decrement by 1 s; update `status = "running"`.
- Stop: `clearInterval`; `status = "paused"`.
- Reset: `clearInterval`; `remaining = sessionDuration * 60`; `status = "reset"`.
- Tick: if `remaining === 0`, auto-stop and play alert via `AudioContext` (1–3 s tone).
- Duration change: persist to `tld_sessionDuration`; if not running, reset immediately; if running, store pending value and apply on next Reset.
- Button state: Start enabled ↔ status ≠ "running"; Stop enabled ↔ status = "running".

### TodoController

**Inputs:** DOM nodes for the list container, task text input, Add button.

**In-memory model:** `tasks: Task[]` (see Data Models).

**Behavior:**
- On init: load from `tld_todos`, render list.
- Add: validate non-empty (after trim), push new Task `{ id, description, completed: false }`, persist, re-render.
- Toggle: flip `completed`, persist, re-render.
- Delete: splice by id, persist, re-render.
- Edit start: replace row's display span with inline `<input>` pre-populated with current description.
- Edit save: validate non-empty; update description, persist, re-render.
- Edit cancel: re-render (discards in-flight DOM changes).
- Empty-submit guard: show inline `<span class="validation-msg">` adjacent to the input.

### LinksController

**Inputs:** DOM nodes for the list container, label input, URL input, Add button.

**In-memory model:** `links: Link[]` (see Data Models).

**Behavior:**
- On init: load from `tld_links`, render list.
- Add: validate label non-empty + URL non-empty; if URL lacks `http://` or `https://` prefix, prepend `https://`; push new Link, persist, re-render. Show per-field validation messages for empty fields.
- Delete: splice by id, persist, re-render.
- Click: open stored URL in new tab via `window.open(url, "_blank", "noopener,noreferrer")`.

### ThemeController

**Inputs:** DOM node for toggle button/checkbox.

**Behavior:**
- On init: load `tld_theme` (default `"light"`); apply by toggling a `data-theme="dark"` attribute on `<html>`. Must run before any widget renders to prevent flash of wrong theme.
- On toggle: flip theme, persist, apply within 100 ms.
- CSS consumes `[data-theme="dark"]` selector to swap custom property values.

---

## Data Models

### Task

```ts
interface Task {
  id: string;          // crypto.randomUUID() or Date.now().toString()
  description: string; // 1–500 characters, trimmed
  completed: boolean;
}
```

Stored as `JSON.stringify(tasks)` under `tld_todos`. Order is insertion order (array index).

### Link

```ts
interface Link {
  id: string;    // crypto.randomUUID() or Date.now().toString()
  label: string; // non-empty display text
  url: string;   // normalized URL (always begins with http:// or https://)
}
```

Stored as `JSON.stringify(links)` under `tld_links`. Order is insertion order.

### Theme

```ts
type Theme = "light" | "dark";
```

Stored as a plain string (no JSON wrapping needed).

### Session Duration

Stored as a JSON number (1–99). StorageService handles parse/stringify uniformly.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Greeting prefix covers all 24 hours without gaps or overlaps

*For any* integer hour in the range 0–23, the greeting prefix function SHALL return exactly one of the four defined prefixes ("Good morning", "Good afternoon", "Good evening", "Good night").

**Validates: Requirements 1.3, 1.4, 1.5, 1.6**

### Property 2: Whitespace-only names are rejected

*For any* string composed entirely of whitespace characters (spaces, tabs, newlines), submitting it as a User_Name SHALL leave LocalStorage without a `tld_userName` key and SHALL display the greeting prefix with no name appended.

**Validates: Requirements 2.5, 2.7**

### Property 3: Name round-trip

*For any* valid User_Name string of 1–50 non-whitespace-containing characters, saving it via the name input and then reloading the page SHALL result in the input field being pre-populated with that exact value and the greeting displaying it.

**Validates: Requirements 2.2, 2.6**

### Property 4: Task addition grows the list

*For any* task list state and any valid (non-empty, ≤500-character) task description, adding the task SHALL increase the displayed task count by exactly one and persist an updated array to LocalStorage.

**Validates: Requirements 4.2, 4.12**

### Property 5: Whitespace-only task descriptions are rejected

*For any* string composed entirely of whitespace characters, submitting it as a task description SHALL not add a Task and SHALL display a validation message, leaving the task list unchanged.

**Validates: Requirements 4.3**

### Property 6: Task toggle is idempotent across two flips

*For any* Task in any completion state, toggling its completion state twice SHALL return the Task to its original completion state and persist the final state to LocalStorage.

**Validates: Requirements 4.4**

### Property 7: Task deletion removes exactly that task

*For any* task list and any task T in that list, deleting T SHALL result in a list that contains all original tasks except T, in their original relative order, and SHALL persist the updated list to LocalStorage.

**Validates: Requirements 4.5, 4.12**

### Property 8: Task edit round-trip preserves description

*For any* Task and any valid non-empty edited description, completing an edit SHALL update the Task's description to the new value while all other Task fields remain unchanged, and SHALL persist the change to LocalStorage.

**Validates: Requirements 4.7, 4.12**

### Property 9: Task list persistence round-trip

*For any* array of Tasks saved to LocalStorage, calling the load function SHALL return an array equal in length and content, in insertion order.

**Validates: Requirements 4.11, 4.12**

### Property 10: URL normalization always produces an http(s) prefix

*For any* non-empty URL string that does not begin with `http://` or `https://`, the add-link function SHALL prepend `https://` exactly once, so the stored URL always begins with `https://`.

**Validates: Requirements 5.4**

### Property 11: Link list persistence round-trip

*For any* array of Links saved to LocalStorage, calling the load function SHALL return an array equal in length and content, in insertion order.

**Validates: Requirements 5.7**

### Property 12: Theme toggle is an involution

*For any* active Theme value, activating the toggle twice SHALL return the Theme to its original value and persist the final value to LocalStorage.

**Validates: Requirements 6.2, 6.3**

### Property 13: Session duration persists across reloads

*For any* whole-number session duration D in the range 1–99, saving D via the duration input and then reloading the page SHALL result in the Timer_Widget initializing with a countdown of D × 60 seconds.

**Validates: Requirements 3.10, 3.11, 3.14**

---

## Error Handling

### LocalStorage Unavailable

`localStorage` can throw in private-browsing modes with storage quota at zero, or when blocked by browser settings. `StorageService.set` wraps every write in a `try/catch`. On failure it logs a `console.warn` and continues — the widget still functions in-memory for the page session. No visible error is surfaced to the user unless every write fails, in which case a one-time non-blocking banner ("Storage unavailable — changes won't be saved") is shown.

### Corrupted LocalStorage Data

`StorageService.get` wraps `JSON.parse` in a `try/catch`. If parsing fails, it returns `null` and each controller falls back to its default state (empty task list, empty links list, default duration, light theme, no name).

### Invalid Duration Input

The duration `<input type="number">` is constrained with `min="1" max="99" step="1"`. If a value outside this range reaches the controller (e.g., via DevTools), the controller clamps it: `Math.max(1, Math.min(99, value))`.

### Audio Alert Failure

`AudioContext` creation is wrapped in a `try/catch`. If it fails (e.g., browser requires user gesture before audio), the alert is silently skipped — the visual countdown-complete state is unaffected.

### URL Validation

Only the `http://` / `https://` prefix check is enforced. Full URL validation (hostname existence, path syntax) is intentionally omitted to keep the implementation zero-dependency. Users can enter any URL that passes the prefix rule; navigating to a broken URL is the browser's responsibility.

---

## Testing Strategy

### Approach

The feature is pure client-side logic with no external services, making it well-suited to both property-based testing and unit testing. The testing approach uses:

- **Property-based tests** for universal invariants (the 13 correctness properties above), using [fast-check](https://fast-check.dev/) with a minimum of 100 iterations per property.
- **Unit / example-based tests** for concrete scenarios, edge cases, and UI-state assertions.
- **Manual browser smoke tests** for cross-browser compatibility (Requirement 7.2) and visual/layout checks (Requirement 7.4).

No test runner installation is strictly required — tests can be written as plain ES modules executed with Node.js (using `--experimental-vm-modules` and jsdom for DOM) or bundled with a lightweight runner like Vitest.

### Property-Based Tests

Each property test maps to one Correctness Property section above. The tag comment format is:

```js
// Feature: todo-life-dashboard, Property N: <property_text>
```

**Recommended library:** `fast-check` (zero runtime deps, works in Node.js and browsers).

**Minimum iterations:** 100 per property (fast-check default is 100; increase via `{ numRuns: 500 }` for edge-case-heavy properties like greeting prefix coverage).

| Property | Generator inputs | Assertion |
|---|---|---|
| P1: Greeting prefix coverage | `fc.integer({ min: 0, max: 23 })` | result ∈ { four prefix strings } |
| P2: Whitespace name rejection | `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` | localStorage has no key; greeting has no name |
| P3: Name round-trip | `fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)` | reload → input value equals saved name |
| P4: Task addition grows list | `fc.array(taskArb), fc.string({ minLength: 1, maxLength: 500 })` | length increases by 1; localStorage updated |
| P5: Whitespace task rejection | `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` | list unchanged; validation message shown |
| P6: Toggle idempotence | `taskArb` | two toggles → original state |
| P7: Task deletion | `fc.array(taskArb, { minLength: 1 }), fc.nat()` | list = original minus deleted; order preserved |
| P8: Edit round-trip | `taskArb, fc.string({ minLength: 1, maxLength: 500 })` | description updated; other fields unchanged |
| P9: Task list persistence | `fc.array(taskArb)` | load(save(arr)) deep-equals arr |
| P10: URL normalization | `fc.string({ minLength: 1 }).filter(s => !s.startsWith('http'))` | stored URL starts with `https://` |
| P11: Link list persistence | `fc.array(linkArb)` | load(save(arr)) deep-equals arr |
| P12: Theme toggle involution | `fc.constantFrom('light', 'dark')` | two toggles → original theme |
| P13: Duration persistence | `fc.integer({ min: 1, max: 99 })` | reload → timer.remaining = D × 60 |

### Unit / Example-Based Tests

Focused on concrete behaviors that are not purely universal:

- Greeting_Widget renders correct prefix for each of the four hour-band boundaries (5, 12, 18, 21, 0).
- Timer_Widget: Start enables countdown; Stop pauses at current value; Reset restores to full duration; countdown-to-zero fires alert callback.
- Timer_Widget: changing duration while running stores pending value and applies on Reset.
- Todo_Widget: edit-cancel restores original description with no persistence write.
- Todo_Widget: completed tasks render with `.completed` class (strikethrough).
- Links_Widget: empty-label and empty-URL each produce their own validation message independently.
- Links_Widget: clicking a link button calls `window.open` with the correct URL and `"_blank"` target.
- ThemeController: applies `data-theme="dark"` before widget render (no flash).

### Manual Smoke Tests

- Load page in Chrome, Firefox, Edge, Safari — verify all four widgets render within 2 s.
- Toggle Theme in each browser — verify color scheme switches within 100 ms.
- Resize viewport from 320px to 2560px — verify no horizontal scroll or overlap.
- Reload after adding tasks, links, changing name, duration, and theme — verify all state persists.
- Verify exactly one HTML file, one CSS file in `css/`, one JS file in `js/`.
