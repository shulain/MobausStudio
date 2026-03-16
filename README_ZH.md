<div align="center">

<img src="Mobaus.svg" width="80" height="80" alt="MobausStudio Logo">

# MobausStudio

**开源、跨平台的 AI 客户端，支持多模型、MCP 扩展和多智能体协作。**

[![Release](https://img.shields.io/github/v/release/shulain/MobausStudio?style=flat-square)](https://github.com/shulain/MobausStudio/releases)
[![Downloads](https://img.shields.io/github/downloads/shulain/MobausStudio/total?style=flat-square)](https://github.com/shulain/MobausStudio/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/shulain/MobausStudio/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/shulain/MobausStudio/actions)
[![License](https://img.shields.io/github/license/shulain/MobausStudio?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web%20%7C%20Docker-blue?style=flat-square)](#-下载安装)

**[English](./README.md)** | **[在线文档](https://docs.mobaus.com)** | **[更新日志](./user-guide/zh/changelog.md)**

</div>

---

## 为什么选择 MobausStudio？

大多数 AI 客户端只支持单一服务商。MobausStudio 用**一个界面统一 20+ AI 服务商**，支持 OAuth 魔法登录（直接使用你的 ChatGPT Plus、Claude Pro、GitHub Copilot 等订阅），**无需 API Key**。还内置 MCP 工具集成、多智能体圆桌讨论、30,000+ 技能模板。

---

## 功能特性

### 核心能力

- **20+ AI 服务商** -- OpenAI、Anthropic、Google Gemini、DeepSeek、通义千问、Kiro、Ollama 等
- **4 种协议** -- OpenAI Chat Completions、Anthropic Messages、Google Gemini、AWS Bedrock
- **OAuth 魔法登录** -- 直接使用 ChatGPT Plus / Claude Pro / GitHub Copilot 等订阅，无需 API Key
- **自定义服务商** -- 添加任何 OpenAI 兼容的 API 端点

### 高级功能

- **MCP 扩展** -- 通过 [Model Context Protocol](https://modelcontextprotocol.io) 让 AI 连接文件系统、数据库、API
- **智能体系统** -- 创建自定义 AI 助手：设定系统提示词、分配技能和工具权限
- **圆桌会议** -- 多智能体协作模式：分配不同角色（架构师、QA、产品经理）从多角度讨论同一话题
- **技能系统** -- 30,000+ 专业提示词模板，涵盖翻译、写作、编程、分析等场景

### 平台支持

- **跨平台桌面应用** -- 基于 Tauri 2 的 macOS、Windows、Linux 原生应用
- **Web 版本** -- 可自托管的静态 Web 构建
- **Docker 部署** -- 一键容器化部署
- **自动更新** -- 内置签名验证的自动更新
- **国际化** -- 中文和英文界面

---

## 技术栈

| 层级 | 技术 |
| ---- | ---- |
| 桌面端 | [Tauri 2](https://tauri.app)（Rust） |
| 前端 | React 19 + TypeScript 5.8 |
| 样式 | Tailwind CSS 4 |
| 构建 | Vite 7 |
| 测试 | Vitest + Testing Library（前端），cargo test（Rust） |
| 文档 | [VitePress](https://vitepress.dev) |

---

## 下载安装

### 桌面应用

从 [Releases](https://github.com/shulain/MobausStudio/releases/latest) 页面下载：

| 平台 | 文件 |
| ---- | ---- |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x64) |
| Windows | `.exe` 或 `.msi` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Fedora/RHEL) | `.rpm` |
| Linux (通用) | `.AppImage` |

### Docker

```bash
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
# 访问 http://localhost:8080
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

### Web 版本（自托管）

从 Releases 下载 `MobausStudio-web.zip`，解压后托管：

```bash
unzip MobausStudio-web.zip -d mobaus-web
cd mobaus-web && npx serve .
```

---

## 本地开发

### 环境要求

- Node.js 20+
- Rust stable
- 系统依赖：参见 [Tauri 环境配置](https://tauri.app/start/prerequisites/)

### 快速开始

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 启动完整 Tauri 应用（前端 + Rust 后端）
npm run tauri dev
```

### 构建

```bash
# Web 构建
npm run build

# 桌面应用构建
npm run tauri build
```

### 测试

```bash
# 前端测试
npm test

# Rust 测试
cd src-tauri && cargo test

# 覆盖率报告
npm run test:coverage
```

### 发版

> **注意**：`package.json` 和 `tauri.conf.json` 中的版本号为占位符（`0.0.0-dev`），CI 根据 git tag 自动设置，**请勿手动修改**。

```bash
# 打 tag 并推送，自动触发 Release 构建
git tag v1.0.0
git push origin v1.0.0
```

---

## 项目结构

```text
MobausStudio/
├── src/                    # React 前端
│   ├── components/         # UI 组件（通用、功能、布局）
│   ├── services/           # 业务逻辑（认证、服务商、MCP、模型）
│   ├── hooks/              # React Hooks
│   ├── i18n/               # 国际化（中文、英文）
│   └── test/               # 前端测试
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── lib.rs          # Tauri 命令和核心逻辑
│       ├── protocol/       # AI 协议实现
│       ├── mcp/            # MCP 客户端（stdio + HTTP 传输）
│       └── services/       # 后端服务（配置导出等）
├── docs/                   # 开发文档
├── user-guide/             # 用户文档（VitePress，中英双语）
└── .github/workflows/      # CI/CD（ci、release、docs）
```

---

## 系统要求

| 平台 | 最低要求 |
| ---- | ---- |
| macOS | 10.15 (Catalina) 或更高 |
| Windows | Windows 10 (1803) 或更高 |
| Linux | glibc 2.31+（Ubuntu 20.04+） |

---

## 参与贡献

欢迎贡献代码！请按以下步骤：

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feat/amazing-feature`）
3. 提交更改
4. 推送到分支（`git push origin feat/amazing-feature`）
5. 发起 Pull Request

---

## 问题反馈

发现 Bug 或有建议？请 [提交 Issue](https://github.com/shulain/MobausStudio/issues/new)。

提交时请包含：操作系统及版本、MobausStudio 版本、复现步骤、相关截图或日志。

---

## 许可证

[MIT License](./LICENSE)

---

## 相关链接

- [在线文档](https://docs.mobaus.com)
- [下载页面](https://github.com/shulain/MobausStudio/releases)
- [更新日志](./user-guide/zh/changelog.md)
- [问题反馈](https://github.com/shulain/MobausStudio/issues)
