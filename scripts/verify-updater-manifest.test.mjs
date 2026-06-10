import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyUpdaterManifest } from './verify-updater-manifest.mjs';

const completeManifest = {
  version: '0.9.0',
  notes: 'Release notes',
  pub_date: '2026-06-10T00:00:00Z',
  platforms: {
    'darwin-aarch64': {
      signature: 'apple-silicon-signature',
      url: 'https://github.com/shulain/MobausStudio/releases/download/v0.9.0/MobausStudio_0.9.0_aarch64.app.tar.gz',
    },
    'darwin-x86_64': {
      signature: 'intel-signature',
      url: 'https://github.com/shulain/MobausStudio/releases/download/v0.9.0/MobausStudio_0.9.0_x64.app.tar.gz',
    },
    'windows-x86_64': {
      signature: 'windows-signature',
      url: 'https://github.com/shulain/MobausStudio/releases/download/v0.9.0/MobausStudio_0.9.0_x64-setup.exe',
    },
    'linux-x86_64': {
      signature: 'linux-signature',
      url: 'https://github.com/shulain/MobausStudio/releases/download/v0.9.0/MobausStudio_0.9.0_amd64.AppImage.tar.gz',
    },
  },
};

describe('verifyUpdaterManifest', () => {
  const completeAssetNames = [
    'MobausStudio_0.9.0_aarch64.app.tar.gz',
    'MobausStudio_0.9.0_x64.app.tar.gz',
    'MobausStudio_0.9.0_x64-setup.exe',
    'MobausStudio_0.9.0_amd64.AppImage.tar.gz',
  ];

  it('accepts a complete updater manifest', () => {
    const result = verifyUpdaterManifest(completeManifest);

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('accepts a manifest matching the release version and release asset list', () => {
    const result = verifyUpdaterManifest(completeManifest, {
      expectedVersion: '0.9.0',
      releaseAssetNames: completeAssetNames,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects missing platform groups', () => {
    const result = verifyUpdaterManifest({
      version: '0.9.0',
      platforms: {
        'darwin-aarch64': completeManifest.platforms['darwin-aarch64'],
        'windows-x86_64': completeManifest.platforms['windows-x86_64'],
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /missing macOS Intel updater entry/);
    assert.match(result.errors.join('\n'), /missing Linux updater entry/);
  });

  it('rejects platform entries without signatures', () => {
    const manifest = structuredClone(completeManifest);
    manifest.platforms['linux-x86_64'].signature = '';

    const result = verifyUpdaterManifest(manifest);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /platform linux-x86_64 must include a non-empty signature/);
    assert.match(result.errors.join('\n'), /missing Linux updater entry/);
  });

  it('rejects invalid versions', () => {
    const result = verifyUpdaterManifest({
      ...completeManifest,
      version: 'latest',
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /version must be a semantic version string/);
  });

  it('rejects a manifest version that does not match the release version', () => {
    const result = verifyUpdaterManifest(completeManifest, {
      expectedVersion: '0.9.1',
      releaseAssetNames: completeAssetNames,
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /version must match release version 0.9.1/);
  });

  it('rejects updater URLs that do not point to release assets', () => {
    const result = verifyUpdaterManifest(completeManifest, {
      expectedVersion: '0.9.0',
      releaseAssetNames: completeAssetNames.filter((name) => name !== 'MobausStudio_0.9.0_x64.app.tar.gz'),
    });

    assert.equal(result.ok, false);
    assert.match(
      result.errors.join('\n'),
      /platform darwin-x86_64 url asset is missing from release assets: MobausStudio_0.9.0_x64.app.tar.gz/,
    );
  });
});
