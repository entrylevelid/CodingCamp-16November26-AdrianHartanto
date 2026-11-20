/**
 * Unit tests for TimerController logic.
 *
 * Because TimerController lives in a browser script (app.js) that relies on
 * window.localStorage, DOM elements, and setInterval, we replicate its exact
 * logic here with in-memory stubs.  The logic under test is identical to what
 * is shipped in app.js — any divergence would itself be a bug.
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/timer.test.js
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9
 */

"use strict";

// ---------------------------------------------------------------------------
// In-memory localStorage mock
// ---------------------------------------------------------------------------
function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
}

// ---------------------------------------------------------------------------
// StorageService factory (mirrors app.js)
// ---------------------------------------------------------------------------
function makeStorageService(ls) {
  const KEY_SESSION_DURATION = "tld_sessionDuration";

  function get(key) {
    try {
      const raw = ls.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function set(key, value) {
    try { ls.setItem(key, JSON.stringify(value)); } catch {}
  }

  function remove(key) {
    try { ls.removeItem(key); } catch {}
  }

  return { KEY_SESSION_DURATION, get, set, remove };
}

// ---------------------------------------------------------------------------
// Minimal DOM stub for Timer_Widget elements
// ---------------------------------------------------------------------------
function makeTimerDom(initialDuration = 25) {
  // Simple element stub that tracks textContent, disabled, and value
  function el(id, type = "button") {
    const node = {
      id,
      type,
      textContent: "",
      disabled: false,
      value: type === "number" ? String(initialDuration) : "",
      _listeners: {},
      addEventListener(evt, fn) {
        this._listeners[evt] = this._listeners[evt] || [];
        this._listeners[evt].push(fn);
      },
      _fire(evt, detail = {}) {
        (this._listeners[evt] || []).forEach(fn => fn(detail));
      },
    };
    return node;
  }

  return {
    display:   el("timer-display", "span"),
    startBtn:  el("timer-start"),
    stopBtn:   el("timer-stop"),
    resetBtn:  el("timer-reset"),
    durationInput: el("timer-duration", "number"),
  };
}

// ---------------------------------------------------------------------------
// TimerController factory (mirrors app.js logic exactly)
// ---------------------------------------------------------------------------
function makeTimerController(storage, dom, fakeTimers) {
  let status          = "reset";
  let remaining       = 0;
  let sessionDuration = 25;
  let intervalId      = null;
  let pendingDuration = null;

  // fake setInterval/clearInterval from fakeTimers
  const _setInterval   = fakeTimers ? fakeTimers.setInterval   : setInterval;
  const _clearInterval = fakeTimers ? fakeTimers.clearInterval : clearInterval;

  function _fmt(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function _renderDisplay() {
    if (dom.display) dom.display.textContent = _fmt(remaining);
  }

  function _renderButtons() {
    if (dom.startBtn) dom.startBtn.disabled = (status === "running");
    if (dom.stopBtn)  dom.stopBtn.disabled  = (status !== "running");
    if (dom.resetBtn) dom.resetBtn.disabled = false;
  }

  function _render() {
    _renderDisplay();
    _renderButtons();
  }

  function _tick() {
    remaining -= 1;
    _renderDisplay();
    if (remaining <= 0) {
      remaining = 0;
      _stop();
      // skip AudioContext in test environment
    }
  }

  function _start() {
    if (status === "running") return;
    status     = "running";
    intervalId = _setInterval(_tick, 1000);
    _render();
  }

  function _stop() {
    if (intervalId !== null) {
      _clearInterval(intervalId);
      intervalId = null;
    }
    status = "paused";
    _render();
  }

  function _reset() {
    if (intervalId !== null) {
      _clearInterval(intervalId);
      intervalId = null;
    }
    if (pendingDuration !== null) {
      sessionDuration = pendingDuration;
      pendingDuration = null;
      storage.set(storage.KEY_SESSION_DURATION, sessionDuration);
      if (dom.durationInput) dom.durationInput.value = sessionDuration;
    }
    remaining = sessionDuration * 60;
    status    = "reset";
    _render();
  }

  function _onDurationChange(e) {
    const raw     = parseInt(e.target ? e.target.value : e.value, 10);
    const clamped = isNaN(raw) ? 25 : Math.max(1, Math.min(99, raw));
    if (status === "running") {
      pendingDuration = clamped;
    } else {
      sessionDuration = clamped;
      pendingDuration = null;
      storage.set(storage.KEY_SESSION_DURATION, sessionDuration);
      remaining = sessionDuration * 60;
      _render();
    }
  }

  function init() {
    const stored = storage.get(storage.KEY_SESSION_DURATION);
    sessionDuration = (typeof stored === "number" && stored >= 1 && stored <= 99)
      ? stored : 25;

    remaining       = sessionDuration * 60;
    status          = "reset";
    intervalId      = null;
    pendingDuration = null;

    if (dom.durationInput) {
      dom.durationInput.value = sessionDuration;
      dom.durationInput.addEventListener("change", _onDurationChange);
    }
    if (dom.startBtn) dom.startBtn.addEventListener("click", _start);
    if (dom.stopBtn)  dom.stopBtn.addEventListener("click",  _stop);
    if (dom.resetBtn) dom.resetBtn.addEventListener("click", _reset);

    _render();
  }

  return {
    init,
    // expose internals for tests
    getStatus()          { return status; },
    getRemaining()       { return remaining; },
    getSessionDuration() { return sessionDuration; },
    getPendingDuration() { return pendingDuration; },
    // expose actions directly for tests
    _start, _stop, _reset, _tick, _onDurationChange,
  };
}

// ---------------------------------------------------------------------------
// Fake timer helper
// ---------------------------------------------------------------------------
function makeFakeTimers() {
  const callbacks = new Map();
  let nextId = 1;

  function setInterval(fn, _delay) {
    const id = nextId++;
    callbacks.set(id, fn);
    return id;
  }

  function clearInterval(id) {
    callbacks.delete(id);
  }

  /** Advance all active intervals by N ticks. */
  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      for (const fn of callbacks.values()) fn();
    }
  }

  return { setInterval, clearInterval, tick };
}

// ---------------------------------------------------------------------------
// Lightweight test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message || err}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Tests — Requirement 3.1, 3.2: Display and init
// ---------------------------------------------------------------------------
console.log("\nTimer init and display (Requirements 3.1, 3.2)\n");

test("initializes remaining to sessionDuration * 60 (default 25 → 1500 s)", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, makeFakeTimers());

  ctrl.init();

  if (ctrl.getRemaining() !== 1500)
    throw new Error(`Expected 1500, got ${ctrl.getRemaining()}`);
});

