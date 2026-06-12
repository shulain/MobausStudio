import { readFileSync } from 'node:fs';

const WORKFLOW_PATH = process.env.RELEASE_WORKFLOW_PATH || '.github/workflows/release.yml';
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

function fail(message) {
  console.error(`Release workflow verification failed: ${message}`);
  process.exitCode = 1;
}

function assertIncludes(haystack, needle, description) {
  if (!haystack.includes(needle)) {
    fail(`${description} is missing`);
  }
}

function assertOrder(haystack, first, second, description) {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);

  if (firstIndex === -1 || secondIndex === -1) {
    fail(`${description} could not be checked because a required marker is missing`);
    return;
  }

  if (firstIndex > secondIndex) {
    fail(`${description} has the wrong order`);
  }
}

function jobBlock(jobName) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) {
    fail(`job '${jobName}' is missing`);
    return '';
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

assertIncludes(
  workflow,
  'group: release-${{ github.event.inputs.version || github.ref_name }}',
  'release concurrency group',
);
assertIncludes(workflow, 'cancel-in-progress: false', 'release concurrency non-cancel policy');

const prepareRelease = jobBlock('prepare-release');
assertIncludes(prepareRelease, 'contents: read', 'prepare-release read-only contents permission');
assertIncludes(prepareRelease, '验证发布目标未存在', 'duplicate release target guard');
assertIncludes(prepareRelease, 'gh release view "$TAG"', 'existing GitHub Release guard');
assertIncludes(prepareRelease, 'git/ref/tags/${TAG}', 'existing Git tag guard');
if (prepareRelease.includes('softprops/action-gh-release') || prepareRelease.includes('- name: 创建 Draft Release')) {
  fail('prepare-release must not create the draft release');
}

const applePreflight = jobBlock('apple-notarization-preflight');
assertIncludes(applePreflight, 'needs: [prepare-release]', 'Apple preflight dependency');
assertIncludes(applePreflight, 'runs-on: macos-latest', 'Apple preflight macOS runner');
assertIncludes(applePreflight, 'xcrun notarytool history', 'Apple notarization availability check');

const createDraft = jobBlock('create-draft-release');
assertIncludes(
  createDraft,
  'needs: [prepare-release, apple-notarization-preflight]',
  'draft release Apple preflight dependency',
);
assertIncludes(createDraft, 'contents: write', 'draft release write permission');
assertIncludes(createDraft, '创建 Draft Release', 'draft release creation step');

for (const jobName of ['build-desktop', 'build-web', 'build-docker']) {
  const block = jobBlock(jobName);
  assertIncludes(
    block,
    'needs: [prepare-release, create-draft-release]',
    `${jobName} draft release dependency`,
  );
}

const buildDesktop = jobBlock('build-desktop');
assertIncludes(
  buildDesktop,
  '公证并装订 macOS DMG',
  'macOS DMG notarization and stapling step',
);
assertIncludes(
  buildDesktop,
  'bash scripts/notarize-macos-dmgs.sh "${{ matrix.target }}" "v${{ steps.version.outputs.version }}"',
  'macOS DMG notarization and stapling command',
);
assertIncludes(
  buildDesktop,
  '验证 macOS 签名与公证产物',
  'macOS distribution signing verifier step',
);
assertIncludes(
  buildDesktop,
  'npm run verify:macos-distribution -- "${{ matrix.target }}"',
  'macOS distribution signing verifier command',
);
assertOrder(
  buildDesktop,
  'uses: tauri-apps/tauri-action@v0',
  '公证并装订 macOS DMG',
  'macOS DMG notarization after Tauri build',
);
assertOrder(
  buildDesktop,
  '公证并装订 macOS DMG',
  '验证 macOS 签名与公证产物',
  'macOS distribution verification after DMG notarization',
);

const buildDocker = jobBlock('build-docker');
assertIncludes(buildDocker, 'timeout-minutes: 20', 'release Docker build verification timeout');
assertIncludes(
  buildDocker,
  'platforms: linux/amd64,linux/arm64',
  'release Docker build verification platforms',
);
assertIncludes(
  buildDocker,
  'outputs: type=cacheonly',
  'release Docker multi-arch verification output',
);

const publishRelease = jobBlock('publish-release');
assertIncludes(
  publishRelease,
  'needs: [prepare-release, create-draft-release, build-desktop, build-web, build-docker]',
  'publish release dependency chain',
);
assertIncludes(publishRelease, '推送 Docker 镜像', 'publish-time Docker push');
assertIncludes(publishRelease, 'timeout-minutes: 20', 'publish-time Docker push timeout');
assertIncludes(publishRelease, 'platforms: linux/amd64,linux/arm64', 'publish-time Docker push platforms');
assertIncludes(publishRelease, '验证 Draft Release 资产完整性', 'release asset completeness guard');
assertIncludes(publishRelease, 'npm run verify:release-assets', 'release asset verifier command');
assertIncludes(publishRelease, 'npm run verify:updater-manifest', 'updater manifest verifier command');
assertIncludes(publishRelease, '发布 Draft Release', 'draft release publish step');
assertOrder(
  publishRelease,
  '验证 Draft Release 资产完整性',
  '推送 Docker 镜像',
  'release asset verification before Docker push',
);
assertOrder(
  publishRelease,
  '推送 Docker 镜像',
  '发布 Draft Release',
  'Docker push before draft publication',
);

const cleanupReleaseDraft = jobBlock('cleanup-release-draft');
assertIncludes(
  cleanupReleaseDraft,
  'needs: [prepare-release, create-draft-release, build-desktop, build-web, build-docker, publish-release]',
  'cleanup dependency chain',
);
assertIncludes(cleanupReleaseDraft, '${{ failure() || cancelled() }}', 'cleanup failure/cancel condition');
assertIncludes(cleanupReleaseDraft, 'deleteRelease', 'failed draft release cleanup');
assertIncludes(cleanupReleaseDraft, "context.eventName === 'workflow_dispatch'", 'workflow_dispatch tag cleanup guard');
assertIncludes(cleanupReleaseDraft, 'deleteRef', 'failed workflow_dispatch tag cleanup');
assertIncludes(cleanupReleaseDraft, 'error.status === 422', 'missing tag cleanup 422 guard');
assertIncludes(cleanupReleaseDraft, 'Reference does not exist', 'missing tag cleanup 422 message guard');

if (process.exitCode) {
  process.exit();
}

console.log('Release workflow verification passed');
