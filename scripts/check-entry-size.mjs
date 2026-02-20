#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const budgets = [
  {
    name: 'server bootstrap entry',
    file: 'packages/server/src/index.ts',
    maxLines: 120,
  },
  {
    name: 'cli command entry',
    file: 'packages/cli/src/index.ts',
    maxLines: 120,
  },
  {
    name: 'ui app shell entry',
    file: 'packages/ui/src/App.tsx',
    maxLines: 300,
  },
];

const strict = process.argv.includes('--strict');

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

let hasViolation = false;

console.log('Entry-size budget check');
console.log(`Mode: ${strict ? 'strict (fail on violation)' : 'warn-only'}`);
console.log('');

for (const budget of budgets) {
  const absolutePath = resolve(process.cwd(), budget.file);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = countLines(content);
  const delta = lines - budget.maxLines;
  const status = delta > 0 ? '⚠️ over budget' : '✅ within budget';

  console.log(
    `${status}  ${budget.name}\n  - file: ${budget.file}\n  - lines: ${lines} (budget ${budget.maxLines})`
  );

  if (delta > 0) {
    hasViolation = true;
    const annotationLevel = strict ? 'error' : 'warning';
    console.log(
      `::${annotationLevel} file=${budget.file},title=Entry size budget exceeded::${budget.file} is ${lines} lines (budget ${budget.maxLines}, +${delta})`
    );
  }
}

if (hasViolation) {
  console.log('');
  console.log(
    strict
      ? 'Entry-size budget violations found (strict mode): failing.'
      : 'Entry-size budget violations found (warn-only mode).'
  );
  process.exit(strict ? 1 : 0);
}

console.log('');
console.log('All entry files are within budget.');