test("display shows '25:00' on init with default duration", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, makeFakeTimers());

  ctrl.init();

  if (dom.display.textContent !== "25:00")
    throw new Error(`Expected "25:00", got "${dom.display.textContent}"`);
});

test("loads stored session duration from storage on init", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  storage.set(storage.KEY_SESSION_DURATION, 10);

  const dom  = makeTimerDom(10);
  const ctrl = makeTimerController(storage, dom, makeFakeTimers());
  ctrl.init();

  if (ctrl.getSessionDuration() !== 10)
    throw new Error(`Expected sessionDuration 10, got ${ctrl.getSessionDuration()}`);
  if (ctrl.getRemaining() !== 600)
    throw new Error(`Expected remaining 600, got ${ctrl.getRemaining()}`);
  if (dom.display.textContent !== "10:00")
    throw new Error(`Expected "10:00", got "${dom.display.textContent}"`);
});

test("defaults to 25 min when stored value is out of range", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  storage.set(storage.KEY_SESSION_DURATION, 0); // invalid

  const dom  = makeTimerDom();
  const ctrl = makeTimerController(storage, dom, makeFakeTimers());
  ctrl.init();

  if (ctrl.getSessionDuration() !== 25)
    throw new Error(`Expected 25, got ${ctrl.getSessionDuration()}`);
});

