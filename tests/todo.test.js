/**
 * Tests for TodoController (runs against the real js/app.js).
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/todo.test.js
 *
 * Validates: Requirements 4.2–4.12
 */

"use strict";

const fc = require("fast-check");
const { loadApp, makeLocalStorage, makeRunner, assert, assertEqual } = require("./helpers");

const { test, section, done } = makeRunner();

const nonBlank = fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0);
const whitespace = fc.stringOf(fc.constantFrom(" ", "\t", "\n"));

/** A list of valid task descriptions to seed the controller with. */
const seedArb = fc.array(nonBlank, { maxLength: 15 });

function storedTasks(ls) {
  const raw = ls.getItem("tld_todos");
  return raw === null ? null : JSON.parse(raw);
}

/** Fresh app with `descriptions` already added (some optionally completed). */
function seeded(descriptions, completedMask = []) {
  const ls = makeLocalStorage();
  const { app, elements } = loadApp({ localStorage: ls, elements: ["todo-validation"] });
  const todo = app.TodoController;
  todo.load();
  descriptions.forEach((d, i) => {
    const t = todo.add(d);
    if (completedMask[i]) todo.toggle(t.id);
  });
  return { ls, todo, elements };
}

// ---------------------------------------------------------------------------
section("Add (Requirements 4.2, 4.3, 4.12)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 4: Task addition grows the list
test("Property 4: adding a valid task grows the list by one and persists — 100 iterations", () => {
  fc.assert(
    fc.property(seedArb, nonBlank, (seed, desc) => {
      const { ls, todo } = seeded(seed);
      const before = todo.getTasks().length;
      const added = todo.add(desc);
      const after = todo.getTasks();
      return added !== null &&
        after.length === before + 1 &&
        after[after.length - 1].description === desc.trim() &&
        after[after.length - 1].completed === false &&
        JSON.stringify(storedTasks(ls)) === JSON.stringify(after);
    }),
    { numRuns: 100 }
  );
});

// Feature: todo-life-dashboard, Property 5: Whitespace-only task descriptions are rejected
test("Property 5: whitespace-only descriptions are rejected with a message — 100 iterations", () => {
  fc.assert(
    fc.property(seedArb, whitespace, (seed, ws) => {
      const { todo, elements } = seeded(seed);
      elements["todo-validation"].textContent = "";
      const before = JSON.stringify(todo.getTasks());
      const result = todo.add(ws);
      return result === null &&
        JSON.stringify(todo.getTasks()) === before &&
        elements["todo-validation"].textContent.length > 0;
    }),
    { numRuns: 100 }
  );
});

test("validation message clears after a successful add", () => {
  const { todo, elements } = seeded([]);
  todo.add("   ");
  assert(elements["todo-validation"].textContent.length > 0, "message shown");
  todo.add("Buy milk");
  assertEqual(elements["todo-validation"].textContent, "");
});

test("descriptions longer than 500 chars are truncated to 500", () => {
  const { todo } = seeded([]);
  const t = todo.add("a".repeat(700));
  assertEqual(t.description.length, 500);
});

// ---------------------------------------------------------------------------
section("Toggle (Requirement 4.4)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 6: Task toggle is idempotent across two flips
test("Property 6: two toggles restore the original state and persist it — 100 iterations", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(nonBlank, fc.boolean()), { minLength: 1, maxLength: 10 }),
      fc.nat(),
      (rows, pick) => {
        const { ls, todo } = seeded(rows.map(r => r[0]), rows.map(r => r[1]));
        const target = todo.getTasks()[pick % rows.length];

        todo.toggle(target.id);
        const mid = todo.getTasks().find(t => t.id === target.id);
        todo.toggle(target.id);
        const end = todo.getTasks().find(t => t.id === target.id);
        const persisted = storedTasks(ls).find(t => t.id === target.id);

        return mid.completed === !target.completed &&
          end.completed === target.completed &&
          persisted.completed === target.completed;
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
section("Delete (Requirements 4.5, 4.12)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 7: Task deletion removes exactly that task
test("Property 7: deleting removes exactly that task, preserving order — 100 iterations", () => {
  fc.assert(
    fc.property(fc.array(nonBlank, { minLength: 1, maxLength: 15 }), fc.nat(), (seed, pick) => {
      const { ls, todo } = seeded(seed);
      const original = todo.getTasks();
      const victim = original[pick % original.length];

      todo.remove(victim.id);

      const expected = original.filter(t => t.id !== victim.id);
      return JSON.stringify(todo.getTasks()) === JSON.stringify(expected) &&
        JSON.stringify(storedTasks(ls)) === JSON.stringify(expected);
    }),
    { numRuns: 100 }
  );
});

test("deleting an unknown id changes nothing", () => {
  const { todo } = seeded(["a", "b"]);
  const before = JSON.stringify(todo.getTasks());
  assertEqual(todo.remove("nope"), false);
  assertEqual(JSON.stringify(todo.getTasks()), before);
});

// ---------------------------------------------------------------------------
section("Edit (Requirements 4.7, 4.8, 4.12)");
// ---------------------------------------------------------------------------

// Feature: todo-life-dashboard, Property 8: Task edit round-trip preserves description
test("Property 8: edit updates description only and persists — 100 iterations", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(nonBlank, fc.boolean()), { minLength: 1, maxLength: 10 }),
      fc.nat(),
      nonBlank,
      (rows, pick, newDesc) => {
        const { ls, todo } = seeded(rows.map(r => r[0]), rows.map(r => r[1]));
        const target = todo.getTasks()[pick % rows.length];

        const ok = todo.edit(target.id, newDesc);
        const after = todo.getTasks().find(t => t.id === target.id);
        const persisted = storedTasks(ls).find(t => t.id === target.id);

        return ok &&
          after.description === newDesc.trim() &&
          after.id === target.id &&
          after.completed === target.completed &&
          persisted.description === newDesc.trim();
      }
    ),
    { numRuns: 100 }
  );
});

test("editing to an empty/whitespace description is rejected (Req 4.8)", () => {
  fc.assert(
    fc.property(whitespace, ws => {
      const { ls, todo } = seeded(["Original"]);
      const id = todo.getTasks()[0].id;
      const storedBefore = ls.getItem("tld_todos");
      return todo.edit(id, ws) === false &&
        todo.getTasks()[0].description === "Original" &&
        ls.getItem("tld_todos") === storedBefore;
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
section("Load (Requirement 4.11)");
// ---------------------------------------------------------------------------

test("tasks reload in insertion order", () => {
  const { ls } = seeded(["first", "second", "third"]);
  const { app } = loadApp({ localStorage: ls });
  const loaded = app.TodoController.load().map(t => t.description);
  assertEqual(loaded, ["first", "second", "third"]);
});

test("corrupted tld_todos falls back to an empty list", () => {
  const ls = makeLocalStorage();
  ls.setItem("tld_todos", "{not json");
  const { app } = loadApp({ localStorage: ls });
  assertEqual(app.TodoController.load(), []);
});

test("malformed entries in tld_todos are dropped", () => {
  const ls = makeLocalStorage();
  ls.setItem("tld_todos", JSON.stringify([
    { id: "1", description: "ok", completed: false },
    { id: 2, description: "bad id", completed: false },
    null,
    { id: "3", description: "missing completed" },
  ]));
  const { app } = loadApp({ localStorage: ls });
  assertEqual(app.TodoController.load(), [{ id: "1", description: "ok", completed: false }]);
});

done();
