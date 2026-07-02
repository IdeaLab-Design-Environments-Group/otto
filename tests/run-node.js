/**
 * Headless test runner: `node tests/run-node.js` (or `npm test`).
 * Imports every module in the manifest (which registers tests via
 * tests/harness.js), runs them, prints totals, exits non-zero on failure.
 */
import { TEST_MODULES } from './manifest.js';

for (const path of TEST_MODULES) {
    console.log(`\n${path}`);
    await import(path);
}

const { runAll } = await import('./harness.js');
const results = await runAll();

console.log(`\n${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0) {
    process.exit(1);
}