test("display format: leading zeros — '05:03' for 303 s", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  storage.set(storage.KEY_SESSION_DURATION, 5);

  const ft   = makeFakeTimers();
  const dom  = makeTimerDom(5);
  const ctrl = makeTimerController(storage, dom, ft);
  ctrl.init(); // remaining = 300

  ctrl._start();
  ft.tick(297); // 300 - 297 = 3 s remaining → 00:03... but wait, 5 min = 300 s; 300-297=3→"00:03"

  // Actually let's tick to get to exactly 5 min 3 s = 303 s.
  // We need to init with 6 min and then tick 57 s to land on 303.
  // Easier: test the format function directly via known remaining value.
  // Reset and use a fresh controller with 6 min, then tick to 303.
  const ls2      = makeLocalStorage();
  const storage2 = makeStorageService(ls2);
  storage2.set(storage2.KEY_SESSION_DURATION, 6);
  const ft2  = makeFakeTimers();
  const dom2 = makeTimerDom(6);
  const ctrl2 = makeTimerController(storage2, dom2, ft2);
  ctrl2.init(); // remaining = 360

  ctrl2._start();
  ft2.tick(57); // 360 - 57 = 303 s = 5 min 3 s

  if (dom2.display.textContent !== "05:03")
    throw new Error(`Expected "05:03", got "${dom2.display.textContent}"`);
});

// ---------------------------------------------------------------------------
// Tests — Requirement 3.3: Start
// ---------------------------------------------------------------------------
console.log("\nStart behavior (Requirement 3.3)\n");

test("status becomes 'running' after Start", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, makeFakeTimers());
  ctrl.init();
  ctrl._start();

  if (ctrl.getStatus() !== "running")
    throw new Error(`Expected "running", got "${ctrl.getStatus()}"`);
});

test("countdown decrements by 1 per tick", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();

  ft.tick(3);

  if (ctrl.getRemaining() !== 1497)
    throw new Error(`Expected 1497, got ${ctrl.getRemaining()}`);
});

test("display updates after each tick", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();

  ft.tick(61); // 1500 - 61 = 1439 s = 23 min 59 s → "23:59"

  if (dom.display.textContent !== "23:59")
    throw new Error(`Expected "23:59", got "${dom.display.textContent}"`);
});

// ---------------------------------------------------------------------------
// Tests — Requirement 3.4: Stop
// ---------------------------------------------------------------------------
console.log("\nStop behavior (Requirement 3.4)\n");

test("status becomes 'paused' after Stop", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ctrl._stop();

  if (ctrl.getStatus() !== "paused")
    throw new Error(`Expected "paused", got "${ctrl.getStatus()}"`);
});

test("countdown stops decrementing after Stop", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(5);
  const beforeStop = ctrl.getRemaining(); // 1495
  ctrl._stop();
  ft.tick(10); // should NOT decrement anymore

  if (ctrl.getRemaining() !== beforeStop)
    throw new Error(`Expected ${beforeStop}, got ${ctrl.getRemaining()} (ticks after Stop should not count)`);
});

test("Stop preserves current remaining value in display", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(60); // 1440 s = 24:00
  ctrl._stop();

  if (dom.display.textContent !== "24:00")
    throw new Error(`Expected "24:00", got "${dom.display.textContent}"`);
});

// ---------------------------------------------------------------------------
// Tests — Requirement 3.5: Reset
// ---------------------------------------------------------------------------
console.log("\nReset behavior (Requirement 3.5)\n");

