/**
 * Shared test helpers.
 *
 * `loadApp()` evaluates the real js/app.js in Node with minimal browser
 * stubs (localStorage, document, window). Each call loads a fresh copy of
 * the module, so calling it again with the same localStorage simulates a
 * page reload.
 */

"use strict";

const path = require("path");

const APP_PATH = path.resolve(__dirname, "..", "js", "app.js");

// ---------------------------------------------------------------------------
// In-memory localStorage (matches the browser contract)
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
    keys() { return Object.keys(store); },
  };
}

// ---------------------------------------------------------------------------
// Minimal fake element — enough for controllers that look elements up by id
// ---------------------------------------------------------------------------
function makeElement(id) {
  const attrs = Object.create(null);
  return {
    id,
    value: "",
    textContent: "",
    disabled: false,
    dataset: {},
    _listeners: {},
    addEventListener(evt, fn) {
      (this._listeners[evt] = this._listeners[evt] || []).push(fn);
    },
    dispatch(evt, extra = {}) {
      const event = { type: evt, target: this, preventDefault() {}, ...extra };
      (this._listeners[evt] || []).forEach(fn => fn(event));
    },
    setAttribute(name, v) { attrs[name] = String(v); },
    getAttribute(name) { return name in attrs ? attrs[name] : null; },
    focus() {},
  };
}

/**
 * Load a fresh copy of js/app.js.
 *
 * @param {object} [opts]
 * @param {object} [opts.localStorage]  Shared storage (reuse to simulate reload)
 * @param {string[]} [opts.elements]    Element ids getElementById should return
 * @returns {{ app, ls, elements, windowOpenCalls }}
 */
function loadApp(opts = {}) {
  const ls = opts.localStorage || makeLocalStorage();

  const elements = Object.create(null);
  (opts.elements || []).forEach(id => { elements[id] = makeElement(id); });

  const htmlEl = makeElement("html");
  const windowOpenCalls = [];

  global.localStorage = ls;
  global.document = {
    documentElement: htmlEl,
    body: null,
    getElementById(id) { return elements[id] || null; },
    addEventListener() {},           // DOMContentLoaded never fires in tests
    createElement(tag) { return makeElement(tag); },
  };
  global.window = {
    open(url, target, features) { windowOpenCalls.push({ url, target, features }); },
  };

  delete require.cache[APP_PATH];
  const app = require(APP_PATH);

  return { app, ls, elements, htmlEl, windowOpenCalls };
}

// ---------------------------------------------------------------------------
// Tiny test runner (same output format as the existing tests)
// ---------------------------------------------------------------------------
function makeRunner() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err && err.message ? err.message : err}`);
      failed++;
    }
  }

  function section(title) { console.log(`\n${title}\n`); }

  function done() {
    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  }

  return { test, section, done };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || "Not equal"}\n      expected: ${e}\n      actual:   ${a}`);
}

module.exports = { makeLocalStorage, makeElement, loadApp, makeRunner, assert, assertEqual };
