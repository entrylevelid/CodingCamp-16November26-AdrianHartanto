// =============================================================================
// todo-life-dashboard — app.js
// Zero-dependency, single-page personal dashboard.
// All logic is organized into namespaced controller objects.
// =============================================================================

// =============================================================================
// StorageService
// Thin wrapper around window.localStorage.
//
// Storage key constants (tld_ prefix avoids collisions with other pages):
//   KEY_USER_NAME       = "tld_userName"        — string
//   KEY_THEME           = "tld_theme"            — "light" | "dark"
//   KEY_SESSION_DURATION= "tld_sessionDuration"  — number (1–99)
//   KEY_TODOS           = "tld_todos"            — Task[]
//   KEY_LINKS           = "tld_links"            — Link[]
// =============================================================================

const StorageService = (() => {
  // ── Storage key constants ────────────────────────────────────────────────
  const KEY_USER_NAME        = "tld_userName";
  const KEY_THEME            = "tld_theme";
  const KEY_SESSION_DURATION = "tld_sessionDuration";
  const KEY_TODOS            = "tld_todos";
  const KEY_LINKS            = "tld_links";

  // ── One-time "unavailable" banner guard ──────────────────────────────────
  let _bannerShown = false;

  /**
   * Show a one-time non-blocking banner at the top of the page when every
   * localStorage write fails (e.g. private-browsing quota = 0).
   */
  function _showUnavailableBanner() {
    if (_bannerShown) return;
    _bannerShown = true;

    const banner = document.createElement("div");
    banner.id = "storage-unavailable-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.textContent = "Storage unavailable — changes won't be saved";
    banner.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "z-index:9999",
      "background:#f59e0b",
      "color:#1c1917",
      "text-align:center",
      "padding:8px 16px",
      "font-size:0.875rem",
      "font-family:inherit",
    ].join(";");

    // Insert banner safely; guard against calls before <body> is ready
    const target = document.body || document.documentElement;
    target.prepend(banner);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Read and JSON-parse a value from localStorage.
   * Returns null if the key is absent or the stored value cannot be parsed.
   *
   * @param {string} key
   * @returns {*|null}
   */
  function get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * JSON-serialize a value and write it to localStorage.
   * Logs a console.warn and shows the one-time unavailability banner on failure.
   *
   * @param {string} key
   * @param {*} value
   */
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`StorageService.set failed for key "${key}":`, err);
      _showUnavailableBanner();
    }
  }

  /**
   * Remove a key from localStorage.
   *
   * @param {string} key
   */
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`StorageService.remove failed for key "${key}":`, err);
    }
  }

  return {
    // Key constants exposed so other controllers don't hardcode strings
    KEY_USER_NAME,
    KEY_THEME,
    KEY_SESSION_DURATION,
    KEY_TODOS,
    KEY_LINKS,

    get,
    set,
    remove,
  };
})();

// =============================================================================
// ThemeController
// Manages light/dark theme preference.
//
// Init behavior:
//   1. Read "tld_theme" from StorageService (default "light" if absent).
//   2. Immediately set data-theme attribute on <html> — this runs before any
//      other widget renders to prevent flash of wrong theme.
//   3. Wire click handler to #theme-toggle button.
//
// Toggle behavior:
//   • Flip current theme between "light" and "dark".
//   • Persist via StorageService.set("tld_theme", newTheme).
//   • Apply data-theme attribute within 100 ms (synchronous DOM write).
// =============================================================================
const ThemeController = (() => {
  /** Apply the given theme to the <html> element. */
  function _apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  /** Update the toggle button icon to reflect the active theme. */
  function _updateButtonIcon(theme) {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  function init() {
    // Read persisted theme — default to "light" when absent or invalid.
    const stored = StorageService.get(StorageService.KEY_THEME);
    const theme = stored === "dark" ? "dark" : "light";

    // Apply immediately (synchronous) — before any widget renders.
    _apply(theme);
    _updateButtonIcon(theme);

    // Wire toggle button click handler.
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", toggle);
    }
  }

  function toggle() {
    // Read the current theme from the DOM (single source of truth).
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    // Apply within 100 ms — the setAttribute call is synchronous.
    _apply(next);
    _updateButtonIcon(next);

    // Persist the new value.
    StorageService.set(StorageService.KEY_THEME, next);
  }

  return { init, toggle };
})();

