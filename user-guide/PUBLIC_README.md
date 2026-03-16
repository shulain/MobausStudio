# MobausStudio

<p align="center">
  <img src="https://img.shields.io/github/v/release/shulain/MobausStudio?style=flat-square" alt="Release">
  <img src="https://img.shields.io/github/downloads/shulain/MobausStudio/total?style=flat-square" alt="Downloads">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/github/license/shulain/MobausStudio?style=flat-square" alt="License">
</p>

<p align="center">
  A cross-platform AI chat assistant with multi-model support and MCP extensions.
</p>

**[中文](./README_ZH.md)**

---

## ✨ Features

- 🤖 **Multi-Model Support** - OpenAI, Anthropic Claude and more
- 🔌 **MCP Extensions** - Connect external tools via MCP protocol
- 🎯 **Skills System** - Predefined prompt templates for quick tasks
- 💻 **Cross-Platform** - macOS, Windows, Linux desktop apps
- 🌐 **Web Version** - Self-hostable web version
- 🐳 **Docker Deployment** - One-click Docker deployment
- 🔄 **Auto Update** - Built-in auto-update for desktop

---

## 📥 Download & Install

### Desktop Application

Download from [Releases](https://github.com/shulain/MobausStudio/releases/latest) page:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `MobausStudio_x.x.x_aarch64.dmg` |
| macOS (Intel) | `MobausStudio_x.x.x_x64.dmg` |
| Windows | `MobausStudio_x.x.x_x64-setup.exe` or `.msi` |
| Linux (Debian/Ubuntu) | `MobausStudio_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `MobausStudio_x.x.x_amd64.rpm` |
| Linux (Universal) | `MobausStudio_x.x.x_amd64.AppImage` |

### Docker

```bash
# Pull and run
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest

# Visit http://localhost:8080
```

Or use docker-compose:

```yaml
version: '3.8'
services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

### Web Version (Self-Hosted)

Download `MobausStudio-web.zip`, extract and host with any HTTP server:

```bash
unzip MobausStudio-web.zip -d mobaus-web
cd mobaus-web
npx serve .
```

---

## 📖 Documentation

See [User Guide](./user-guide/en/README.md) for detailed instructions:

- [Installation Guide](./user-guide/en/installation.md)
- [Quick Start](./user-guide/en/quick-start.md)
- [FAQ](./user-guide/en/faq.md)

---

## 🔧 System Requirements

| Platform | Minimum Requirements |
|----------|---------------------|
| macOS | 10.15 (Catalina) or higher |
| Windows | Windows 10 (1803) or higher |
| Linux | glibc 2.31+ (Ubuntu 20.04+) |

---

## 🔄 Auto Update

Desktop app has built-in auto-update:

- Automatically checks for updates on startup
- Downloads in background, prompts to install
- Manual check in Settings → About

---

## 🐛 Feedback

If you encounter issues or have suggestions, please [submit an Issue](https://github.com/shulain/MobausStudio/issues/new).

Please include:

- OS and version
- MobausStudio version
- Problem description and steps to reproduce
- Related screenshots or logs

---

## 📄 License

[MIT License](./LICENSE)

---

## 🔗 Links

- [Changelog](./user-guide/en/changelog.md)
- [User Guide](./user-guide/en/README.md)
