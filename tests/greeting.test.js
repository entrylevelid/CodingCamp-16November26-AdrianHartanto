/**
 * Tests for GreetingController (runs against the real js/app.js).
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/greeting.test.js
 *
 * Validates: Requirements 1.3–1.8, 2.2–2.7
 */

"use strict";

const fc = require("fast-check");
const { loadApp, makeLocalStorage, makeRunner, assert, assertEqual } = require("./helpers");

const { test, section, done } = makeRunner();

const PREFIXES = ["Good morning", "Good afternoon", "Good evening", "Good night"];
const GREETING_IDS = [
  "greeting-time", "greeting-date", "greeting-text",
  "greeting-name-form", "greeting-name-input",
];

/** Run GreetingController.init() without starting a real interval. */
function initGreeting(app) {
  const realSetInterval = global.setInterval;
  global.setInterval = () => 0;
  try {
    app.GreetingController.init();
  } finally {
    global.setInterval = realSetInterval;
  }
}

// ---------------------------------------------------------------------------
section("Greeting prefix (Requirements 1.3–1.6)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 1: Greeting prefix covers all 24 hours without gaps or overlaps
test("Property 1: every hour 0–23 maps to exactly one prefix — 500 iterations", () => {
  const { app } = loadApp();
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 23 }), hour => {
      const prefix = app.GreetingController._getPrefix(hour);
      return PREFIXES.filter(p => p === prefix).length === 1;
    }),
    { numRuns: 500 }
  );
});

test("boundary hours map to the correct prefix", () => {
  const { app } = loadApp();
  const p = app.GreetingController._getPrefix;
  const cases = {
    0: "Good night", 4: "Good night", 5: "Good morning", 11: "Good morning",
    12: "Good afternoon", 17: "Good afternoon", 18: "Good evening",
    20: "Good evening", 21: "Good night", 23: "Good night",
  };
  for (const [hour, expected] of Object.entries(cases)) {
    assertEqual(p(Number(hour)), expected, `hour ${hour}`);
  }
});

test("greeting with a name is 'Prefix, Name' (Req 1.7)", () => {
  const { app } = loadApp();
  assertEqual(app.GreetingController.getGreeting(9, "Adrian"), "Good morning, Adrian");
});

test("greeting without a name is the bare prefix (Req 1.8)", () => {
  const { app } = loadApp();
  assertEqual(app.GreetingController.getGreeting(19, null), "Good evening");
});

// ---------------------------------------------------------------------------
section("Name setting (Requirements 2.2–2.7)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 2: Whitespace-only names are rejected
test("Property 2: whitespace-only names leave no tld_userName and no suffix — 100 iterations", () => {
  fc.assert(
    fc.property(fc.stringOf(fc.constantFrom(" ", "\t", "\n")), ws => {
      const ls = makeLocalStorage();
      ls.setItem("tld_userName", JSON.stringify("Previous"));
      const { app, elements } = loadApp({ localStorage: ls, elements: GREETING_IDS });

      const result = app.GreetingController.setName(ws);
      const text = elements["greeting-text"].textContent;

      return result === null &&
        ls.getItem("tld_userName") === null &&
        PREFIXES.includes(text);
    }),
    { numRuns: 100 }
  );
});

// Feature: todo-life-dashboard, Property 3: Name round-trip
test("Property 3: saved name survives reload (input pre-populated, greeting shows it) — 100 iterations", () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      name => {
        const ls = makeLocalStorage();
        const first = loadApp({ localStorage: ls, elements: GREETING_IDS });
        first.app.GreetingController.setName(name);

        // Simulate reload.
        const second = loadApp({ localStorage: ls, elements: GREETING_IDS });
        initGreeting(second.app);

        const expected = name.trim();
        return second.elements["greeting-name-input"].value === expected &&
          second.elements["greeting-text"].textContent.endsWith(`, ${expected}`);
      }
    ),
    { numRuns: 100 }
  );
});

test("submitting the form updates the greeting without reload (Req 2.3)", () => {
  const { app, elements } = loadApp({ elements: GREETING_IDS });
  initGreeting(app);

  elements["greeting-name-input"].value = "  Adrian  ";
  elements["greeting-name-form"].dispatch("submit");

  assert(elements["greeting-text"].textContent.endsWith(", Adrian"),
    `greeting was "${elements["greeting-text"].textContent}"`);
  assertEqual(elements["greeting-name-input"].value, "Adrian", "input trimmed");
});

test("clearing the name removes it from storage (Req 2.4)", () => {
  const ls = makeLocalStorage();
  const { app, elements } = loadApp({ localStorage: ls, elements: GREETING_IDS });
  initGreeting(app);

  app.GreetingController.setName("Adrian");
  elements["greeting-name-input"].value = "";
  elements["greeting-name-form"].dispatch("submit");

  assertEqual(ls.getItem("tld_userName"), null);
  assert(PREFIXES.includes(elements["greeting-text"].textContent));
});

test("names longer than 50 chars are truncated to 50", () => {
  const { app } = loadApp();
  const saved = app.GreetingController.setName("x".repeat(80));
  assertEqual(saved.length, 50);
});

// ---------------------------------------------------------------------------
section("Time & date display (Requirements 1.1, 1.2)");
// ---------------------------------------------------------------------------

test("init renders HH:MM time and a 'Weekday, Month Day' date without year", () => {
  const { app, elements } = loadApp({ elements: GREETING_IDS });
  initGreeting(app);

  assert(/^\d{2}:\d{2}$/.test(elements["greeting-time"].textContent),
    `time was "${elements["greeting-time"].textContent}"`);
  const date = elements["greeting-date"].textContent;
  assert(/^\S+, \S+ \d{1,2}$/.test(date), `date was "${date}"`);
  assert(!date.includes(String(new Date().getFullYear())), "date must not contain the year");
});

done();
