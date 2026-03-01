# Changelog

<!-- markdownlint-disable MD024 -->

All version update records.

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