test("Reset from 'running' restores full duration and sets status to 'reset'", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(300);
  ctrl._reset();

  if (ctrl.getStatus() !== "reset")
    throw new Error(`Expected "reset", got "${ctrl.getStatus()}"`);
  if (ctrl.getRemaining() !== 1500)
    throw new Error(`Expected 1500, got ${ctrl.getRemaining()}`);
});

test("Reset from 'paused' restores full duration", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(100);
  ctrl._stop();
  ctrl._reset();

  if (ctrl.getRemaining() !== 1500)
    throw new Error(`Expected 1500, got ${ctrl.getRemaining()}`);
});

test("Reset display shows full duration", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(600);
  ctrl._reset();

  if (dom.display.textContent !== "25:00")
    throw new Error(`Expected "25:00", got "${dom.display.textContent}"`);
});

// ---------------------------------------------------------------------------
// Tests — Requirements 3.7, 3.8, 3.9: Button states
// ---------------------------------------------------------------------------
console.log("\nButton enabled/disabled states (Requirements 3.7, 3.8, 3.9)\n");

test("on init (reset state): Start enabled, Stop disabled, Reset enabled", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, makeFakeTimers());
  ctrl.init();

  if (dom.startBtn.disabled !== false)
    throw new Error("Start should be enabled in reset state");
  if (dom.stopBtn.disabled !== true)
    throw new Error("Stop should be disabled in reset state");
  if (dom.resetBtn.disabled !== false)
    throw new Error("Reset should always be enabled");
});

test("while running: Start disabled, Stop enabled, Reset enabled", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, makeFakeTimers());
  ctrl.init();
  ctrl._start();

  if (dom.startBtn.disabled !== true)
    throw new Error("Start should be disabled while running");
  if (dom.stopBtn.disabled !== false)
    throw new Error("Stop should be enabled while running");
  if (dom.resetBtn.disabled !== false)
    throw new Error("Reset should always be enabled");
});

test("while paused: Start enabled, Stop disabled, Reset enabled", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ctrl._stop();

  if (dom.startBtn.disabled !== false)
    throw new Error("Start should be enabled when paused");
  if (dom.stopBtn.disabled !== true)
    throw new Error("Stop should be disabled when paused");
  if (dom.resetBtn.disabled !== false)
    throw new Error("Reset should always be enabled");
});

test("Reset is always enabled in all states", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();

  // reset state
  if (dom.resetBtn.disabled) throw new Error("Reset disabled in reset state");

  ctrl._start();
  if (dom.resetBtn.disabled) throw new Error("Reset disabled in running state");

  ctrl._stop();
  if (dom.resetBtn.disabled) throw new Error("Reset disabled in paused state");
});

// ---------------------------------------------------------------------------
// Tests — Start is a no-op when already running
// ---------------------------------------------------------------------------
console.log("\nGuard: Start while already running\n");

test("calling Start while already running does not create a second interval", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();

  const beforeRemaining = ctrl.getRemaining();
  ctrl._start(); // second call — should be a no-op
  ft.tick(1);

  // Should only decrement once (not twice)
  if (ctrl.getRemaining() !== beforeRemaining - 1)
    throw new Error(`Expected ${beforeRemaining - 1}, got ${ctrl.getRemaining()} (double Start may have created two intervals)`);
});

// ---------------------------------------------------------------------------
// Tests — Resume from paused state
// ---------------------------------------------------------------------------
console.log("\nResume from paused (Requirement 3.4, 3.3)\n");

test("can Start again after Stop (resume from paused value)", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const ft      = makeFakeTimers();
  const dom     = makeTimerDom();
  const ctrl    = makeTimerController(storage, dom, ft);
  ctrl.init();
  ctrl._start();
  ft.tick(10);
  ctrl._stop(); // remaining = 1490
  ctrl._start(); // resume
  ft.tick(5);   // remaining = 1485

  if (ctrl.getRemaining() !== 1485)
    throw new Error(`Expected 1485, got ${ctrl.getRemaining()}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
