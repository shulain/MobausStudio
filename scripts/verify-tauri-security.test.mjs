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

describe('verifyTauriSecurityConfig', () => {
  it('accepts the production CSP contract', () => {
    const result = verifyTauriSecurityConfig(validConfig);

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
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /app\.security\.csp must be a non-empty string/);
  });

  it('rejects unsafe script sources', () => {
    const config = structuredClone(validConfig);
    config.app.security.csp = config.app.security.csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'");

    const result = verifyTauriSecurityConfig(config);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /script-src must not include/);
  });

  it('rejects CSP without Tauri IPC connect sources', () => {
    const config = structuredClone(validConfig);
    config.app.security.csp = config.app.security.csp.replace('ipc: http://ipc.localhost ', '');

    const result = verifyTauriSecurityConfig(config);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /connect-src must include ipc:/);
    assert.match(result.errors.join('\n'), /connect-src must include http:\/\/ipc\.localhost/);
  });
});