// =============================================================================
// GreetingController
// Drives the Greeting_Widget: time, date, personalized greeting, name input.
//
// DOM nodes used:
//   #greeting-time       — current time in HH:MM (24-hour)
//   #greeting-date       — current date as "Weekday, Month Day"
//   #greeting-text       — greeting prefix (+ name if stored)
//   #greeting-name-input — text input for user name (maxlength 50)
//   #greeting-name-submit — submit button (inside #greeting-name-form)
//
// Greeting prefix rules (by local hour):
//   05–11 → "Good morning"
//   12–17 → "Good afternoon"
//   18–20 → "Good evening"
//   21–23, 00–04 → "Good night"
// =============================================================================
const GreetingController = (() => {
  // ── Private state ──────────────────────────────────────────────────────────
  /** The last minute value rendered — used to detect minute changes in the tick. */
  let _lastRenderedMinute = -1;

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Return the greeting prefix string for the given 0–23 hour value.
   *
   * @param {number} hour  Local hour (0–23)
   * @returns {string}
   */
  function _getPrefix(hour) {
    if (hour >= 5 && hour <= 11) return "Good morning";
    if (hour >= 12 && hour <= 17) return "Good afternoon";
    if (hour >= 18 && hour <= 20) return "Good evening";
    // 21–23 and 00–04
    return "Good night";
  }

  /**
   * Format a number as a two-digit string (zero-padded).
   *
   * @param {number} n
   * @returns {string}
   */
  function _pad2(n) {
    return String(n).padStart(2, "0");
  }

  /**
   * Render the time element (HH:MM) using the supplied Date.
   * Only writes to the DOM; does not check whether the minute changed.
   *
   * @param {Date} now
   */
  function _renderTime(now) {
    const el = document.getElementById("greeting-time");
    if (!el) return;
    el.textContent = `${_pad2(now.getHours())}:${_pad2(now.getMinutes())}`;
  }

  /**
   * Render the date element as "Weekday, Month Day" (no year).
   *
   * @param {Date} now
   */
  function _renderDate(now) {
    const el = document.getElementById("greeting-date");
    if (!el) return;
    const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
    const month   = now.toLocaleDateString(undefined, { month: "long" });
    const day     = now.getDate();
    el.textContent = `${weekday}, ${month} ${day}`;
  }

  /**
   * Render the greeting text using the current hour and the stored name.
   *
   * @param {Date}        now
   * @param {string|null} userName  Stored name, or null/empty when absent.
   */
  function _renderGreeting(now, userName) {
    const el = document.getElementById("greeting-text");
    if (!el) return;
    el.textContent = getGreeting(now.getHours(), userName);
  }

  // ── Interval tick ──────────────────────────────────────────────────────────

  /**
   * Called every second by setInterval.
   * Re-renders the time only when the wall-clock minute has changed,
   * and re-renders the greeting (prefix can change at hour boundaries).
   */
  function _tick() {
    const now     = new Date();
    const minute  = now.getMinutes();

    if (minute !== _lastRenderedMinute) {
      _lastRenderedMinute = minute;
      _renderTime(now);
      // Re-render greeting in case the hour boundary was crossed.
      const userName = StorageService.get(StorageService.KEY_USER_NAME);
      _renderGreeting(now, userName);
    }
  }

  // ── Name submit handler ────────────────────────────────────────────────────

  /**
   * Handle the name form submission.
   * Trims the value; persists or removes from storage; re-renders greeting.
   *
   * @param {Event} e
   */
  function _onNameSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("greeting-name-input");
    if (!input) return;

    const saved = setName(input.value);
    input.value = saved === null ? "" : saved;
  }

  /**
   * Persist (or clear) the user name and re-render the greeting.
   * Whitespace-only / empty values remove the stored name.
   *
   * @param {string} value
   * @returns {string|null} The stored name, or null when cleared.
   */
  function setName(value) {
    const trimmed = String(value === undefined || value === null ? "" : value)
      .trim()
      .slice(0, 50);

    if (trimmed.length > 0) {
      StorageService.set(StorageService.KEY_USER_NAME, trimmed);
    } else {
      StorageService.remove(StorageService.KEY_USER_NAME);
    }

    // Re-render greeting immediately (within 500 ms, synchronous DOM write).
    _renderGreeting(new Date(), trimmed.length > 0 ? trimmed : null);
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Build the full greeting string for a given hour and optional name.
   *
   * @param {number}      hour
   * @param {string|null} userName
   * @returns {string}
   */
  function getGreeting(hour, userName) {
    const prefix  = _getPrefix(hour);
    const trimmed = typeof userName === "string" ? userName.trim() : "";
    return trimmed.length > 0 ? `${prefix}, ${trimmed}` : prefix;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    const now      = new Date();
    const userName = StorageService.get(StorageService.KEY_USER_NAME);

    // Pre-populate name input with stored name (Req 2.6).
    const input = document.getElementById("greeting-name-input");
    if (input && userName) {
      input.value = userName;
    }

    // Initial renders.
    _renderTime(now);
    _renderDate(now);
    _renderGreeting(now, userName);

    // Record the minute we just rendered so the first tick can detect a change.
    _lastRenderedMinute = now.getMinutes();

    // Wire name submit handler.
    const form = document.getElementById("greeting-name-form");
    if (form) {
      form.addEventListener("submit", _onNameSubmit);
    }

    // Start the per-second tick — updates time display only on minute change.
    setInterval(_tick, 1000);
  }

  // Expose helpers for unit / property tests.
  return { init, setName, getGreeting, _getPrefix };
})();

