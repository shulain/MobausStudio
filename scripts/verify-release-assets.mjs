import { readFileSync } from 'node:fs';

const REQUIRED_ASSET_GROUPS = [
  {
    key: 'web',
    description: 'Web zip artifact',
    matches: (name) => name === 'MobausStudio-web.zip',
  },
  {
    key: 'macos-apple-silicon',
    description: 'macOS Apple Silicon DMG artifact',
    matches: (name) => name.endsWith('.dmg') && /(?:aarch64|arm64)/i.test(name),
  },
  {
    key: 'macos-intel',
    description: 'macOS Intel DMG artifact',
    matches: (name) => name.endsWith('.dmg') && /(?:x64|x86_64|amd64)/i.test(name),
  },
  {
    key: 'windows',
    description: 'Windows installer artifact',
    matches: (name) => name.endsWith('.msi') || name.endsWith('.exe'),
  },
  {
    key: 'linux',
    description: 'Linux installer artifact',
    matches: (name) => name.endsWith('.deb') || name.endsWith('.rpm') || name.endsWith('.AppImage'),
  },
  {
    key: 'updater-manifest',
    description: 'Tauri updater manifest',
    matches: (name) => name === 'latest.json',
  },
  {
    key: 'updater-signature',
    description: 'Tauri updater signature',
    matches: (name) => name.endsWith('.sig'),
  },
];

export function verifyReleaseAssets(assetNames) {
  const names = assetNames.map((name) => name.trim()).filter(Boolean);
  const missing = REQUIRED_ASSET_GROUPS.filter(
    (group) => !names.some((name) => group.matches(name)),
  );

  return {
    ok: missing.length === 0,
    checked: REQUIRED_ASSET_GROUPS.map((group) => group.key),
    missing: missing.map((group) => ({
      key: group.key,
      description: group.description,
    })),
    assets: names,
  };
}

function readAssetNamesFromCli(argv) {
  const assetFile = argv[2];
  if (!assetFile) {
    throw new Error('Usage: node scripts/verify-release-assets.mjs <asset-names-file>');
  }

  return readFileSync(assetFile, 'utf8').split(/\r?\n/);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = verifyReleaseAssets(readAssetNamesFromCli(process.argv));
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
