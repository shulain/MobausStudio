# Production Readiness Evidence

Last updated: 2026-06-11, Asia/Shanghai.

This document records the current production-readiness boundary for MobausStudio. It is an evidence index, not a replacement for CI or the Release workflow.

## Current status

Repository-side release hardening is in place and verified. CI now covers the Web production browser smoke path, Docker Web image smoke, npm dependency audit, RustSec/Rust checks, and local macOS `.app` bundle construction.

The Release workflow now also requires macOS distribution artifacts to pass signing and notarization verification after `tauri-apps/tauri-action` finishes. The gate rejects adhoc-signed apps, missing TeamIdentifier, missing hardened runtime, non-authoritative Gatekeeper checks, and DMGs without a stapled notarization ticket.

The remaining blocker is external to this repository:

```text
Apple notarization preflight failed. Check Apple Developer Program agreements and APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID secrets.
```

The latest real Release verification run confirmed that the Apple secrets are present, but Apple rejects notarization access because the developer account has a missing or expired agreement:

```bash
gh run view 27344206620 --log-failed
```

Expected blocker evidence:

```text
Error: HTTP status code: 403. A required agreement is missing or has expired.
cleanup-release-draft: success; no Draft Release or v0.8.7-10 tag remained after the failed preflight.
```

Do not mark the project as fully production-ready until a Release workflow run completes after Apple Developer / App Store Connect agreements and notarization credentials are valid.

Local evidence from 2026-06-11:

```text
npm run verify:release-workflow: passed
npm run test:release-workflow: passed, 8 tests
npm run test:release-version: passed, 4 tests
npm run audit:web: passed, found 0 vulnerabilities
npm run build:app:local: passed
npm run verify:macos-app-bundle: passed
npm run smoke:macos-app-launch: passed
LaunchServices screenshot: /tmp/mobausstudio-app-launch-smoke.png
macOS launch smoke resolves the target .app bundle to an absolute path, verifies that newly detected PIDs execute from that bundle's Contents/MacOS path, and warns when another same-name app process is running from a different path.
```

Distribution boundary from the same local artifact:

```text
APPLE_CERTIFICATE / APPLE_ID / APPLE_TEAM_ID / TAURI_SIGNING_PRIVATE_KEY: missing locally
codesign --verify --deep --strict: failed for the local adhoc app bundle
Signature: adhoc
TeamIdentifier: not set
notarytool history: skipped because local Apple credentials are missing
```

This local artifact proves local launchability only. It does not prove user-distributable macOS release readiness.

## Verified evidence

Recent repository CI evidence:

```bash
gh run view 27349210478
```

Expected result:

```text
test: success
web-production-smoke: success
docker-web-smoke: success
macos-app-local-build: success
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
- macOS desktop Release jobs verify non-adhoc signing, TeamIdentifier, hardened runtime, Gatekeeper assessment, and stapled DMG notarization before the workflow can publish.
- Docker image push only happens in `publish-release`, after all release gates pass.
- Failed or cancelled draft releases are cleaned up; failed manual `workflow_dispatch` releases also clean up the automatically created tag.
- Release workflow structure is verified in CI with `npm run verify:release-workflow`.
- The release workflow verifier has regression tests in CI with `npm run test:release-workflow`.
- The Release `build-web` job runs a browser smoke against the versioned Web `dist` before uploading `MobausStudio-web.zip`, and uploads the smoke screenshot/report as an artifact.
- `publish-release` verifies that the Draft Release contains Web, macOS Apple Silicon, macOS Intel, Windows, Linux, and updater assets before pushing GHCR images and before making the Release public.
- `publish-release` downloads `latest.json` from the Draft Release and verifies that updater manifest entries exist for macOS Apple Silicon, macOS Intel, Windows, and Linux with non-empty URLs and signatures, match the release version, and point to assets present in the Draft Release.

## CI production smoke gates

CI currently enforces these non-release smoke gates on every `main` push and pull request:

- `test`: npm vulnerability audit, TypeScript, ESLint, release workflow guard verifier, release version verifier, frontend tests, and Web build.
- `web-production-smoke`: production Vite build, preview server startup, real browser navigation through Chat, Agent, Skills, MCP, Models, Providers, Config Switcher, Stats, and Settings, chat input/new-chat interaction, Settings data import/export modal coverage, screenshot/report artifact upload, and browser console/page-error failure capture.
- `docker-web-smoke`: Docker Web image build and OCI version label verification.
- `macos-app-local-build`: unsigned local macOS `.app` build, bundle structure verification, and LaunchServices open smoke when the runner has a GUI-capable session.
- `rust-check`: RustSec audit, `cargo check`, Rust format check, Clippy with warnings denied, and Rust tests.
- `test`: includes a Tauri security gate that rejects disabled CSP and unsafe script sources.

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
- `build-web`: success, including release Web browser smoke and smoke artifact upload
- `build-docker`: success
- `publish-release`: success
- `cleanup-release-draft`: skipped
- The GitHub Release is public or prerelease as intended
- Release assets are present for supported platforms
- Release assets include Web zip, macOS Apple Silicon DMG, macOS Intel DMG, Windows installer, Linux installer, `latest.json`, and updater signatures
- `latest.json` includes updater entries with URLs and signatures for macOS Apple Silicon, macOS Intel, Windows, and Linux; its version matches the Release version and every updater URL points to an uploaded Release asset
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

After a real signed and notarized macOS Release build, run the distribution verifier on the macOS runner artifact root:

```bash
npm run verify:macos-distribution -- <target-triple>
```

For example:

```bash
npm run verify:macos-distribution -- aarch64-apple-darwin
npm run verify:macos-distribution -- x86_64-apple-darwin
```

For full repository CI parity, rely on GitHub Actions CI:

```bash
gh run list --branch main --limit 5
```
