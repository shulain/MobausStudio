import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT_PATH = 'scripts/verify-release-workflow.mjs';
const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const VALID_WORKFLOW = readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');

function runVerifier(workflowContent) {
  const tempDir = mkdtempSync(join(tmpdir(), 'mobaus-release-workflow-'));
  const workflowPath = join(tempDir, 'release.yml');
  writeFileSync(workflowPath, workflowContent);

  try {
    return spawnSync(process.execPath, [SCRIPT_PATH], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_WORKFLOW_PATH: workflowPath,
      },
      encoding: 'utf8',
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('accepts the current release workflow', () => {
  const result = runVerifier(VALID_WORKFLOW);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release workflow verification passed/);
});

test('rejects a workflow without the existing release guard', () => {
  const result = runVerifier(VALID_WORKFLOW.replace('gh release view "$TAG"', 'echo "$TAG"'));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing GitHub Release guard is missing/);
});

test('rejects draft creation before Apple notarization preflight', () => {
  const result = runVerifier(
    VALID_WORKFLOW.replace(
      'needs: [prepare-release, apple-notarization-preflight]',
      'needs: [prepare-release]',
    ),
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /draft release Apple preflight dependency is missing/);
});

test('rejects release builds that do not depend on draft creation', () => {
  const result = runVerifier(
    VALID_WORKFLOW.replace(
      'needs: [prepare-release, create-draft-release]',
      'needs: [prepare-release]',
    ),
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /build-desktop draft release dependency is missing/);
});
