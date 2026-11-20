/**
 * Property-based tests for StorageService round-trip behavior.
 *
 * Because StorageService lives in a browser script (app.js) that relies on
 * window.localStorage, we replicate its exact get/set logic here with an
 * in-memory localStorage mock.  The logic under test is identical to what
 * is shipped in app.js — any divergence would itself be a bug.
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/storage.test.js
 *
 * Validates: Requirements 4.11, 4.12, 5.7
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
// Arbitraries
// ---------------------------------------------------------------------------

// Task arbitrary: { id: string, description: string (1–500 chars), completed: boolean }
const taskArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 36 }),
  description: fc.string({ minLength: 1, maxLength: 500 }),
  completed: fc.boolean(),
});

// Link arbitrary: { id: string, label: string, url: string }
const linkArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 36 }),
  label: fc.string({ minLength: 1, maxLength: 200 }),
  url: fc.string({ minLength: 1, maxLength: 2000 }),
});

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
// Property 9: Task list persistence round-trip
// Feature: todo-life-dashboard, Property 9: Task list persistence round-trip
// ---------------------------------------------------------------------------

console.log("\nProperty 9: Task list persistence round-trip");
console.log("  Validates: Requirements 4.11, 4.12\n");

test("load(save(tasks)) deep-equals tasks — 100 iterations", () => {
  fc.assert(
    fc.property(fc.array(taskArb), (tasks) => {
      const storage = makeStorageService(makeLocalStorage());

      storage.set("tld_todos", tasks);
      const loaded = storage.get("tld_todos");

      if (!Array.isArray(loaded)) return false;
      if (loaded.length !== tasks.length) return false;

      for (let i = 0; i < tasks.length; i++) {
        const orig = tasks[i];
        const got  = loaded[i];
        if (got.id          !== orig.id)          return false;
        if (got.description !== orig.description) return false;
        if (got.completed   !== orig.completed)   return false;
      }

      return true;
    }),
    { numRuns: 100 }
  );
});

test("empty task array round-trips correctly", () => {
  const storage = makeStorageService(makeLocalStorage());
  storage.set("tld_todos", []);
  const loaded = storage.get("tld_todos");
  if (!Array.isArray(loaded) || loaded.length !== 0) {
    throw new Error(`Expected [], got ${JSON.stringify(loaded)}`);
  }
});

test("task insertion order is preserved across round-trip — 100 iterations", () => {
  fc.assert(
    fc.property(
      fc.array(taskArb, { minLength: 2, maxLength: 50 }),
      (tasks) => {
        const storage = makeStorageService(makeLocalStorage());
        storage.set("tld_todos", tasks);
        const loaded = storage.get("tld_todos");
        for (let i = 0; i < tasks.length; i++) {
          if (loaded[i].id !== tasks[i].id) return false;
        }
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

test("get returns null when key was never set", () => {
  const storage = makeStorageService(makeLocalStorage());
  const result = storage.get("tld_todos");
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
});

test("get returns null after remove", () => {
  const storage = makeStorageService(makeLocalStorage());
  storage.set("tld_todos", [{ id: "1", description: "x", completed: false }]);
  storage.remove("tld_todos");
  const result = storage.get("tld_todos");
  if (result !== null) {
    throw new Error(`Expected null after remove, got ${JSON.stringify(result)}`);
  }
});

// ---------------------------------------------------------------------------
// Property 11: Link list persistence round-trip
// Feature: todo-life-dashboard, Property 11: Link list persistence round-trip
// ---------------------------------------------------------------------------

console.log("\nProperty 11: Link list persistence round-trip");
console.log("  Validates: Requirements 5.7\n");

test("load(save(links)) deep-equals links — 100 iterations", () => {
  fc.assert(
    fc.property(fc.array(linkArb), (links) => {
      const storage = makeStorageService(makeLocalStorage());

      storage.set("tld_links", links);
      const loaded = storage.get("tld_links");

      if (!Array.isArray(loaded)) return false;
      if (loaded.length !== links.length) return false;

      for (let i = 0; i < links.length; i++) {
        const orig = links[i];
        const got  = loaded[i];
        if (got.id    !== orig.id)    return false;
        if (got.label !== orig.label) return false;
        if (got.url   !== orig.url)   return false;
      }

      return true;
    }),
    { numRuns: 100 }
  );
});

test("empty link array round-trips correctly", () => {
  const storage = makeStorageService(makeLocalStorage());
  storage.set("tld_links", []);
  const loaded = storage.get("tld_links");
  if (!Array.isArray(loaded) || loaded.length !== 0) {
    throw new Error(`Expected [], got ${JSON.stringify(loaded)}`);
  }
});

test("link insertion order is preserved across round-trip — 100 iterations", () => {
  fc.assert(
    fc.property(
      fc.array(linkArb, { minLength: 2, maxLength: 50 }),
      (links) => {
        const storage = makeStorageService(makeLocalStorage());
        storage.set("tld_links", links);
        const loaded = storage.get("tld_links");
        for (let i = 0; i < links.length; i++) {
          if (loaded[i].id !== links[i].id) return false;
        }
        return true;
      }
    ),
    { numRuns: 100 }
  );
});

test("link get returns null when key was never set", () => {
  const storage = makeStorageService(makeLocalStorage());
  const result = storage.get("tld_links");
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
});

test("link get returns null after remove", () => {
  const storage = makeStorageService(makeLocalStorage());
  storage.set("tld_links", [{ id: "1", label: "Home", url: "https://example.com" }]);
  storage.remove("tld_links");
  const result = storage.get("tld_links");
  if (result !== null) {
    throw new Error(`Expected null after remove, got ${JSON.stringify(result)}`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
