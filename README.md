<div align="center">

<img src="Mobaus.svg" width="80" height="80" alt="MobausStudio Logo">

# MobausStudio

**An open-source, cross-platform AI client with multi-model support, MCP extensions, and agent orchestration.**

[![Release](https://img.shields.io/github/v/release/shulain/MobausStudio?style=flat-square)](https://github.com/shulain/MobausStudio/releases)
[![Downloads](https://img.shields.io/github/downloads/shulain/MobausStudio/total?style=flat-square)](https://github.com/shulain/MobausStudio/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/shulain/MobausStudio/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/shulain/MobausStudio/actions)
[![License](https://img.shields.io/github/license/shulain/MobausStudio?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web%20%7C%20Docker-blue?style=flat-square)](#-download--install)

**[中文](./README_ZH.md)** | **[Documentation](https://docs.mobaus.com)** | **[Changelog](./user-guide/en/changelog.md)**

</div>

---

## Why MobausStudio?

Most AI clients lock you into a single provider. MobausStudio gives you **one interface for 20+ AI providers**, with OAuth magic login for your existing subscriptions (ChatGPT Plus, Claude Pro, GitHub Copilot, etc.) -- **no API keys needed**. Plus full MCP tool integration, multi-agent roundtable discussions, and 30,000+ built-in skills.

---

## Features

### Core

- **20+ AI Providers** -- OpenAI, Anthropic, Google Gemini, DeepSeek, Qwen, Kiro, Ollama, and more
- **4 Protocols** -- OpenAI Chat Completions, Anthropic Messages, Google Gemini, AWS Bedrock
- **OAuth Magic Login** -- Use your ChatGPT Plus / Claude Pro / GitHub Copilot subscriptions directly; no API key needed
- **Custom Providers** -- Add any OpenAI-compatible API endpoint

### Advanced

- **MCP Extensions** -- Connect AI to file systems, databases, APIs via [Model Context Protocol](https://modelcontextprotocol.io)
- **Agent System** -- Create custom AI assistants with system prompts, skills, and tool permissions
- **Roundtable Meeting** -- Multi-agent collaboration: assign roles (architect, QA, PM) to discuss a topic from different perspectives
- **Skills System** -- 30,000+ prompt templates for translation, writing, coding, analysis, and more

### Platform

- **Cross-Platform Desktop** -- macOS, Windows, Linux native apps via Tauri 2; this is the full production AI client
- **Web Static Preview** -- Self-hostable static build for UI exploration and local configuration preview
- **Docker Static Preview** -- One-command containerized static preview
- **Auto Update** -- Built-in updater with signed releases
- **i18n** -- English and Chinese UI

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript 5.8 |
| Styling | Tailwind CSS 4 |
| Build | Vite 7 |
| Testing | Vitest + Testing Library (Frontend), cargo test (Rust) |
| Docs | [VitePress](https://vitepress.dev) |

---

## Download & Install

### Desktop Application

Download from the [Releases](https://github.com/shulain/MobausStudio/releases/latest) page:

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x64) |
| Windows | `.exe` or `.msi` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Fedora/RHEL) | `.rpm` |
| Linux (Universal) | `.AppImage` |

### Docker

> **Important:** The Docker image serves the static Web preview only. It does not include the Tauri/Rust backend, so AI chat requests, OAuth magic login callbacks, MCP execution, filesystem-backed secure storage, and auto-updates require the desktop app.
> The official GHCR image is published for `linux/amd64` and `linux/arm64`.

```bash
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
# Visit http://localhost:8080
```

<details>
<summary>docker-compose</summary>

```yaml
services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

</details>

### Web Static Preview (Self-Hosted)

> The self-hosted Web build is a static preview. Use a desktop release for the complete production AI-client experience.

Download `MobausStudio-web.zip` from Releases, extract and serve:

```bash
unzip MobausStudio-web.zip -d mobaus-web
cd mobaus-web && npx serve .
```

---

## Development

### Prerequisites

- Node.js 20+
- Rust stable
- Platform dependencies: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Quick Start

```bash
# Install dependencies
npm install

# Start frontend dev server
npm run dev

# Start full Tauri app (frontend + Rust backend)
npm run tauri dev
```

### Build

```bash
# Web/static preview build
npm run build

# Desktop build
npm run tauri build
```

### Test

```bash
# Frontend tests
npm test

# Rust tests
cd src-tauri && cargo test

# Coverage
npm run test:coverage
```

### Release

> **Note**: Version numbers in `package.json` and `tauri.conf.json` are placeholders (`0.0.0-dev`). CI sets the version automatically from git tags.

```bash
# Tag and push to trigger a release build
git tag v1.0.0
git push origin v1.0.0
```

---

## Project Structure

```
MobausStudio/
├── src/                    # React frontend
│   ├── components/         # UI components (common, features, layout)
│   ├── services/           # Business logic (auth, providers, MCP, models)
│   ├── hooks/              # React hooks
│   ├── i18n/               # Internationalization (en, zh)
│   └── test/               # Frontend tests
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # Tauri commands & core logic
│       ├── protocol/       # AI protocol implementations
│       ├── mcp/            # MCP client (stdio + HTTP transport)
│       └── services/       # Backend services (config exporter, etc.)
├── docs/                   # Internal dev documentation
├── user-guide/             # User documentation (VitePress, EN + ZH)
└── .github/workflows/      # CI/CD (ci, release, docs)
```

---

## System Requirements

| Platform | Minimum |
|----------|---------|
| macOS | 10.15 (Catalina) or later |
| Windows | Windows 10 (1803) or later |
| Linux | glibc 2.31+ (Ubuntu 20.04+) |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## Feedback

Found a bug or have a suggestion? [Open an issue](https://github.com/shulain/MobausStudio/issues/new).

Please include: OS & version, MobausStudio version, steps to reproduce, and any relevant screenshots or logs.

---

## License

[MIT License](./LICENSE)

---

## Links

- [Documentation](https://docs.mobaus.com)
- [Releases](https://github.com/shulain/MobausStudio/releases)
- [Changelog](./user-guide/en/changelog.md)
- [Issue Tracker](https://github.com/shulain/MobausStudio/issues)
