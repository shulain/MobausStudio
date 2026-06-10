# Production Readiness Evidence

Last updated: 2026-06-10, Asia/Shanghai.

This document records the current production-readiness boundary for MobausStudio. It is an evidence index, not a replacement for CI or the Release workflow.

## Current status

Repository-side release hardening is in place and verified. CI now covers the Web production browser smoke path, Docker Web image smoke, npm dependency audit, RustSec/Rust checks, and local macOS `.app` bundle construction.

The remaining blocker is external to this repository:

```text
Apple notarization preflight failed. Check Apple Developer Program agreements and APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID secrets.
```

Do not mark the project as fully production-ready until a Release workflow run completes after Apple Developer / App Store Connect agreements and notarization credentials are valid.

## Verified evidence

Recent repository CI evidence:

```bash
gh run view 27243589318
```

Expected result:

```text
test: success
web-production-smoke: success
docker-web-smoke: success
rust-check: success
```

The `test` job includes:

```text
npm audit --audit-level=moderate
npm run verify:release-workflow
npm run test:release-workflow
npm run test:release-version
npm test
npm run build
```

Release duplicate-version guard evidence:

```bash
gh run view 27241568114
```

Expected result:

```text
prepare-release: failure
reason: Git tag v0.8.6 already exists
apple-notarization-preflight: skipped
create-draft-release: skipped
build-desktop/build-web/build-docker: skipped
publish-release: skipped
```

Release Apple preflight fast-fail evidence:

```bash
gh run view 27241622792
```

Expected result:

```text
prepare-release: success
apple-notarization-preflight: failure
create-draft-release: skipped
build-desktop/build-web/build-docker: skipped
cleanup-release-draft: success
publish-release: skipped
```

Failed release cleanup evidence:

```bash
gh release view v0.8.7-9 --json tagName,isDraft,url 2>&1 || true
git ls-remote --tags origin 'v0.8.7-9'
```

Expected result:

```text
release not found
no remote tag output
```

## Release guardrails

The Release workflow currently enforces these guardrails:

- Target release and tag must not already exist.
- Concurrent releases for the same target version are serialized.
- Apple notarization availability is checked before any Draft Release is created.
- Desktop, Web, and Docker release jobs depend on Draft Release creation.
- Docker image push only happens in `publish-release`, after all release gates pass.
- Failed or cancelled draft releases are cleaned up.
- Release workflow structure is verified in CI with `npm run verify:release-workflow`.
- The release workflow verifier has regression tests in CI with `npm run test:release-workflow`.

## CI production smoke gates

CI currently enforces these non-release smoke gates on every `main` push and pull request:

- `test`: npm vulnerability audit, TypeScript, ESLint, release workflow guard verifier, release version verifier, frontend tests, and Web build.
- `web-production-smoke`: production Vite build, preview server startup, real browser navigation through Chat, Agent, Skills, MCP, and Settings, chat input/new-chat interaction, Settings data import/export modal coverage, screenshot/report artifact upload, and browser console/page-error failure capture.
- `docker-web-smoke`: Docker Web image build and OCI version label verification.
- `macos-app-local-build`: unsigned local macOS `.app` build, bundle structure verification, and LaunchServices open smoke when the runner has a GUI-capable session.
- `rust-check`: RustSec audit, `cargo check`, Rust format check, Clippy with warnings denied, and Rust tests.

## Revalidation steps after Apple is fixed

After Apple Developer / App Store Connect agreements and GitHub secrets are corrected, run:

```bash
gh workflow run Release --ref main -f version=<new-version>
```

Use a new version that has no existing release or tag. For prereleases targeting Windows MSI, use numeric prerelease identifiers, for example:

```text
0.8.7-10
```

Then verify:

```bash
gh run list --workflow Release --branch main --limit 5
gh run view <run-id>
```

Production-ready release criteria:

- `prepare-release`: success
- `apple-notarization-preflight`: success
- `create-draft-release`: success
- `build-desktop`: success on macOS aarch64, macOS x86_64, Windows, and Ubuntu
- `build-web`: success
- `build-docker`: success
- `publish-release`: success
- `cleanup-release-draft`: skipped
- The GitHub Release is public or prerelease as intended
- Release assets are present for supported platforms
- GHCR image tags are present only after release publish succeeds

## Local checks

Before triggering Release, run:

```bash
npm run verify:release-workflow
npm run test:release-workflow
npm run test:release-version
npm run audit:web
npm run smoke:web:production
npm run build:app:local
npm run verify:macos-app-bundle
npm run smoke:macos-app-launch
```

For full repository CI parity, rely on GitHub Actions CI:

```bash
gh run list --branch main --limit 5
```
