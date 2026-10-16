// Print a compact summary of one Lighthouse JSON report, or compare two.
//
//   npm run lh:summary -- lighthouse/lighthouse-before.json
//   npm run lh:summary -- lighthouse/lighthouse-before.json lighthouse/lighthouse-after.json
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/lh-summary.mjs <report.json> [<after.json>]');
  process.exit(1);
}
const reports = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));

const METRICS = [
  ['Performance score', (r) => Math.round(r.categories.performance.score * 100), ''],
  ['FCP', (r) => r.audits['first-contentful-paint'].numericValue / 1000, 's'],
  ['LCP', (r) => r.audits['largest-contentful-paint'].numericValue / 1000, 's'],
  ['TBT (lab proxy for INP)', (r) => r.audits['total-blocking-time'].numericValue, 'ms'],
  ['CLS', (r) => r.audits['cumulative-layout-shift'].numericValue, ''],
  ['Speed Index', (r) => r.audits['speed-index'].numericValue / 1000, 's'],
  ['Total transfer size', (r) => r.audits['total-byte-weight'].numericValue / 1048576, 'MB'],
  ['Requests', (r) => (r.audits['network-requests']?.details?.items || []).length, ''],
  ['Main-thread work', (r) => r.audits['mainthread-work-breakdown']?.numericValue / 1000, 's'],
];

const fmt = (v, unit) => (v == null || Number.isNaN(v) ? 'n/a'
  : (unit === 's' || unit === 'MB' ? v.toFixed(2) : unit === '' && v < 1 && v > 0 ? v.toFixed(3) : Math.round(v)) + (unit ? ' ' + unit : ''));

const r0 = reports[0];
console.log(`URL: ${r0.finalDisplayedUrl}  |  form factor: ${r0.configSettings.formFactor}  |  throttling: ${r0.configSettings.throttlingMethod}  |  Lighthouse ${r0.lighthouseVersion}`);
console.log('');
console.log(['Metric', ...files.map((f) => f.split('/').pop())].join(' | '));
for (const [label, get, unit] of METRICS) {
  console.log([label, ...reports.map((r) => fmt(get(r), unit))].join(' | '));
}

// Failing / warning audits (incl. LH 13 insights), sorted by estimated savings
const last = reports[reports.length - 1];
const perfIds = new Set(last.categories.performance.auditRefs.map((a) => a.id));
const issues = Object.values(last.audits)
  .filter((a) => perfIds.has(a.id) && a.score !== null && a.score < 0.9 && !['notApplicable', 'manual'].includes(a.scoreDisplayMode))
  .map((a) => {
    const ms = Math.max(0, ...Object.values(a.metricSavings || {}).filter((v) => typeof v === 'number'));
    const bytes = a.details?.overallSavingsBytes || 0;
    return { id: a.id, title: a.title, value: a.displayValue || '', ms, bytes };
  })
  .sort((a, b) => b.ms - a.ms || b.bytes - a.bytes);

console.log('');
console.log(`Issues in ${files[files.length - 1].split('/').pop()} (score < 0.9):`);
for (const i of issues) {
  const save = [i.ms ? `~${Math.round(i.ms)} ms` : '', i.bytes ? `~${(i.bytes / 1024).toFixed(0)} KiB` : ''].filter(Boolean).join(', ');
  console.log(`- [${i.id}] ${i.title}${i.value ? ' — ' + i.value : ''}${save ? ' (savings ' + save + ')' : ''}`);
}

// Main-thread breakdown and the heaviest requests
const mt = last.audits['mainthread-work-breakdown']?.details?.items || [];
if (mt.length) {
  console.log('');
  console.log('Main-thread work: ' + mt.slice(0, 6).map((i) => `${i.groupLabel} ${Math.round(i.duration)} ms`).join(', '));
}
const req = (last.audits['network-requests']?.details?.items || []).slice().sort((a, b) => b.transferSize - a.transferSize);
if (req.length) {
  console.log('');
  console.log('Largest requests:');
  for (const r of req.slice(0, 10)) {
    console.log(`- ${(r.transferSize / 1024).toFixed(0)} KiB  ${r.resourceType || ''}  ${r.url.replace(/^https?:\/\/[^/]+\//, '')}`);
  }
}
const lcpEl = last.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node
  || last.audits['lcp-breakdown-insight']?.details?.items?.find?.((i) => i.type === 'node');
if (lcpEl) console.log('\nLCP element: ' + (lcpEl.snippet || lcpEl.selector || JSON.stringify(lcpEl).slice(0, 120)));
