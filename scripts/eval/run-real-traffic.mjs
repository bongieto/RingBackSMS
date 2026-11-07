#!/usr/bin/env node
// @ts-check
/**
 * Real-traffic accuracy eval CLI.
 *
 * Usage:
 *   pnpm eval:replay <input.ndjson> [--out <report.md>] [--mode strict|mock]
 *
 * Where <input.ndjson> is an Axiom export (one JSON object per line). See
 * scripts/eval/fixtures/sample-axiom-export.ndjson for the wire format and
 * packages/flow-engine/src/eval/types.ts for the full schema.
 *
 * Defaults:
 *   --out   stdout (suppresses progress logs to stderr to keep stdout clean)
 *   --mode  strict (chatFn returns the recorded reply, so the report measures
 *           only post-LLM machinery — guards, fact verifier, decision tagging)
 *
 * This script intentionally lives outside the flow-engine package so the
 * core lib has no Node-fs dependency. It imports the compiled JS from
 * `@ringback/flow-engine/eval` and pipes a file through it.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  aggregateReport,
  gradeCase,
  parseNdjson,
  renderMarkdownReport,
  replayCase,
} from '@ringback/flow-engine/eval';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { input: undefined, out: undefined, mode: 'strict' };
  const positionals = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') {
      args.out = argv[++i];
    } else if (a === '--mode') {
      args.mode = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      positionals.push(a);
    }
  }
  args.input = positionals[0];
  return args;
}

function printHelp() {
  process.stdout.write(`Usage: pnpm eval:replay <input.ndjson> [--out <report.md>] [--mode strict|mock]

Replays a real-traffic Axiom export through the current flow engine and
writes a markdown report.

Options:
  --out, -o <path>   Write report to file instead of stdout.
  --mode <mode>      'strict' (default) replays the recorded reply through
                     post-LLM machinery; 'mock' uses canned LLM shapes.
  --help, -h         Show this help.
`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (e) {
    process.stderr.write(`${e.message}\n\n`);
    printHelp();
    process.exit(2);
  }
  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }
  if (args.mode !== 'strict' && args.mode !== 'mock') {
    process.stderr.write(`--mode must be 'strict' or 'mock', got ${JSON.stringify(args.mode)}\n`);
    process.exit(2);
  }

  const absInput = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(absInput)) {
    process.stderr.write(`Input not found: ${absInput}\n`);
    process.exit(2);
  }
  const content = fs.readFileSync(absInput, 'utf8');
  const { cases, errors } = parseNdjson(content);

  if (errors.length > 0) {
    process.stderr.write(`[eval] ${errors.length} parse errors (showing first 5):\n`);
    for (const e of errors.slice(0, 5)) {
      process.stderr.write(`  line ${e.lineNumber}: ${e.reason}\n`);
    }
  }
  process.stderr.write(`[eval] replaying ${cases.length} cases (mode=${args.mode})\n`);

  const results = [];
  const grades = [];
  let i = 0;
  for (const c of cases) {
    const r = await replayCase(c, { mode: args.mode });
    results.push(r);
    grades.push(gradeCase(c, r));
    i++;
    if (i % 50 === 0) {
      process.stderr.write(`[eval] ${i}/${cases.length}\n`);
    }
  }

  const report = aggregateReport(cases, results, grades);
  const md = renderMarkdownReport(report, cases, results);

  if (args.out) {
    const absOut = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, md, 'utf8');
    process.stderr.write(`[eval] wrote ${absOut}\n`);
  } else {
    process.stdout.write(md);
  }

  // Exit 0 always — the report is the output, not a pass/fail signal.
  // (Add --threshold flag later if CI gating becomes useful.)
}

main().catch((err) => {
  process.stderr.write(`[eval] fatal: ${err.stack ?? err.message ?? err}\n`);
  process.exit(1);
});
