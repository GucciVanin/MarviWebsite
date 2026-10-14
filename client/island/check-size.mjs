// Fails the build when the island is over its budget (project.md section 10.4: 60 KB gzipped including React).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 60;
const file = new URL('../public/island/ribbons.js', import.meta.url);
const kb = gzipSync(readFileSync(file)).length / 1024;

console.log(`hero island: ${kb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error(`The hero island is over its ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
