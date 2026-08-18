# MobausStudio Project Documentation / 项目文档

> [English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

MobausStudio is a cross-platform AI client tool built with the Tauri framework.

### Documentation Index

#### Development
- [Development Guide](./DEVELOPMENT_GUIDE.md) -- Environment setup, code conventions, workflow (Bilingual)
- [Architecture Review](./ARCHITECTURE_REVIEW.md) -- Architecture assessment and refactoring roadmap (Chinese, baseline v0.8.8)

#### Module Documentation
- [Module Index](./modules/README.md) -- Feature module design and implementation docs

#### Component Documentation
- [Common Components](./components/common.md) -- Reusable UI components (ContextMenu, Modal, Button, etc.)
- [Layout Components](./components/layout.md) -- Application layout components (Header, Sidebar)

#### Service Documentation
- [Service Layer](./services/README.md) -- Business logic, API services, OAuth authentication

### Project Structure

```text
MobausStudio/
├── docs/                    # Project documentation
│   ├── README.md            # Documentation index (this file)
│   ├── DEVELOPMENT_GUIDE.md # Development guide (bilingual)
│   ├── ARCHITECTURE_REVIEW.md # Architecture review report
│   ├── modules/             # Module design docs
│   ├── components/          # Component docs
│   └── services/            # Service layer docs
├── src/                     # Frontend source (React + TypeScript)
│   ├── components/          # React components
│   ├── hooks/               # Custom Hooks
│   ├── services/            # Service layer
│   ├── types/               # TypeScript types
│   └── test/                # Tests
├── src-tauri/               # Rust backend source
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # Tauri commands & core logic
│   │   ├── protocol/        # AI protocol implementations
│   │   └── mcp/             # MCP client
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json      # Tauri configuration
├── user-guide/              # User documentation (VitePress, EN + ZH)
├── package.json             # Node.js dependencies
└── vite.config.ts           # Vite configuration
```

### Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Frontend | React 19 + TypeScript 5.8 |
| Build | Vite 7 |
| Desktop | Tauri 2 |
| Backend | Rust |
| Testing | Vitest (Frontend) / cargo test (Rust) |

### Quick Start

```bash
# Install dependencies
npm install

# Development mode
npm run tauri dev

# Production build
npm run tauri build
```

### Development Principles

1. **Docs first** -- update module docs before modifying code
2. **Tests required** -- every module needs thorough unit tests
3. **Minimal changes** -- check for reusable logic before writing new code
4. **Stable dependencies** -- prefer mature, well-maintained libraries

---

---

<a id="中文"></a>

## 中文

MobausStudio 是一个基于 Tauri 框架的跨平台 AI 客户端工具。

### 文档索引

#### 开发指南
- [开发指南](./DEVELOPMENT_GUIDE.md) -- 开发环境配置、代码规范、工作流程（中英双语）
- [架构检查报告](./ARCHITECTURE_REVIEW.md) -- 架构评估与重构路线（基线 v0.8.8）

#### 模块文档
- [模块文档目录](./modules/README.md) -- 功能模块设计与实现文档

#### 组件文档
- [通用组件](./components/common.md) -- 可复用的通用 UI 组件（ContextMenu、Modal、Button 等）
- [布局组件](./components/layout.md) -- 应用布局组件（Header、Sidebar）

#### 服务文档
- [服务层](./services/README.md) -- 业务逻辑、API 服务、OAuth 认证

### 项目结构

```text
MobausStudio/
├── docs/                    # 项目文档
│   ├── README.md            # 文档入口（本文件）
│   ├── DEVELOPMENT_GUIDE.md # 开发指南（中英双语）
│   ├── ARCHITECTURE_REVIEW.md # 架构检查报告
│   ├── modules/             # 模块设计文档
│   ├── components/          # 组件文档
│   └── services/            # 服务层文档
├── src/                     # 前端源码（React + TypeScript）
│   ├── components/          # React 组件
│   ├── hooks/               # 自定义 Hooks
│   ├── services/            # 服务层
│   ├── types/               # TypeScript 类型定义
│   └── test/                # 测试文件
├── src-tauri/               # Rust 后端源码
│   ├── src/
│   │   ├── main.rs          # 入口文件
│   │   ├── lib.rs           # Tauri 命令和核心逻辑
│   │   ├── protocol/        # AI 协议实现
│   │   └── mcp/             # MCP 客户端
│   ├── Cargo.toml           # Rust 依赖
│   └── tauri.conf.json      # Tauri 配置
├── user-guide/              # 用户文档（VitePress，中英双语）
├── package.json             # Node.js 依赖
└── vite.config.ts           # Vite 配置
```

### 技术栈

| 层级 | 技术 |
| ---- | ---- |
| 前端框架 | React 19 + TypeScript 5.8 |
| 构建工具 | Vite 7 |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust |
| 测试框架 | Vitest（前端）/ cargo test（Rust） |

### 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布
npm run tauri build
```

### 开发规范

1. **先文档后代码** -- 修改功能前必须先更新模块文档
2. **完善单元测试** -- 每个功能模块必须有完善的单元测试
3. **最小化修改** -- 写代码前先检查是否可以复用现有逻辑
4. **稳定依赖** -- 尽量使用成熟稳定的依赖库
