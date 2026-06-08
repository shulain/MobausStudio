import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultRoot = resolve(import.meta.dirname, '..');
const root = resolve(process.env.MOBAUS_RELEASE_ROOT || defaultRoot);

function readJson(relativePath) {
  const fullPath = resolve(root, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

function fail(message) {
  console.error(`[verify-release-version] ${message}`);
  process.exitCode = 1;
}

const packageJson = readJson('package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');

const packageVersion = String(packageJson.version ?? '').trim();
const tauriVersion = String(tauriConfig.version ?? '').trim();
const expectedVersion = String(process.env.EXPECTED_RELEASE_VERSION ?? '').trim();
const releaseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

if (!releaseVersionPattern.test(packageVersion)) {
  fail(`package.json version is not a release version: "${packageVersion}"`);
}

if (!releaseVersionPattern.test(tauriVersion)) {
  fail(`src-tauri/tauri.conf.json version is not a release version: "${tauriVersion}"`);
}

if (packageVersion !== tauriVersion) {
  fail(`version mismatch: package.json=${packageVersion}, tauri.conf.json=${tauriVersion}`);
}

if (packageVersion === '0.0.0-dev' || packageVersion.endsWith('-dev') || packageVersion.includes('.dev')) {
  fail(`dev version cannot be packaged for release: "${packageVersion}"`);
}

if (expectedVersion && packageVersion !== expectedVersion) {
  fail(`version does not match release input/tag: expected=${expectedVersion}, actual=${packageVersion}`);
}

if (process.exitCode) {
  process.exit();
}

console.log(`[verify-release-version] release version OK: ${packageVersion}`);
