# MobausStudio

<p align="center">
  <img src="https://img.shields.io/github/v/release/shulain/MobausStudio?style=flat-square" alt="Release">
  <img src="https://img.shields.io/github/downloads/shulain/MobausStudio/total?style=flat-square" alt="Downloads">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/github/license/shulain/MobausStudio?style=flat-square" alt="License">
</p>

<p align="center">
  一款跨平台的 AI 对话助手，支持多种 AI 模型和 MCP 扩展。
</p>

**[English](./README.md)**

---

## ✨ 特性

- 🤖 **多模型支持** - 支持 OpenAI、Anthropic Claude 等主流 AI 模型
- 🔌 **MCP 扩展** - 通过 MCP 协议连接外部工具和服务
- 🎯 **技能系统** - 预设提示词模板，快速完成特定任务
- 💻 **跨平台** - 支持 macOS、Windows、Linux 桌面应用
- 🌐 **Web 版本** - 可自托管的 Web 版本
- 🐳 **Docker 部署** - 一键 Docker 部署
- 🔄 **自动更新** - 桌面应用内置自动更新

---

## 📥 下载安装

### 桌面应用

从 [Releases](https://github.com/shulain/MobausStudio/releases/latest) 页面下载对应平台的安装包：

| 平台 | 下载 |
|------|------|
| macOS (Apple Silicon) | `MobausStudio_x.x.x_aarch64.dmg` |
| macOS (Intel) | `MobausStudio_x.x.x_x64.dmg` |
| Windows | `MobausStudio_x.x.x_x64-setup.exe` 或 `.msi` |
| Linux (Debian/Ubuntu) | `MobausStudio_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `MobausStudio_x.x.x_amd64.rpm` |
| Linux (通用) | `MobausStudio_x.x.x_amd64.AppImage` |

### Docker

```bash
# 拉取并运行
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest

# 访问 http://localhost:8080
```

或使用 docker-compose：

```yaml
version: '3.8'
services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

### Web 版本（自托管）

下载 `MobausStudio-web.zip`，解压后使用任意 HTTP 服务器托管：

```bash
unzip MobausStudio-web.zip -d mobaus-web
cd mobaus-web
npx serve .
```

---

## 📖 使用文档

详细使用说明请查看 [用户手册](./user-guide/zh/README.md)：

- [安装指南](./user-guide/zh/installation.md)
- [快速入门](./user-guide/zh/quick-start.md)
- [常见问题](./user-guide/zh/faq.md)

---

## 🔧 系统要求

| 平台 | 最低要求 |
|------|----------|
| macOS | 10.15 (Catalina) 或更高 |
| Windows | Windows 10 (1803) 或更高 |
| Linux | glibc 2.31+ (Ubuntu 20.04+) |

---

## 🔄 自动更新

桌面应用内置自动更新功能：

- 启动时自动检查新版本
- 后台下载，提示安装
- 也可在「设置 → 关于」中手动检查

---

## 🐛 问题反馈

如果遇到问题或有建议，请 [提交 Issue](https://github.com/shulain/MobausStudio/issues/new)。

提交时请包含：

- 操作系统和版本
- MobausStudio 版本
- 问题描述和复现步骤
- 相关截图或日志

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 🔗 相关链接

- [更新日志](./user-guide/zh/changelog.md)
- [用户手册](./user-guide/zh/README.md)