// =============================================================================
// TimerController
// Drives the Timer_Widget (Pomodoro countdown state machine).
//
// State:
//   status          — "reset" | "running" | "paused"
//   remaining       — seconds left in the current countdown
//   sessionDuration — current session length in minutes
//   intervalId      — setInterval handle, or null
//   pendingDuration — duration change requested while running; applied on Reset
//
// Button rules:
//   Start  — enabled when status !== "running"
//   Stop   — enabled when status === "running"
//   Reset  — always enabled
//
// Display format: MM:SS with leading zeros ("05:03")
// =============================================================================
const TimerController = (() => {
  // ── State ──────────────────────────────────────────────────────────────
  let status          = "reset";   // "reset" | "running" | "paused"
  let remaining       = 0;         // seconds
  let sessionDuration = 25;        // minutes
  let intervalId      = null;
  let pendingDuration = null;      // set when duration changes while running

  // ── DOM helpers ────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }

  /** Format a second count as "MM:SS". */
  function _fmt(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  /** Write the current remaining time to the display element. */
  function _renderDisplay() {
    const display = _el("timer-display");
    if (display) display.textContent = _fmt(remaining);
  }

  /** Enable/disable buttons according to the current status. */
  function _renderButtons() {
    const startBtn = _el("timer-start");
    const stopBtn  = _el("timer-stop");
    const resetBtn = _el("timer-reset");

    if (startBtn) startBtn.disabled = (status === "running");
    if (stopBtn)  stopBtn.disabled  = (status !== "running");
    if (resetBtn) resetBtn.disabled = false; // always enabled
  }

  /** Full render: display + buttons. */
  function _render() {
    _renderDisplay();
    _renderButtons();
  }

  // ── Tick ───────────────────────────────────────────────────────────────
  function _tick() {
    remaining -= 1;
    _renderDisplay();

    if (remaining <= 0) {
      remaining = 0;
      _stop();
      _playAlert();
    }
  }

  // ── Alert ──────────────────────────────────────────────────────────────
  function _playAlert() {
    try {
      const ctx       = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      oscillator.type      = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 1.5); // 1.5-second tone (within 1–3 s)
    } catch (err) {
      // AudioContext unavailable — skip silently; visual state is unaffected.
      console.warn("TimerController: could not play alert tone:", err);
    }
  }

  // ── State transitions ──────────────────────────────────────────────────

  function _start() {
    if (status === "running") return;
    // Finished session: Start begins a fresh countdown instead of
    // immediately re-firing the alert at 00:00.
    if (remaining <= 0) {
      if (pendingDuration !== null) {
        sessionDuration = pendingDuration;
        pendingDuration = null;
      }
      remaining = sessionDuration * 60;
    }
    status     = "running";
    intervalId = setInterval(_tick, 1000);
    _render();
  }

  function _stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    status = "paused";
    _render();
  }

  function _reset() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    // Apply any pending duration change that occurred while running.
    if (pendingDuration !== null) {
      sessionDuration = pendingDuration;
      pendingDuration = null;
      StorageService.set(StorageService.KEY_SESSION_DURATION, sessionDuration);
      // Sync the input field to the applied value.
      const durationInput = _el("timer-duration");
      if (durationInput) durationInput.value = sessionDuration;
    }

    remaining = sessionDuration * 60;
    status    = "reset";
    _render();
  }

  // ── Duration change handler ────────────────────────────────────────────
  function _onDurationChange(e) {
    const clamped = setDuration(e.target.value);
    // Reflect the clamped value back into the input.
    e.target.value = clamped;
  }

  /**
   * Change the session duration (minutes). Clamped to 1–99.
   * Persisted immediately; applied now when not running, or on next Reset
   * when running.
   *
   * @param {number|string} value
   * @returns {number} the clamped value
   */
  function setDuration(value) {
    const raw     = parseInt(value, 10);
    const clamped = isNaN(raw) ? sessionDuration : Math.max(1, Math.min(99, raw));

    // Req 3.11: always persist the new value.
    StorageService.set(StorageService.KEY_SESSION_DURATION, clamped);

    if (status === "running") {
      // Req 3.13: store pending; apply on next Reset.
      pendingDuration = clamped;
    } else {
      // Req 3.12: not running → reset the display immediately.
      sessionDuration = clamped;
      pendingDuration = null;
      remaining = sessionDuration * 60;
      status    = "reset";
      _render();
    }
    return clamped;
  }

  // ── Public init ────────────────────────────────────────────────────────
  function init() {
    // Load persisted session duration (default 25).
    const stored = StorageService.get(StorageService.KEY_SESSION_DURATION);
    sessionDuration = (typeof stored === "number" && stored >= 1 && stored <= 99)
      ? stored
      : 25;

    remaining       = sessionDuration * 60;
    status          = "reset";
    intervalId      = null;
    pendingDuration = null;

    // Sync the duration input field.
    const durationInput = _el("timer-duration");
    if (durationInput) {
      durationInput.value = sessionDuration;
      durationInput.addEventListener("change", _onDurationChange);
    }

    // Wire buttons.
    const startBtn = _el("timer-start");
    const stopBtn  = _el("timer-stop");
    const resetBtn = _el("timer-reset");

    if (startBtn) startBtn.addEventListener("click", _start);
    if (stopBtn)  stopBtn.addEventListener("click",  _stop);
    if (resetBtn) resetBtn.addEventListener("click", _reset);

    // Initial render.
    _render();
  }

  // Expose internals used by tests (prefixed with _ to signal internal use).
  return {
    init,
    start: _start,
    stop:  _stop,
    reset: _reset,
    setDuration,
    // Test-visible state accessors
    getStatus()          { return status; },
    getRemaining()       { return remaining; },
    getSessionDuration() { return sessionDuration; },
    getPendingDuration() { return pendingDuration; },
  };
})();

