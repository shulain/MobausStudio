# Changelog

<!-- markdownlint-disable MD024 -->

All version update records.

---

## [0.8.8] - 2026-06-12

### Added

- 🚀 Stable Release Refresh - Published v0.8.8 as the stable production release line after completing bilingual release-note coverage and release documentation closure
- 🌐 Bilingual Release Notes - Added English and Chinese changelog coverage so project documentation matches the public GitHub Release page
- 🐳 Multi-Architecture Docker Image - GHCR Web preview images now publish for both `linux/amd64` and `linux/arm64`

### Improved

- 📋 Release Documentation Standard - Production readiness documentation now requires bilingual changelog entries before any public Release or prerelease
- 🧭 Release Page Clarity - Official Release notes now include user-facing feature/change descriptions and platform download guidance instead of fallback text
- 🧱 Docker Release Safety - Release Docker builds verify the same multi-architecture platform set before publishing, with a bounded Docker push timeout

### Fixed

- 🔧 Fixed official Release notes missing feature descriptions when the target version is absent from the changelog before publication
- 🔧 Fixed Chinese changelog coverage for the current stable release stream
- 🔧 Fixed the v0.8.8 Docker publishing mitigation being temporarily constrained to `linux/amd64` after the GHCR push stall

### Notes

- Runtime product behavior is unchanged from v0.8.7 except for release version metadata and Docker Web preview image architecture coverage; this release exists to provide a clean, complete, bilingual stable Release record.

---

## [0.8.7] - 2026-06-12

### Added

- 🚀 Production Release - First stable production release for Mobaus Studio, with verified desktop, web, and Docker distribution channels
- 📦 Multi-platform Installers - Published signed release assets for macOS Apple Silicon, macOS Intel, Windows, Linux, and Web
- 🔄 Updater Manifest - Published `latest.json` with release assets so supported clients can discover the latest stable build

### Improved

- 🍎 macOS Distribution Trust - macOS DMG artifacts are now notarized and stapled for both Apple Silicon and Intel builds before release publication
- ✅ Release Quality Gates - Release workflow now validates required secrets, version compatibility, web smoke checks, Docker builds, desktop artifacts, and release asset completeness before publishing
- 🧪 Production Readiness Closure - Added end-to-end release validation so official releases only publish after all platform build and verification jobs pass

### Fixed

- 🔧 Fixed macOS release verification failing because DMG artifacts were signed but not separately notarized and stapled
- 🔧 Fixed Draft Release publication failing when GitHub's `getReleaseByTag` API could not find draft releases by tag
- 🔧 Fixed macOS distribution verification logs so stapler and Gatekeeper failures are visible during CI diagnosis

---

## [0.8.6] - 2026-04-08

### Added

- 🔐 ChatGPT Plus Subscription Proxy - Log in with your ChatGPT Plus/Pro subscription via OAuth to directly use GPT-5.x series models (GPT-5.4, GPT-5.3, GPT-5.2, GPT-5.1 and more) at no additional API cost
- 🤖 GPT-5.x Model Support - Full support for GPT-5.4, GPT-5.3, GPT-5.2, GPT-5.1 and their variants (Mini, Nano, Codex)

### Improved

- 🔄 OAuth Token Refresh Stability - Fixed temporary network errors permanently invalidating credentials; now intelligently distinguishes between unrecoverable errors and temporary failures
- 🔧 Custom Provider Protocol Fix - Fixed requests from custom providers with Anthropic protocol being incorrectly routed to the OpenAI path
- 🛡️ MCP Tool Compatibility - No-parameter MCP tools now work correctly without failing due to missing parameter definitions

### Fixed

- 🔧 Fixed concurrent token refresh across multiple providers causing credential overwrites
- 🔧 Fixed incorrect Anthropic token refresh endpoint URL
- 🔧 Fixed newly issued Google refresh tokens not being saved properly

---

## [0.8.5] - 2026-03-15

### Added

- 🖼️ Multimodal Image Processing - Full support for image upload and processing with multiple image formats
- 🔒 Enhanced SSRF Protection - Added DNS resolution IP validation for stronger security

### Improved

