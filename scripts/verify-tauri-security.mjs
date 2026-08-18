import { readFileSync } from 'node:fs';

const CONFIG_PATH = process.env.TAURI_CONFIG_PATH || 'src-tauri/tauri.conf.json';
const CAPABILITIES_PATH = process.env.TAURI_CAPABILITIES_PATH || 'src-tauri/capabilities/default.json';

const REQUIRED_DIRECTIVES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'object-src',
  'base-uri',
  'frame-ancestors',
];

const REQUIRED_CONNECT_SOURCES = [
  "'self'",
  'ipc:',
  'http://ipc.localhost',
  'http:',
  'https:',
  'ws:',
  'wss:',
];

const REQUIRED_CAPABILITY_PERMISSIONS = [
  'core:default',
  'core:window:allow-start-dragging',
  'opener:allow-open-url',
  'dialog:allow-open',
  'dialog:allow-save',
  'dialog:allow-message',
  'updater:allow-check',
  'updater:allow-download-and-install',
  'process:allow-restart',
];

const FORBIDDEN_CAPABILITY_PERMISSIONS = [
  'dialog:default',
  'fs:default',
  'fs:allow-read-dir',
  'fs:allow-read-file',
  'fs:allow-read-text-file',
  'fs:allow-remove',
  'fs:allow-rename',
  'fs:allow-write',
  'fs:allow-write-file',
  'opener:default',
  'opener:allow-open-path',
  'opener:allow-reveal-item-in-dir',
  'process:default',
  'process:allow-exit',
  'updater:default',
];

/**
 * 判断文件写入作用域是否过宽
 *
 * 过宽的定义：授予整个文件系统或整个用户主目录的写权限。一旦允许，
 * WebView 可覆盖 ~/.ssh/、~/.zshrc 等敏感文件。
 *
 * 收窄到主目录下的具体子树（如 `$HOME/.config/app/**`）不视为过宽 ——
 * 本规则拦截的是"整个主目录"，不是"主目录下的任何路径"。
 *
 * @param {unknown} path 作用域路径
 * @returns {boolean} 是否过宽
 */
function isOverbroadWriteScope(path) {
  if (typeof path !== 'string') {
    return false;
  }

  const normalized = path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');

  // 整个文件系统：** / * / /** / /*
  if (/^\/?\*{1,2}$/.test(normalized)) {
    return true;
  }

  // 整个用户主目录：$HOME / $HOME/* / $HOME/** / ~ 及其等价写法
  return /^(\$HOME|~)(\/\*{1,2})?$/i.test(normalized);
}

function parseCsp(csp) {
  const directives = new Map();

  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const [name, ...sources] = trimmed.split(/\s+/);
    directives.set(name, sources);
  }

  return directives;
}

function getPermissionIdentifier(permission) {
  if (typeof permission === 'string') {
    return permission;
  }

  if (permission && typeof permission === 'object' && typeof permission.identifier === 'string') {
    return permission.identifier;
  }

  return null;
}

function getScopedPermission(capability, identifier) {
  return capability?.permissions?.find(
    (permission) => permission && typeof permission === 'object' && permission.identifier === identifier,
  );
}

function verifyCapability(capability) {
  const errors = [];
  const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];
  const identifiers = permissions.map(getPermissionIdentifier).filter(Boolean);

  if (!Array.isArray(capability?.windows) || !capability.windows.includes('main')) {
    errors.push('default capability must target the main window');
  }

  for (const permission of REQUIRED_CAPABILITY_PERMISSIONS) {
    if (!identifiers.includes(permission)) {
      errors.push(`missing capability permission: ${permission}`);
    }
  }

  for (const permission of FORBIDDEN_CAPABILITY_PERMISSIONS) {
    if (identifiers.includes(permission)) {
      errors.push(`forbidden broad capability permission: ${permission}`);
    }
  }

  const writeTextPermission = getScopedPermission(capability, 'fs:allow-write-text-file');
  if (!writeTextPermission) {
    errors.push('missing scoped fs:allow-write-text-file permission');
  } else {
    const allowedPaths = Array.isArray(writeTextPermission.allow)
      ? writeTextPermission.allow.map((entry) => entry?.path).filter(Boolean)
      : [];

    if (allowedPaths.length === 0) {
      errors.push('fs:allow-write-text-file must declare allowed paths');
    }

    for (const path of allowedPaths) {
      if (typeof path !== 'string' || path.trim().length === 0) {
        errors.push('fs:allow-write-text-file has an invalid path scope');
        continue;
      }

      if (isOverbroadWriteScope(path)) {
        errors.push(`fs:allow-write-text-file must not allow overbroad scope: ${path}`);
      }
    }
  }

  return {
    errors,
    permissions: identifiers,
  };
}

export function verifyTauriSecurityConfig(config, capability) {
  const errors = [];
  const csp = config?.app?.security?.csp;

  if (typeof csp !== 'string' || csp.trim().length === 0) {
    return {
      ok: false,
      errors: ['app.security.csp must be a non-empty string'],
      directives: [],
    };
  }

  const directives = parseCsp(csp);

  for (const directive of REQUIRED_DIRECTIVES) {
    if (!directives.has(directive)) {
      errors.push(`missing CSP directive: ${directive}`);
    }
  }

  const scriptSources = directives.get('script-src') || [];
  if (!scriptSources.includes("'self'")) {
    errors.push("script-src must include 'self'");
  }
  if (scriptSources.includes("'unsafe-inline'") || scriptSources.includes("'unsafe-eval'")) {
    errors.push("script-src must not include 'unsafe-inline' or 'unsafe-eval'");
  }

  const objectSources = directives.get('object-src') || [];
  if (!objectSources.includes("'none'")) {
    errors.push("object-src must include 'none'");
  }

  const frameAncestorSources = directives.get('frame-ancestors') || [];
  if (!frameAncestorSources.includes("'none'")) {
    errors.push("frame-ancestors must include 'none'");
  }

  const connectSources = directives.get('connect-src') || [];
  for (const source of REQUIRED_CONNECT_SOURCES) {
    if (!connectSources.includes(source)) {
      errors.push(`connect-src must include ${source}`);
    }
  }

  let capabilityResult = {
    errors: ['default capability file must be provided'],
    permissions: [],
  };

  if (capability) {
    capabilityResult = verifyCapability(capability);
  }

  errors.push(...capabilityResult.errors);

  return {
    ok: errors.length === 0,
    errors,
    directives: [...directives.keys()],
    permissions: capabilityResult.permissions,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const capability = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8'));
    const result = verifyTauriSecurityConfig(config, capability);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
