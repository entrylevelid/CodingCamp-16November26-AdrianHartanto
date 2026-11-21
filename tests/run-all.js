/**
 * Runs every tests/*.test.js file in its own Node process and reports a
 * combined result. Exit code is non-zero if any file fails.
 *
 * Run with:
 *   node-portable/node-v20.18.1-win-x64/node.exe tests/run-all.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".test.js"))
  .sort();

const failures = [];

for (const file of files) {
  console.log(`\n=== ${file} ${"=".repeat(Math.max(0, 60 - file.length))}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(file);
}

console.log("\n" + "=".repeat(66));
if (failures.length === 0) {
  console.log(`All ${files.length} test files passed.`);
} else {
  console.log(`${failures.length} of ${files.length} test files FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
