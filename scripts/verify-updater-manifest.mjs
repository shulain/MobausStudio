import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const REQUIRED_PLATFORM_GROUPS = [
  {
    key: 'macos-apple-silicon',
    description: 'macOS Apple Silicon updater entry',
    matches: (name) => /(?:darwin|macos)/i.test(name) && /(?:aarch64|arm64)/i.test(name),
  },
  {
    key: 'macos-intel',
    description: 'macOS Intel updater entry',
    matches: (name) => /(?:darwin|macos)/i.test(name) && /(?:x64|x86_64|amd64)/i.test(name),
  },
  {
    key: 'windows',
    description: 'Windows updater entry',
    matches: (name) => /(?:windows|win32|win64)/i.test(name),
  },
  {
    key: 'linux',
    description: 'Linux updater entry',
    matches: (name) => /linux/i.test(name),
  },
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemverLike(version) {
  return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

function normalizeVersion(version) {
  return version.startsWith('v') ? version.slice(1) : version;
}

function assetNameFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return basename(decodeURIComponent(parsedUrl.pathname));
  } catch {
    return basename(url.split('?')[0].split('#')[0]);
  }
}

export function verifyUpdaterManifest(manifest, options = {}) {
  const errors = [];
  const expectedVersion = options.expectedVersion;
  const releaseAssetNames = options.releaseAssetNames || [];
  const releaseAssetSet = new Set(releaseAssetNames.map((name) => name.trim()).filter(Boolean));

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      ok: false,
      errors: ['latest.json must be a JSON object'],
      checked: [],
      platforms: [],
    };
  }

  if (!isNonEmptyString(manifest.version) || !isSemverLike(manifest.version)) {
    errors.push('version must be a semantic version string');
  }

  if (
    isNonEmptyString(manifest.version)
    && isNonEmptyString(expectedVersion)
    && normalizeVersion(manifest.version) !== normalizeVersion(expectedVersion)
  ) {
    errors.push(`version must match release version ${expectedVersion}`);
  }

  if (!manifest.platforms || typeof manifest.platforms !== 'object' || Array.isArray(manifest.platforms)) {
    errors.push('platforms must be an object');
  }

  const platformEntries = manifest.platforms && typeof manifest.platforms === 'object' && !Array.isArray(manifest.platforms)
    ? Object.entries(manifest.platforms)
    : [];

  for (const [platformName, entry] of platformEntries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`platform ${platformName} must be an object`);
      continue;
    }

    if (!isNonEmptyString(entry.url)) {
      errors.push(`platform ${platformName} must include a non-empty url`);
    } else if (releaseAssetSet.size > 0) {
      const urlAssetName = assetNameFromUrl(entry.url);
      if (!releaseAssetSet.has(urlAssetName)) {
        errors.push(`platform ${platformName} url asset is missing from release assets: ${urlAssetName}`);
      }
    }

    if (!isNonEmptyString(entry.signature)) {
      errors.push(`platform ${platformName} must include a non-empty signature`);
    }
  }

  const missing = REQUIRED_PLATFORM_GROUPS.filter(
    (group) => !platformEntries.some(([platformName, entry]) => (
      group.matches(platformName)
      && entry
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && isNonEmptyString(entry.url)
      && isNonEmptyString(entry.signature)
    )),
  );

  for (const group of missing) {
    errors.push(`missing ${group.description}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    checked: REQUIRED_PLATFORM_GROUPS.map((group) => group.key),
    platforms: platformEntries.map(([platformName]) => platformName),
  };
}

function readManifestFromCli(argv) {
  const manifestFile = argv[2];
  if (!manifestFile) {
    throw new Error('Usage: node scripts/verify-updater-manifest.mjs <latest-json-file> [expected-version] [asset-names-file]');
  }

  const expectedVersion = argv[3];
  const assetNamesFile = argv[4];
  const releaseAssetNames = assetNamesFile
    ? readFileSync(assetNamesFile, 'utf8').split(/\r?\n/)
    : [];

  return {
    manifest: JSON.parse(readFileSync(manifestFile, 'utf8')),
    options: {
      expectedVersion,
      releaseAssetNames,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { manifest, options } = readManifestFromCli(process.argv);
    const result = verifyUpdaterManifest(manifest, options);
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
