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
    const prefix = _getPrefix(now.getHours());
    const trimmed = userName ? userName.trim() : "";
    el.textContent = trimmed.length > 0 ? `${prefix}, ${trimmed}` : prefix;
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
    const input   = document.getElementById("greeting-name-input");
    if (!input) return;

    const trimmed = input.value.trim();

    if (trimmed.length > 0) {
      StorageService.set(StorageService.KEY_USER_NAME, trimmed);
    } else {
      StorageService.remove(StorageService.KEY_USER_NAME);
      input.value = "";
    }

    // Re-render greeting immediately (within 500 ms, synchronous DOM write).
    _renderGreeting(new Date(), trimmed.length > 0 ? trimmed : null);
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

  // Expose _getPrefix for unit / property tests.
  return { init, _getPrefix };
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
    const raw      = parseInt(e.target.value, 10);
    const clamped  = isNaN(raw) ? 25 : Math.max(1, Math.min(99, raw));

    if (status === "running") {
      // Store pending; apply on next Reset.
      pendingDuration = clamped;
    } else {
      sessionDuration = clamped;
      pendingDuration = null;
      StorageService.set(StorageService.KEY_SESSION_DURATION, sessionDuration);
      remaining = sessionDuration * 60;
      _render();
    }
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
    // Test-visible state accessors
    getStatus()          { return status; },
    getRemaining()       { return remaining; },
    getSessionDuration() { return sessionDuration; },
    getPendingDuration() { return pendingDuration; },
  };
})();

// =============================================================================
// TodoController — stub (implemented in task 7.1)
// =============================================================================
const TodoController = {
  init() {},
};

// =============================================================================
// LinksController — stub (implemented in task 8.1)
// =============================================================================
const LinksController = {
  init() {},
};

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
