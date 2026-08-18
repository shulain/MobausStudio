import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTauriSecurityConfig } from './verify-tauri-security.mjs';

const validConfig = {
  app: {
    security: {
      csp: [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' asset: http://asset.localhost data: blob: http: https:",
        "font-src 'self' data:",
        "connect-src 'self' ipc: http://ipc.localhost http: https: ws: wss:",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  },
};

const validCapability = {
  identifier: 'default',
  windows: ['main'],
  permissions: [
    'core:default',
    'core:window:allow-start-dragging',
    'opener:allow-open-url',
    'dialog:allow-open',
    'dialog:allow-save',
    'dialog:allow-message',
    'updater:allow-check',
    'updater:allow-download-and-install',
    'process:allow-restart',
    {
      identifier: 'fs:allow-write-text-file',
      allow: [
        { path: '$DESKTOP/**' },
        { path: '$DOWNLOAD/**' },
        { path: '$DOCUMENT/**' },
      ],
    },
  ],
};

describe('verifyTauriSecurityConfig', () => {
  it('accepts the production CSP contract', () => {
    const result = verifyTauriSecurityConfig(validConfig, validCapability);

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a disabled CSP', () => {
    const result = verifyTauriSecurityConfig({
      app: {
        security: {
          csp: null,
        },
      },
    }, validCapability);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /app\.security\.csp must be a non-empty string/);
  });

  it('rejects unsafe script sources', () => {
    const config = structuredClone(validConfig);
    config.app.security.csp = config.app.security.csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'");

    const result = verifyTauriSecurityConfig(config, validCapability);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /script-src must not include/);
  });

  it('rejects CSP without Tauri IPC connect sources', () => {
    const config = structuredClone(validConfig);
    config.app.security.csp = config.app.security.csp.replace('ipc: http://ipc.localhost ', '');

    const result = verifyTauriSecurityConfig(config, validCapability);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /connect-src must include ipc:/);
    assert.match(result.errors.join('\n'), /connect-src must include http:\/\/ipc\.localhost/);
  });

  it('rejects broad default Tauri plugin permissions', () => {
    const capability = structuredClone(validCapability);
    capability.permissions.push('fs:default', 'dialog:default', 'opener:default', 'updater:default');

    const result = verifyTauriSecurityConfig(validConfig, capability);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /forbidden broad capability permission: fs:default/);
    assert.match(result.errors.join('\n'), /forbidden broad capability permission: dialog:default/);
    assert.match(result.errors.join('\n'), /forbidden broad capability permission: opener:default/);
    assert.match(result.errors.join('\n'), /forbidden broad capability permission: updater:default/);
  });

  const withWriteScope = (...paths) => {
    const capability = structuredClone(validCapability);
    const writeTextPermission = capability.permissions.find(
      (permission) => permission.identifier === 'fs:allow-write-text-file',
    );
    writeTextPermission.allow.push(...paths.map((path) => ({ path })));
    return capability;
  };

  it('rejects arbitrary filesystem path scopes', () => {
    const result = verifyTauriSecurityConfig(validConfig, withWriteScope('**'));

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /must not allow overbroad scope: \*\*/);
  });

  // 收窄 fs 作用域后的回归防护：$HOME/** 曾是本文件的"合法样例"，
  // 门禁必须能拦住它被改回，否则 S4 的修复可以被无声撤销
  for (const scope of ['$HOME/**', '$HOME/*', '$HOME', '$home/**', '~/**', '~', '/**', '/*', '*']) {
    it(`rejects the overbroad write scope ${scope}`, () => {
      const result = verifyTauriSecurityConfig(validConfig, withWriteScope(scope));

      assert.equal(result.ok, false);
      assert.match(result.errors.join('\n'), /must not allow overbroad scope/);
    });
  }

  // 过宽的判定是"整个主目录"，不是"主目录下的任何路径"
  for (const scope of ['$HOME/.claude/**', '$HOME/.codex/**', '$APPDATA/**']) {
    it(`accepts the narrowed write scope ${scope}`, () => {
      const result = verifyTauriSecurityConfig(validConfig, withWriteScope(scope));

      assert.equal(result.ok, true);
      assert.deepEqual(result.errors, []);
    });
  }

  it('rejects a write scope that is only whitespace', () => {
    const result = verifyTauriSecurityConfig(validConfig, withWriteScope('   '));

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /has an invalid path scope/);
  });

  it('requires the exact runtime permissions used by the desktop shell', () => {
    const capability = structuredClone(validCapability);
    capability.permissions = capability.permissions.filter((permission) => permission !== 'opener:allow-open-url');

    const result = verifyTauriSecurityConfig(validConfig, capability);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /missing capability permission: opener:allow-open-url/);
  });
});
