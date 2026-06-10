import { readFileSync } from 'node:fs';

const CONFIG_PATH = process.env.TAURI_CONFIG_PATH || 'src-tauri/tauri.conf.json';

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

export function verifyTauriSecurityConfig(config) {
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

  return {
    ok: errors.length === 0,
    errors,
    directives: [...directives.keys()],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const result = verifyTauriSecurityConfig(config);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