- 🎨 Brand Visual Upgrade - Updated to Mobaus gradient circular logo design with unified brand identity
- 🎨 UI Experience Optimization - Unified all buttons with purple-blue gradient, optimized config switcher page layout
- 📚 Documentation Site Optimization - Updated docs site logo, favicon and navbar, adjusted Hero background transparency
- 🔄 Config Export Optimization - Fixed nested field residue and credential matching case sensitivity issues
- 🔧 Kiro Token Management - Automatically identifies unrecoverable errors on token refresh failure and cleans up invalid credentials

### Fixed

- 🔧 Fixed config switching race conditions and i18n issues
- 🔧 Fixed roundtable streaming hang and Google model race conditions
- 🔧 Fixed protocol selector i18n regression
- 🔧 Fixed config export residue/accidental deletion issues
- ✅ Code Quality Improvements - Fixed all Clippy and ESLint warnings for better code standards

---

## [0.8.2] - 2026-03-07

### Fixed

- 🔧 Fixed skill installation issues - Fixed issue where installing skills from skills.sh repositories using master branch couldn't download complete directories (like scripts folder)
- 🔧 Fixed root skill installation - Fixed issue where subdirectories like scripts in root-level skills couldn't be downloaded correctly
- 🔧 Fixed GitHub API rate limit handling - Improved error handling for GitHub API rate limits to avoid partial installations

### Improved

- ✅ Test quality improvements - Fixed test quality issues, added 151 unit tests to ensure code quality
- 📝 Enhanced skill installation documentation - Updated skill module documentation with detailed problem analysis and solutions

---

## [0.8.1] - 2026-03-04

### Improved

- 🔧 Custom Provider Management - Removed built-in Custom provider, unified to use "Add Custom Provider" feature, supports adding multiple custom services
- 🔌 Protocol Configuration Enhancement - More flexible model-level protocol configuration, supports selecting different communication protocols for different models
- 📝 API Logging Optimization - Added request logging and response format detection for all streaming protocols, easier to troubleshoot issues
- 🔄 Google OAuth Stability - Fixed issue where Token expiration was not automatically refreshed or prompted

### Fixed

- 🔧 Fixed Google API tool call compatibility issues
- 🔧 Fixed missing error prompts when API calls fail
- 🔧 Fixed fundamental issues with roundtable tool calls

---

## [0.8.0] - 2026-03-01

### Added

- 🧩 Enhanced Custom Provider support - Connect more OpenAI-compatible endpoints, including enterprise gateways, proxies, and private services
- 🔵 Better roundtable tool visibility - Tool calls and results are now clearer during roundtable discussions for easier evidence tracking

### Improved

- 🔄 Smoother roundtable continuation flow - Discussions continue more naturally after tool execution with better context carry-over
- 🧭 Better role consistency in roundtable - Multi-agent role identity and message ownership are now more stable and easier to follow
- 📚 Improved user guide usability - Roundtable and provider docs are now more usage-focused and easier for end users

### Fixed

- 🔧 Fixed duplicate tool call display in roundtable - The same tool call no longer appears repeatedly in multiple message bubbles
- 🔧 Fixed thinking placeholder during tool execution - "Thinking..." placeholder no longer shows while tool cards are already being displayed

---

## [0.7.5] - 2026-02-26

### Improved

- 🔄 OAuth Connection Stability - More reliable token auto-renewal, automatically restores connection status after retry success on refresh failure
- 🔑 Login Credential Retention - Preserves credentials on temporary token refresh failure, auto-retries next time without requiring re-login
- ⌨️ Input Experience Optimization - Fixed issue where pressing Enter during Chinese IME composition would accidentally send the message
- 🎯 Input Focus Management - Auto-focuses input box after switching conversations or when AI reply completes

### Fixed

- 🔧 Fixed provider status display issue - Provider page still showing "Not Connected" after successful token renewal
- 🔧 Fixed issue where pressing Enter to commit IME input would directly send the message

---

## [0.7.4] - 2025-02-08

### Added

- 🔧 Roundtable MCP Tool Calls - Agents participating in discussions can now use MCP tools for evidence-based discussions
- 🔐 Agent Permission Control - Support configuring file path permissions, tool call rules, auto-approve settings and more

### Improved

