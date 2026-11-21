/**
 * Integration tests: end-to-end persistence round-trips through a simulated
 * page reload, plus duration-change rules. Runs against the real js/app.js.
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/integration.test.js
 *
 * Validates: Requirements 2.6, 3.10–3.14, 4.11, 5.7, 6.4
 */

"use strict";

const fc = require("fast-check");
const { loadApp, makeLocalStorage, makeRunner, assert, assertEqual } = require("./helpers");

const { test, section, done } = makeRunner();

/** Boot the whole App (all controllers) without starting real intervals. */
function bootApp(ls, elements = []) {
  const loaded = loadApp({ localStorage: ls, elements });
  const realSetInterval = global.setInterval;
  global.setInterval = () => 0;
  try {
    loaded.app.App.init();
  } finally {
    global.setInterval = realSetInterval;
  }
  return loaded;
}

// ---------------------------------------------------------------------------
section("Reload round-trips (Requirements 2.6, 3.14, 4.11, 5.7)");
// ---------------------------------------------------------------------------

test("add task → reload → task present", () => {
  const ls = makeLocalStorage();
  bootApp(ls).app.TodoController.add("Write report");
  const tasks = bootApp(ls).app.TodoController.getTasks();
  assertEqual(tasks.map(t => t.description), ["Write report"]);
});

test("add link → reload → link present", () => {
  const ls = makeLocalStorage();
  bootApp(ls).app.LinksController.add("GitHub", "github.com");
  const links = bootApp(ls).app.LinksController.getLinks();
  assertEqual(links.map(l => [l.label, l.url]), [["GitHub", "https://github.com"]]);
});

test("set name → reload → greeting and input pre-populated", () => {
  const ls = makeLocalStorage();
  const ids = ["greeting-text", "greeting-name-input"];
  bootApp(ls, ids).app.GreetingController.setName("Adrian");
  const { elements } = bootApp(ls, ids);
  assertEqual(elements["greeting-name-input"].value, "Adrian");
  assert(elements["greeting-text"].textContent.endsWith(", Adrian"));
});

test("toggle theme → reload → theme applied on init", () => {
  const ls = makeLocalStorage();
  bootApp(ls).app.ThemeController.toggle();
  const { htmlEl } = bootApp(ls);
  assertEqual(htmlEl.getAttribute("data-theme"), "dark");
});

// Feature: todo-life-dashboard, Property 13: Session duration persists across reloads
test("Property 13: duration D saved → reload → remaining = D × 60 — 100 iterations", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 99 }), d => {
      const ls = makeLocalStorage();
      bootApp(ls).app.TimerController.setDuration(d);
      const timer = bootApp(ls).app.TimerController;
      return timer.getSessionDuration() === d && timer.getRemaining() === d * 60;
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
section("Duration change rules (Requirements 3.10–3.13)");
// ---------------------------------------------------------------------------

test("out-of-range durations are clamped to 1–99", () => {
  const { app } = bootApp(makeLocalStorage());
  assertEqual(app.TimerController.setDuration(0), 1);
  assertEqual(app.TimerController.setDuration(150), 99);
  assertEqual(app.TimerController.setDuration("-7"), 1);
});

test("change while paused resets display immediately to the new duration", () => {
  const { app } = bootApp(makeLocalStorage());
  const timer = app.TimerController;
  timer.start();
  timer.stop();
  timer.setDuration(10);
  assertEqual(timer.getStatus(), "reset");
  assertEqual(timer.getRemaining(), 600);
  timer.reset(); // clean up
});

test("change while running is deferred until Reset, but persisted", () => {
  const ls = makeLocalStorage();
  const { app } = bootApp(ls);
  const timer = app.TimerController;
  timer.start();
  timer.setDuration(5);
  assertEqual(timer.getRemaining(), 1500, "running countdown unaffected");
  assertEqual(timer.getPendingDuration(), 5);
  assertEqual(JSON.parse(ls.getItem("tld_sessionDuration")), 5, "persisted");
  timer.reset();
  assertEqual(timer.getRemaining(), 300, "applied on reset");
  assertEqual(timer.getPendingDuration(), null);
});

test("theme is applied before other widgets init (no flash)", () => {
  const ls = makeLocalStorage();
  ls.setItem("tld_theme", JSON.stringify("dark"));
  const loaded = loadApp({ localStorage: ls });
  let themeAtGreetingInit = null;
  const realInit = loaded.app.GreetingController.init;
  loaded.app.GreetingController.init = () => {
    themeAtGreetingInit = loaded.htmlEl.getAttribute("data-theme");
  };
  loaded.app.App.init();
  loaded.app.GreetingController.init = realInit;
  assertEqual(themeAtGreetingInit, "dark");
});

done();
