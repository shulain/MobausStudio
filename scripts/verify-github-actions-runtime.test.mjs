import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT_PATH = 'scripts/verify-github-actions-runtime.mjs';

function withTempWorkflows(callback) {
  const tempDir = mkdtempSync(join(tmpdir(), 'mobaus-actions-runtime-'));

  try {
    return callback(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runVerifier(workflowsDir) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GITHUB_WORKFLOWS_DIR: workflowsDir,
    },
    encoding: 'utf8',
  });
}

test('accepts the current repository workflows', () => {
  const result = runVerifier('.github/workflows');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GitHub Actions runtime verification passed/);
});

test('rejects deprecated upload-artifact Node 20 runtime usage', () => {
  const result = withTempWorkflows((workflowsDir) => {
    writeFileSync(
      join(workflowsDir, 'ci.yml'),
      [
        'name: CI',
        'jobs:',
        '  smoke:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/upload-artifact@v4',
      ].join('\n'),
    );

    return runVerifier(workflowsDir);
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /actions\/upload-artifact@v4 uses the deprecated Node\.js 20 action runtime/);
});

test('accepts the upgraded upload-artifact action runtime', () => {
  const result = withTempWorkflows((workflowsDir) => {
    writeFileSync(
      join(workflowsDir, 'ci.yml'),
      [
        'name: CI',
        'jobs:',
        '  smoke:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/upload-artifact@v7',
      ].join('\n'),
    );

    return runVerifier(workflowsDir);
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GitHub Actions runtime verification passed/);
});