- 📝 Unified Message Rendering - Optimized chat message display for better consistency
- 🔄 OAuth Token Auto Refresh - Automatically refresh expired login credentials on app startup, no need to re-login
- 🧹 Data Cleanup Optimization - Improved user experience for data cleanup and export features
- 🔧 Skill Installation Optimization - Fixed path matching issues when installing from official repository

### Fixed

- 🔧 Fixed timer reset issue when switching conversations in roundtable meetings
- 🔧 Fixed repeated prompts after OAuth token refresh failure

---

## [0.7.3] - 2025-02-03

### Added

- 📦 Agent Template Management - Support scanning and installing Agent templates from GitHub repositories
- 🔗 Template URL Download - Support downloading template files directly via URL

### Improved

- 🤖 Agent Status Display - Card now clearly shows MCP, Skills, and Model connection status
- 🎨 MCP Page Layout - Adjusted to two-card-per-row layout with tool detail tooltips
- 📊 Analytics Service - Improved usage statistics data processing

---

## [0.7.2] - 2025-02-02

### Added

- 🤖 Kiro Model Support - New Amazon Kiro AI model integration
- 📊 Analytics Module - New usage data analysis feature

### Improved

- 🎨 UI Layout Optimization - Unified card layout style for Agent, Models, and MCP pages
- 💭 Thinking Process Display - Improved thinking phase display for Google and Kiro models
- 🔧 Skills Repository Adaptation - Adapted to skills.sh official repository API updates

### Fixed

- 🔧 Fixed Google model thinking phase display issue
- 🔧 Fixed field parsing issue during skill installation

---

## [0.7.1] - 2025-02-01

### Added

- 🌍 Smart Language Detection - Automatically select interface language based on system language on first launch

### Improved

- 🌐 Enhanced i18n Support - Fixed hardcoded text across multiple pages, full Chinese/English support
- 🔌 MCP Process Management - Gracefully stop all MCP services on app exit, preventing orphan processes

### Fixed

- 🔧 Fixed app unable to restart after update

---

## [0.7.0] - 2025-01-30

### Added

- 📊 Google Model Quota Display - View remaining quota for each model in provider card
- 🔄 Dynamic Model List - Google provider automatically fetches latest available models
- ✅ Batch Model Check - One-click check availability status for all models

### Improved

- 🎨 New Dropdown Selector - Beautiful custom dropdown component, goodbye native styles
- 🏷️ Connected Provider Badge - Green badge clearly indicates connected status
- 🌫️ Modal Backdrop Blur - Unified frosted glass effect for all modals
- 🎯 Smart Model Selection - Warning indicator for models with exhausted quota

### Fixed

- 🔧 Fixed models using provider credentials not working after restart
- 🔧 Fixed model credential persistence loss issue

---

## [0.6.0] - 2025-01-29

### Added

- 🔐 Provider Hub - Unified management for 15+ AI service providers
- 🔑 OAuth Login - Support GitHub Copilot, OpenAI, Anthropic, Google account authorization
- 🔄 Auto Model Fetching - Automatically fetch latest models after connecting to providers
- 🆕 OpenAI New Models - GPT-5, GPT-4.1, o3 and other latest models

### Improved

- 💾 Model Selection Memory - Preserve selected model after switching pages or restarting
- 🔒 Auto Token Refresh - No need to re-authorize frequently after OAuth login

---

## [0.5.0] - 2025-01-27

### Added

- 🎉 First public release
- 💬 AI chat functionality
- 🔧 Multi-model support (OpenAI, Anthropic)
- 🖥️ Cross-platform desktop app (macOS, Windows, Linux)
- 🌐 Web version
- 🐳 Docker image
- 🔄 Auto-update functionality
- 📚 Complete user guide in Chinese and English
- 🤖 Agent feature - Create and configure AI assistants
- 🧩 Skills system - Preset prompt templates
- 🔌 MCP service integration - Connect external tools and services
- 🖥️ Standalone model management page
- 📊 Usage statistics feature

### Improved

- Optimized sidebar navigation structure
- API keys stored in local config files, supports cross-device migration

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible new features
- **Patch version**: Backward-compatible bug fixes

---

## Getting Updates

- **Desktop**: Auto-update in app
- **Web**: Re-download and deploy
- **Docker**: `docker pull ghcr.io/shulain/mobausstudio:latest`
