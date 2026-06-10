import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyReleaseAssets } from './verify-release-assets.mjs';

describe('verifyReleaseAssets', () => {
  it('accepts a complete release asset set', () => {
    const result = verifyReleaseAssets([
      'MobausStudio-web.zip',
      'MobausStudio_0.9.0_aarch64.dmg',
      'MobausStudio_0.9.0_x64_en-US.msi',
      'MobausStudio_0.9.0_amd64.deb',
      'MobausStudio_0.9.0_amd64.AppImage',
      'latest.json',
      'MobausStudio_0.9.0_aarch64.app.tar.gz.sig',
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
  });

  it('rejects a release missing updater artifacts', () => {
    const result = verifyReleaseAssets([
      'MobausStudio-web.zip',
      'MobausStudio_0.9.0_aarch64.dmg',
      'MobausStudio_0.9.0_x64_en-US.msi',
      'MobausStudio_0.9.0_amd64.deb',
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.missing.map((item) => item.key),
      ['updater-manifest', 'updater-signature'],
    );
  });

  it('rejects a release missing platform artifacts', () => {
    const result = verifyReleaseAssets([
      'MobausStudio-web.zip',
      'latest.json',
      'MobausStudio_0.9.0_aarch64.app.tar.gz.sig',
    ]);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.missing.map((item) => item.key),
      ['macos', 'windows', 'linux'],
    );
  });
});
