/**
 * Property-based tests for ThemeController toggle behavior.
 *
 * Because ThemeController lives in a browser script (app.js) that relies on
 * window.localStorage and document.documentElement, we replicate its exact
 * toggle logic here with an in-memory localStorage mock and a minimal DOM
 * stub.  The logic under test is identical to what is shipped in app.js —
 * any divergence would itself be a bug.
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/theme.test.js
 *
 * Validates: Requirements 6.2, 6.3
 */

"use strict";

const fc = require("fast-check");

// ---------------------------------------------------------------------------
// In-memory localStorage mock (matches browser localStorage contract)
// ---------------------------------------------------------------------------
function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

// ---------------------------------------------------------------------------
// StorageService factory — mirrors app.js implementation exactly, but accepts
// an explicit localStorage instance so each test run is fully isolated.
// ---------------------------------------------------------------------------
function makeStorageService(ls) {
  function get(key) {
    try {
      const raw = ls.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function set(key, value) {
    try {
      ls.setItem(key, JSON.stringify(value));
    } catch (err) {
      // mirrors console.warn in production; swallowed in test context
    }
  }

  function remove(key) {
    try {
      ls.removeItem(key);
    } catch (err) {
      // swallowed
    }
  }

  return { get, set, remove };
}

// ---------------------------------------------------------------------------
// Minimal DOM stub — simulates document.documentElement.setAttribute/getAttribute
// ---------------------------------------------------------------------------
function makeDocumentStub() {
  let _theme = "light";
  return {
    documentElement: {
      setAttribute(attr, value) {
        if (attr === "data-theme") _theme = value;
      },
      getAttribute(attr) {
        if (attr === "data-theme") return _theme;
        return null;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// ThemeController factory — mirrors app.js implementation exactly, but accepts
// explicit StorageService and document stubs for full test isolation.
// ---------------------------------------------------------------------------
function makeThemeController(storage, doc) {
  const KEY_THEME = "tld_theme";

  function _apply(theme) {
    doc.documentElement.setAttribute("data-theme", theme);
  }

  function init() {
    const stored = storage.get(KEY_THEME);
    const theme = stored === "dark" ? "dark" : "light";
    _apply(theme);
  }

  function toggle() {
    const current = doc.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    _apply(next);
    storage.set(KEY_THEME, next);
  }

  return { init, toggle };
}

// ---------------------------------------------------------------------------
// Lightweight test runner (no external framework dependency)
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
// Property 12: Theme toggle is an involution
// Feature: todo-life-dashboard, Property 12: Theme toggle is an involution
// ---------------------------------------------------------------------------

console.log("\nProperty 12: Theme toggle is an involution");
console.log("  Validates: Requirements 6.2, 6.3\n");

test("two toggles restore original theme in DOM and localStorage — 100 iterations", () => {
  // Validates: Requirements 6.2, 6.3
  fc.assert(
    fc.property(fc.constantFrom("light", "dark"), (initialTheme) => {
      const ls      = makeLocalStorage();
      const storage = makeStorageService(ls);
      const doc     = makeDocumentStub();
      const ctrl    = makeThemeController(storage, doc);

      // Seed the controller with the generated initial theme.
      storage.set("tld_theme", initialTheme);
      ctrl.init();

      // Verify init applied the right theme.
      const afterInit = doc.documentElement.getAttribute("data-theme");
      if (afterInit !== initialTheme) return false;

      // First toggle — theme must flip.
      ctrl.toggle();
      const afterFirst = doc.documentElement.getAttribute("data-theme");
      const expectedFlip = initialTheme === "dark" ? "light" : "dark";
      if (afterFirst !== expectedFlip) return false;

      // Second toggle — theme must return to initial.
      ctrl.toggle();
      const afterSecond = doc.documentElement.getAttribute("data-theme");
      if (afterSecond !== initialTheme) return false;

      // The persisted value in localStorage must equal the original theme.
      const persisted = storage.get("tld_theme");
      return persisted === initialTheme;
    }),
    { numRuns: 100 }
  );
});

test("toggle from 'light' goes to 'dark' on first flip", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const doc     = makeDocumentStub();
  const ctrl    = makeThemeController(storage, doc);

  storage.set("tld_theme", "light");
  ctrl.init();
  ctrl.toggle();

  const domTheme       = doc.documentElement.getAttribute("data-theme");
  const persistedTheme = storage.get("tld_theme");

  if (domTheme !== "dark") {
    throw new Error(`Expected DOM theme "dark" after toggle from "light", got "${domTheme}"`);
  }
  if (persistedTheme !== "dark") {
    throw new Error(`Expected persisted theme "dark" after toggle from "light", got "${persistedTheme}"`);
  }
});

test("toggle from 'dark' goes to 'light' on first flip", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const doc     = makeDocumentStub();
  const ctrl    = makeThemeController(storage, doc);

  storage.set("tld_theme", "dark");
  ctrl.init();
  ctrl.toggle();

  const domTheme       = doc.documentElement.getAttribute("data-theme");
  const persistedTheme = storage.get("tld_theme");

  if (domTheme !== "light") {
    throw new Error(`Expected DOM theme "light" after toggle from "dark", got "${domTheme}"`);
  }
  if (persistedTheme !== "light") {
    throw new Error(`Expected persisted theme "light" after toggle from "dark", got "${persistedTheme}"`);
  }
});

test("two toggles from 'light' restore 'light' in DOM and localStorage", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const doc     = makeDocumentStub();
  const ctrl    = makeThemeController(storage, doc);

  storage.set("tld_theme", "light");
  ctrl.init();
  ctrl.toggle();
  ctrl.toggle();

  const domTheme       = doc.documentElement.getAttribute("data-theme");
  const persistedTheme = storage.get("tld_theme");

  if (domTheme !== "light") {
    throw new Error(`Expected DOM theme "light" after two toggles from "light", got "${domTheme}"`);
  }
  if (persistedTheme !== "light") {
    throw new Error(`Expected persisted theme "light" after two toggles, got "${persistedTheme}"`);
  }
});

test("two toggles from 'dark' restore 'dark' in DOM and localStorage", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const doc     = makeDocumentStub();
  const ctrl    = makeThemeController(storage, doc);

  storage.set("tld_theme", "dark");
  ctrl.init();
  ctrl.toggle();
  ctrl.toggle();

  const domTheme       = doc.documentElement.getAttribute("data-theme");
  const persistedTheme = storage.get("tld_theme");

  if (domTheme !== "dark") {
    throw new Error(`Expected DOM theme "dark" after two toggles from "dark", got "${domTheme}"`);
  }
  if (persistedTheme !== "dark") {
    throw new Error(`Expected persisted theme "dark" after two toggles, got "${persistedTheme}"`);
  }
});

test("init defaults to 'light' when no theme is stored", () => {
  const ls      = makeLocalStorage();
  const storage = makeStorageService(ls);
  const doc     = makeDocumentStub();
  const ctrl    = makeThemeController(storage, doc);

  ctrl.init();

  const domTheme = doc.documentElement.getAttribute("data-theme");
  if (domTheme !== "light") {
    throw new Error(`Expected default DOM theme "light", got "${domTheme}"`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
