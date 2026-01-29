# Changelog

All version update records.

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
