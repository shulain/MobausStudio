import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./verify-release-version.mjs', import.meta.url));

function createFixture({ packageVersion, tauriVersion }) {
  const root = mkdtempSync(join(tmpdir(), 'mobaus-release-version-'));
  mkdirSync(join(root, 'src-tauri'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'mobaus-studio', version: packageVersion }, null, 2),
  );
  writeFileSync(
    join(root, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({ productName: 'MobausStudio', version: tauriVersion }, null, 2),
  );
  return root;
}

function runVerifier(root, expectedVersion) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOBAUS_RELEASE_ROOT: root,
      ...(expectedVersion ? { EXPECTED_RELEASE_VERSION: expectedVersion } : {}),
    },
  });
}

test('accepts matching release versions', () => {
  const root = createFixture({ packageVersion: '1.2.3', tauriVersion: '1.2.3' });
  try {
    const result = runVerifier(root, '1.2.3');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release version OK: 1\.2\.3/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects dev versions', () => {
  const root = createFixture({ packageVersion: '0.0.0-dev', tauriVersion: '0.0.0-dev' });
  try {
    const result = runVerifier(root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dev version cannot be packaged for release/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects mismatched package and Tauri versions', () => {
  const root = createFixture({ packageVersion: '1.2.3', tauriVersion: '1.2.4' });
  try {
    const result = runVerifier(root);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /version mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects versions that do not match the release input', () => {
  const root = createFixture({ packageVersion: '1.2.3', tauriVersion: '1.2.3' });
  try {
    const result = runVerifier(root, '1.2.4');

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /version does not match release input\/tag/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
