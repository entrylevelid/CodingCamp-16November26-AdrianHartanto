/**
 * Tests for LinksController (runs against the real js/app.js).
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/links.test.js
 *
 * Validates: Requirements 5.2–5.7
 */

"use strict";

const fc = require("fast-check");
const { loadApp, makeLocalStorage, makeRunner, assert, assertEqual } = require("./helpers");

const { test, section, done } = makeRunner();

const VALIDATION_IDS = ["link-label-validation", "link-url-validation"];
const nonBlank = fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0);

function fresh() {
  const ls = makeLocalStorage();
  const loaded = loadApp({ localStorage: ls, elements: VALIDATION_IDS });
  loaded.app.LinksController.load();
  return { ls, links: loaded.app.LinksController, ...loaded };
}

// ---------------------------------------------------------------------------
section("URL normalization (Requirement 5.4)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 10: URL normalization always produces an http(s) prefix
test("Property 10: non-http(s) URLs get 'https://' prepended exactly once — 200 iterations", () => {
  fc.assert(
    fc.property(
      nonBlank.filter(s => !/^https?:\/\//i.test(s.trim())),
      nonBlank,
      (url, label) => {
        const { ls, links } = fresh();
        const { link } = links.add(label, url);
        const stored = JSON.parse(ls.getItem("tld_links"))[0];
        return link.url === "https://" + url.trim() &&
          stored.url === link.url &&
          !link.url.startsWith("https://https://");
      }
    ),
    { numRuns: 200 }
  );
});

test("URLs already starting with http:// or https:// are kept as-is", () => {
  const { links } = fresh();
  assertEqual(links.add("A", "http://example.com").link.url, "http://example.com");
  assertEqual(links.add("B", "https://example.com/x").link.url, "https://example.com/x");
  assertEqual(links.add("C", "HTTPS://Example.com").link.url, "HTTPS://Example.com");
});

test("'google.com' becomes 'https://google.com'", () => {
  const { links } = fresh();
  assertEqual(links.add("Google", "  google.com ").link.url, "https://google.com");
});

// ---------------------------------------------------------------------------
section("Validation (Requirement 5.3)");
// ---------------------------------------------------------------------------

test("empty label only → label message, no URL message, nothing added", () => {
  const { links, elements } = fresh();
  const r = links.add("  ", "example.com");
  assert(r.errors && r.errors.label && !r.errors.url);
  assert(elements["link-label-validation"].textContent.length > 0);
  assertEqual(elements["link-url-validation"].textContent, "");
  assertEqual(links.getLinks().length, 0);
});

test("empty URL only → URL message, no label message, nothing added", () => {
  const { links, elements } = fresh();
  const r = links.add("Docs", "");
  assert(r.errors && r.errors.url && !r.errors.label);
  assertEqual(elements["link-label-validation"].textContent, "");
  assert(elements["link-url-validation"].textContent.length > 0);
  assertEqual(links.getLinks().length, 0);
});

test("both empty → both messages, nothing added", () => {
  const { ls, links, elements } = fresh();
  links.add("", " ");
  assert(elements["link-label-validation"].textContent.length > 0);
  assert(elements["link-url-validation"].textContent.length > 0);
  assertEqual(ls.getItem("tld_links"), null);
});

test("messages clear after a successful add", () => {
  const { links, elements } = fresh();
  links.add("", "");
  links.add("Docs", "docs.example.com");
  assertEqual(elements["link-label-validation"].textContent, "");
  assertEqual(elements["link-url-validation"].textContent, "");
});

// ---------------------------------------------------------------------------
section("Open & delete (Requirements 5.5, 5.6)");
// ---------------------------------------------------------------------------

test("opening a link calls window.open(url, '_blank', 'noopener,noreferrer')", () => {
  const { links, windowOpenCalls } = fresh();
  const { link } = links.add("Example", "example.com");
  links.open(link.id);
  assertEqual(windowOpenCalls, [
    { url: "https://example.com", target: "_blank", features: "noopener,noreferrer" },
  ]);
});

test("deleting removes the link from the list and from storage", () => {
  const { ls, links } = fresh();
  const a = links.add("A", "a.com").link;
  const b = links.add("B", "b.com").link;
  links.remove(a.id);
  assertEqual(links.getLinks().map(l => l.id), [b.id]);
  assertEqual(JSON.parse(ls.getItem("tld_links")).map(l => l.id), [b.id]);
});

// ---------------------------------------------------------------------------
section("Load (Requirement 5.7)");
// ---------------------------------------------------------------------------

test("links reload in insertion order, earliest first — 100 iterations", () => {
  fc.assert(
    fc.property(fc.array(fc.tuple(nonBlank, nonBlank), { maxLength: 10 }), pairs => {
      const { ls, links } = fresh();
      pairs.forEach(([label, url]) => links.add(label, url));
      const before = links.getLinks();

      const reloaded = loadApp({ localStorage: ls }).app.LinksController.load();
      return JSON.stringify(reloaded) === JSON.stringify(before);
    }),
    { numRuns: 100 }
  );
});

test("corrupted tld_links falls back to an empty list", () => {
  const ls = makeLocalStorage();
  ls.setItem("tld_links", "[[[");
  assertEqual(loadApp({ localStorage: ls }).app.LinksController.load(), []);
});

done();
