/**
 * Aggregate report writer. Produces a markdown summary keyed by the
 * dimensions the team cares about: per-flowType agreement, new
 * decision outcomes (the signal we're optimizing), and a sampling of
 * disagreement cases.
 */
import type {
  AggregateReport,
  CaseGrade,
  RealTrafficCase,
  ReplayResult,
} from './types';

const SAMPLE_FAILURES = 25;

export function aggregateReport(
  cases: RealTrafficCase[],
  results: ReplayResult[],
  grades: CaseGrade[],
): AggregateReport {
  const total = cases.length;
  const errors = results.filter((r) => !r.ok).length;
  const ok = total - errors;
  const passed = grades.filter((g) => g.pass).length;

  // Flow-type agreement.
  const flowTypeAgreement: Record<string, { agree: number; total: number }> = {};
  for (const c of cases) {
    const r = results.find((x) => x.caseId === c.id);
    if (!r?.ok || !r.current || !c.originalFlowType) continue;
    const key = c.originalFlowType;
    flowTypeAgreement[key] ??= { agree: 0, total: 0 };
    flowTypeAgreement[key].total += 1;
    if (r.current.flowType === c.originalFlowType) {
      flowTypeAgreement[key].agree += 1;
    }
  }

  // New decision outcomes — the signal of the new accuracy work.
  const newOutcomeCounts: Record<string, number> = {};
  for (const g of grades) {
    for (const o of g.newOutcomes) {
      newOutcomeCounts[o] = (newOutcomeCounts[o] ?? 0) + 1;
    }
  }

  // Median length ratio.
  const ratios = results
    .map((r) => {
      const c = cases.find((x) => x.id === r.caseId);
      if (!r.ok || !r.current || !c) return null;
      const orig = c.originalReply.length || 1;
      return r.current.reply.length / orig;
    })
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const replyLengthMedianRatio =
    ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)] : 1;

  const sampleFailures = grades.filter((g) => !g.pass).slice(0, SAMPLE_FAILURES);

  return {
    total,
    ok,
    errors,
    passed,
    flowTypeAgreement,
    newOutcomeCounts,
    replyLengthMedianRatio,
    sampleFailures,
  };
}

export function renderMarkdownReport(
  report: AggregateReport,
  cases: RealTrafficCase[],
  results: ReplayResult[],
): string {
  const lines: string[] = [];
  lines.push('# Real-traffic accuracy report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total cases: **${report.total}**`);
  lines.push(`- Replayed OK: **${report.ok}**`);
  lines.push(`- Replay errors: **${report.errors}**`);
  lines.push(`- Agreed with original on every dimension: **${report.passed}** (${pct(report.passed, report.total)})`);
  lines.push(`- Reply length median ratio (current ÷ original): **${report.replyLengthMedianRatio.toFixed(2)}**`);
  lines.push('');
  lines.push(
    '> **Reading this report.** A "divergence" means the current engine produced a reply ' +
      'that differs materially from what the production bot said. On hallucination cases ' +
      "(refund/cancel/confirm with no order, wrong ETA, PII change request, etc.) this is " +
      'expected — the new guards catch the hallucination. Review divergences against the ' +
      'inbound message and decide whether the new behavior is an improvement or a regression.',
  );
  lines.push('');

  if (Object.keys(report.flowTypeAgreement).length > 0) {
    lines.push('## Flow-type agreement with the original bot');
    lines.push('');
    lines.push('| Flow type | Agree | Total | Rate |');
    lines.push('| --- | --: | --: | --: |');
    for (const [k, v] of Object.entries(report.flowTypeAgreement).sort()) {
      lines.push(`| ${k} | ${v.agree} | ${v.total} | ${pct(v.agree, v.total)} |`);
    }
    lines.push('');
  }

  if (Object.keys(report.newOutcomeCounts).length > 0) {
    lines.push('## New decision outcomes (signal — what the new code emitted that the original did not)');
    lines.push('');
    lines.push('| Outcome | Cases |');
    lines.push('| --- | --: |');
    const sorted = Object.entries(report.newOutcomeCounts).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [k, v] of sorted) lines.push(`| \`${k}\` | ${v} |`);
    lines.push('');
  }

  if (report.sampleFailures.length > 0) {
    lines.push(`## Sample divergences (first ${report.sampleFailures.length})`);
    lines.push('');
    lines.push(
      '_See the note at the top of the report — divergences are not necessarily failures._',
    );
    lines.push('');
    for (const g of report.sampleFailures) {
      const c = cases.find((x) => x.id === g.caseId);
      const r = results.find((x) => x.caseId === g.caseId);
      lines.push(`### ${g.caseId}`);
      lines.push('');
      if (c) {
        lines.push(`- inbound: \`${truncate(c.inboundMessage, 160)}\``);
        lines.push(`- original reply: \`${truncate(c.originalReply, 160)}\``);
        if (c.originalFlowType) lines.push(`- original flow: \`${c.originalFlowType}\``);
      }
      if (r?.current) {
        lines.push(`- current reply: \`${truncate(r.current.reply, 160)}\``);
        lines.push(`- current flow: \`${r.current.flowType}\``);
      } else if (r?.error) {
        lines.push(`- error: ${r.error}`);
      }
      const failedDims = g.dimensions.filter((d) => !d.passed);
      if (failedDims.length > 0) {
        lines.push('- failures:');
        for (const d of failedDims) {
          lines.push(`  - ${d.name}: ${d.detail ?? 'failed'}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function pct(n: number, d: number): string {
  if (d === 0) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