// =============================================================================
// Shared helpers
// =============================================================================

/** Generate a unique id; falls back for browsers without crypto.randomUUID. */
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Create an element with optional class name and text content. */
function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// =============================================================================
// TodoController
// Drives the Todo_Widget: add, toggle, edit (inline), delete.
//
// DOM nodes used:
//   #todo-form        — add form
//   #todo-input       — new task text input (maxlength 500)
//   #todo-validation  — inline validation message for the add form
//   #todo-list        — <ul> rebuilt from the in-memory tasks array
//
// Task: { id: string, description: string, completed: boolean }
// =============================================================================
const TodoController = (() => {
  const MAX_LENGTH = 500;
  const EMPTY_MSG  = "Please enter a task description.";

  /** In-memory model, in insertion order. */
  let tasks = [];

  function _el(id) { return document.getElementById(id); }

  /** Return true when a value looks like a valid Task record. */
  function _isTask(t) {
    return t !== null && typeof t === "object" &&
      typeof t.id === "string" &&
      typeof t.description === "string" &&
      typeof t.completed === "boolean";
  }

  /** Normalize a raw description; returns null when it is empty/invalid. */
  function _clean(raw) {
    const trimmed = String(raw === undefined || raw === null ? "" : raw).trim();
    if (trimmed.length === 0) return null;
    return trimmed.slice(0, MAX_LENGTH);
  }

  function _persist() {
    StorageService.set(StorageService.KEY_TODOS, tasks);
  }

  function _setValidation(msg) {
    const v = _el("todo-validation");
    if (v) v.textContent = msg;
  }

  // ── Model operations (persist + re-render) ──────────────────────────────

  /** Load tasks from storage, dropping malformed entries. */
  function load() {
    const stored = StorageService.get(StorageService.KEY_TODOS);
    tasks = Array.isArray(stored) ? stored.filter(_isTask) : [];
    return getTasks();
  }

  /**
   * Add a task. Returns the new Task, or null when the description is
   * empty / whitespace-only (no task added, validation message shown).
   */
  function add(description) {
    const clean = _clean(description);
    if (clean === null) {
      _setValidation(EMPTY_MSG);
      return null;
    }
    const task = { id: generateId(), description: clean, completed: false };
    tasks.push(task);
    _setValidation("");
    _persist();
    render();
    return { ...task };
  }

  /** Flip the completed state of the task with the given id. */
  function toggle(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return false;
    task.completed = !task.completed;
    _persist();
    render();
    return true;
  }

  /** Remove the task with the given id. */
  function remove(id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    tasks.splice(idx, 1);
    _persist();
    render();
    return true;
  }

  /**
   * Update the description of a task. Returns false (and changes nothing)
   * when the new description is empty or the id is unknown.
   */
  function edit(id, description) {
    const task = tasks.find(t => t.id === id);
    if (!task) return false;
    const clean = _clean(description);
    if (clean === null) return false;
    task.description = clean;
    _persist();
    render();
    return true;
  }

  /** Return a defensive copy of the current task list. */
  function getTasks() {
    return tasks.map(t => ({ ...t }));
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  /** Build a task row in display mode. */
  function _buildDisplayRow(task) {
    const li = createEl("li", "task-item");
    li.dataset.id = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-toggle";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label",
      task.completed ? "Mark task as incomplete" : "Mark task as complete");
    checkbox.addEventListener("change", () => toggle(task.id));

    const span = createEl("span", "task-description", task.description);
    if (task.completed) span.classList.add("completed");

    const editBtn = createEl("button", "task-edit-btn", "Edit");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => _startEdit(li, task));

    const deleteBtn = createEl("button", "task-delete-btn", "Delete");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => remove(task.id));

    li.append(checkbox, span, editBtn, deleteBtn);
    return li;
  }

  /** Swap a row into inline edit mode. */
  function _startEdit(li, task) {
    li.textContent = "";
    li.classList.add("editing");

    const form = createEl("form", "task-edit-form");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "task-edit-input";
    input.maxLength = MAX_LENGTH;
    input.value = task.description;
    input.setAttribute("aria-label", "Edit task description");

    const saveBtn = createEl("button", "task-save-btn", "Save");
    saveBtn.type = "submit";

    const cancelBtn = createEl("button", "task-cancel-btn", "Cancel");
    cancelBtn.type = "button";

    const msg = createEl("span", "validation-msg");
    msg.setAttribute("aria-live", "polite");

    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!edit(task.id, input.value)) {
        msg.textContent = EMPTY_MSG;
        input.focus();
      }
    });
    // Cancel: discard in-flight changes, no persistence write.
    cancelBtn.addEventListener("click", () => render());
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") render();
    });

    form.append(input, saveBtn, cancelBtn, msg);
    li.append(form);
    input.focus();
    input.select();
  }

  /** Clear and rebuild the list from the in-memory array. */
  function render() {
    const list = _el("todo-list");
    if (!list) return;
    list.textContent = "";
    if (tasks.length === 0) {
      list.append(createEl("li", "empty-state", "No tasks yet — add one above."));
      return;
    }
    tasks.forEach(t => list.append(_buildDisplayRow(t)));
  }

  // ── Public init ─────────────────────────────────────────────────────────

  function init() {
    load();

    const form  = _el("todo-form");
    const input = _el("todo-input");
    if (form && input) {
      form.addEventListener("submit", e => {
        e.preventDefault();
        if (add(input.value)) {
          input.value = "";
        }
        input.focus();
      });
      input.addEventListener("input", () => _setValidation(""));
    }

    render();
  }

  return { init, load, add, toggle, remove, edit, getTasks, render };
})();

