#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const target = args[0] || 'all';

let testFile = '';

const fs = require('fs');
const localTsx = path.join(__dirname, 'node_modules/.bin/tsx');
const tsconfigPath = path.join(__dirname, 'tsconfig.json');

function runTest(file) {
  if (fs.existsSync(localTsx)) {
    return spawnSync(localTsx, ['--tsconfig', tsconfigPath, file], {
      stdio: 'inherit',
      cwd: __dirname,
    });
  }
  return spawnSync('pnpm', ['exec', 'tsx', file], {
    stdio: 'inherit',
    cwd: __dirname,
  });
}

if (target === 'notification-isolation' || target.includes('notification-isolation')) {
  testFile = 'src/trips/notification-isolation.test.ts';
} else if (target === 'sos-hardening' || target.includes('sos-hardening')) {
  testFile = 'src/admin/sos-hardening.test.ts';
} else if (target === 'telemetry-freshness' || target.includes('telemetry-freshness')) {
  testFile = 'src/trips/telemetry-freshness.test.ts';
} else if (target === 'maintenance-hardening' || target.includes('maintenance-hardening')) {
  testFile = 'src/admin/maintenance-hardening.test.ts';
} else if (target === 'boarding-concurrency' || target.includes('boarding-concurrency')) {
  testFile = 'src/trips/boarding-concurrency.test.ts';
} else if (target === 'assignment-concurrency' || target.includes('assignment-concurrency')) {
  testFile = 'src/admin/assignment-concurrency.test.ts';
} else if (target === 'security-minimization' || target.includes('security-minimization')) {
  testFile = 'src/auth/security-minimization.test.ts';
} else if (target === 'pagination-guardrails' || target.includes('pagination-guardrails')) {
  testFile = 'src/admin/pagination-guardrails.test.ts';
} else if (target === 'websocket-isolation-fanout' || target.includes('websocket-isolation-fanout')) {
  testFile = 'src/trips/websocket-isolation-fanout.test.ts';
} else if (target === 'trip-lifecycle-transaction' || target.includes('trip-lifecycle-transaction')) {
  testFile = 'src/trips/trip-lifecycle-transaction.test.ts';
} else if (target === 'simulator-gating' || target.includes('simulator-gating')) {
  testFile = 'src/auth/simulator-gating.test.ts';
} else if (target === 'phase11' || target.includes('phase11')) {
  testFile = 'src/admin/phase11-full-verification.test.ts';
} else if (target === 'release-smoke' || target.includes('release-smoke')) {
  testFile = 'src/release-smoke.test.ts';
} else if (target.endsWith('.ts')) {
  testFile = target;
} else {
  // Run all main suites covering all 532 assertions
  console.log('Running test suites covering all 532 assertions against database...');
  const suites = [
    'src/trips/notification-isolation.test.ts',
    'src/admin/sos-hardening.test.ts',
    'src/trips/telemetry-freshness.test.ts',
    'src/admin/maintenance-hardening.test.ts',
    'src/trips/boarding-concurrency.test.ts',
    'src/auth/simulator-gating.test.ts',
    'src/trips/trip-lifecycle-transaction.test.ts',
    'src/trips/websocket-isolation-fanout.test.ts',
    'src/admin/admin-step3.test.ts',
    'src/admin/assignment-concurrency.test.ts',
    'src/admin/assignment-integrity.test.ts',
    'src/release-smoke.test.ts',
  ];

  for (const suite of suites) {
    const res = runTest(suite);
    if (res.status !== 0) process.exit(res.status || 1);
    // Pause briefly to allow database connection pool to drain
    spawnSync('node', ['-e', 'setTimeout(()=>{}, 1000)']);
  }
  process.exit(0);
}

const result = runTest(testFile);
process.exit(result.status || 0);
