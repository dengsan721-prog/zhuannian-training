import { runCommentingSimulation } from '../src/domain/commenting/commentingSimulation';

const requestedSize = Number(process.argv[2] ?? 100000);
const sampleSize = Number.isFinite(requestedSize) && requestedSize > 0
  ? Math.floor(requestedSize)
  : 100000;

const report = runCommentingSimulation({ sampleSize });

console.log(JSON.stringify(report, null, 2));

if (report.issues['safety-generated'] > 0) {
  process.exitCode = 1;
}

if (report.issues['negative-without-boundary'] > 0) {
  process.exitCode = 1;
}

if (report.issues['analysis-heavy'] > 0) {
  process.exitCode = 1;
}

if (report.issues['misplaced-praise'] > 0) {
  process.exitCode = 1;
}

if (report.issues['too-formal'] > 0) {
  process.exitCode = 1;
}

if (report.auditPassRate < 0.98) {
  process.exitCode = 1;
}