// =============================================================================
// LinksController
// Drives the Links_Widget: add, open, delete quick links.
//
// DOM nodes used:
//   #links-form             — add form
//   #link-label-input       — label input
//   #link-url-input         — URL input
//   #link-label-validation  — inline message for an empty label
//   #link-url-validation    — inline message for an empty URL
//   #links-list             — <ul> rebuilt from the in-memory links array
//
// Link: { id: string, label: string, url: string }
// =============================================================================
const LinksController = (() => {
  const LABEL_MSG = "Please enter a label.";
  const URL_MSG   = "Please enter a URL.";

  /** In-memory model, in insertion order. */
  let links = [];

  function _el(id) { return document.getElementById(id); }

  function _isLink(l) {
    return l !== null && typeof l === "object" &&
      typeof l.id === "string" &&
      typeof l.label === "string" &&
      typeof l.url === "string";
  }

  /**
   * Ensure a URL starts with http:// or https://. When it does not,
   * prepend "https://" exactly once.
   *
   * @param {string} raw
   * @returns {string}
   */
  function normalizeUrl(raw) {
    const trimmed = String(raw).trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
  }

  function _persist() {
    StorageService.set(StorageService.KEY_LINKS, links);
  }

  function _setValidation(labelMsg, urlMsg) {
    const l = _el("link-label-validation");
    const u = _el("link-url-validation");
    if (l) l.textContent = labelMsg;
    if (u) u.textContent = urlMsg;
  }

  // ── Model operations ────────────────────────────────────────────────────

  function load() {
    const stored = StorageService.get(StorageService.KEY_LINKS);
    links = Array.isArray(stored) ? stored.filter(_isLink) : [];
    return getLinks();
  }

  /**
   * Add a link. Returns { link } on success, or { errors: { label?, url? } }
   * with one entry per empty field (nothing is added in that case).
   */
  function add(label, url) {
    const cleanLabel = String(label === undefined || label === null ? "" : label).trim();
    const cleanUrl   = String(url === undefined || url === null ? "" : url).trim();

    const errors = {};
    if (cleanLabel.length === 0) errors.label = LABEL_MSG;
    if (cleanUrl.length === 0)   errors.url   = URL_MSG;

    _setValidation(errors.label || "", errors.url || "");
    if (errors.label || errors.url) return { errors };

    const link = { id: generateId(), label: cleanLabel, url: normalizeUrl(cleanUrl) };
    links.push(link);
    _persist();
    render();
    return { link: { ...link } };
  }

  function remove(id) {
    const idx = links.findIndex(l => l.id === id);
    if (idx === -1) return false;
    links.splice(idx, 1);
    _persist();
    render();
    return true;
  }

  /** Open a stored link in a new tab. */
  function open(id) {
    const link = links.find(l => l.id === id);
    if (!link) return false;
    window.open(link.url, "_blank", "noopener,noreferrer");
    return true;
  }

  function getLinks() {
    return links.map(l => ({ ...l }));
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function _buildRow(link) {
    const li = createEl("li", "link-item");
    li.dataset.id = link.id;

    const btn = createEl("button", "link-btn");
    btn.type = "button";
    btn.title = link.url;
    btn.append(
      createEl("span", "link-label", link.label),
      createEl("span", "link-url", link.url)
    );
    btn.addEventListener("click", () => open(link.id));

    const del = createEl("button", "link-delete-btn", "✕");
    del.type = "button";
    del.setAttribute("aria-label", `Delete link ${link.label}`);
    del.addEventListener("click", () => remove(link.id));

    li.append(btn, del);
    return li;
  }

  function render() {
    const list = _el("links-list");
    if (!list) return;
    list.textContent = "";
    if (links.length === 0) {
      list.append(createEl("li", "empty-state", "No links yet — add a favorite site."));
      return;
    }
    links.forEach(l => list.append(_buildRow(l)));
  }

  // ── Public init ─────────────────────────────────────────────────────────

  function init() {
    load();

    const form       = _el("links-form");
    const labelInput = _el("link-label-input");
    const urlInput   = _el("link-url-input");
    if (form && labelInput && urlInput) {
      form.addEventListener("submit", e => {
        e.preventDefault();
        const result = add(labelInput.value, urlInput.value);
        if (result.link) {
          labelInput.value = "";
          urlInput.value = "";
          labelInput.focus();
        } else if (result.errors.label) {
          labelInput.focus();
        } else {
          urlInput.focus();
        }
      });
      labelInput.addEventListener("input", () => {
        const l = _el("link-label-validation");
        if (l) l.textContent = "";
      });
      urlInput.addEventListener("input", () => {
        const u = _el("link-url-validation");
        if (u) u.textContent = "";
      });
    }

    render();
  }

  return { init, load, add, remove, open, getLinks, normalizeUrl, render };
})();

// =============================================================================
// App — bootstrap
// ThemeController MUST initialize first (before widgets render) to prevent
// flash of wrong theme.
// =============================================================================
const App = {
  init() {
    ThemeController.init();
    GreetingController.init();
    TimerController.init();
    TodoController.init();
    LinksController.init();
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());

// Expose controllers to Node-based tests. Ignored in the browser, where
// `module` is undefined.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    StorageService,
    ThemeController,
    GreetingController,
    TimerController,
    TodoController,
    LinksController,
    App,
  };
}
