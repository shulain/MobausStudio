# MobausStudio 项目架构文档

## 📋 项目概述

MobausStudio 是一个基于 Tauri 框架的 AI 客户端工具，提供多模型对话、Agent 智能代理、Skills 技能扩展和 MCP 服务器集成功能。

| 属性 | 值 |
|------|------|
| 项目名称 | MobausStudio |
| 技术栈 | Tauri 2 + React 19 + TypeScript + Rust |
| 创建日期 | 2024-01-18 |
| 最后更新 | 2025-02-04 |

---

## 🎯 核心功能模块

根据UI原型，项目分为以下核心模块：

| 模块 | 说明 | 文档 | 状态 |
|------|------|------|------|
| Chat | AI对话功能 | [chat.md](./chat.md) | ✅ 已完成 |
| Agent | 智能代理管理 | [agent.md](./agent.md) | ✅ 已完成 |
| AgentOrchestration | 多Agent圆桌对话 | [agent-orchestration.md](./agent-orchestration.md) | ✅ 已完成 |
| Skills | 技能插件系统 | [skills.md](./skills.md) | ✅ 已完成 |
| MCP | 外部服务集成 | [mcp.md](./mcp.md) | ✅ 已完成 |
| Models | 模型配置管理 | [models.md](./models.md) | ✅ 已完成 |
| Providers | 提供商管理 | [providers.md](./providers.md) | ✅ 已完成 |
| Settings | 系统设置 | [settings.md](./settings.md) | ✅ 已完成 |
| Stats | 使用统计 | [stats.md](./stats.md) | ✅ 已完成 |
| Templates | Agent模板系统 | [templates.md](./templates.md) | ✅ 已完成 |
| Analytics | 数据分析服务 | [analytics.md](./analytics.md) | ✅ 已完成 |
| Updater | 自动更新 | [updater.md](./updater.md) | ✅ 已完成 |
| ConfigSwitcher | 配置导出器 | [config-switcher.md](./config-switcher.md) | 📝 设计中 |

---

## 🏗️ 项目架构

### 前端架构

```
src/
├── components/
│   ├── common/              # 通用组件
│   │   ├── Button/
│   │   ├── Modal/
│   │   ├── Input/
│   │   ├── Toast/
│   │   ├── ContextMenu/
│   │   └── ...
│   ├── layout/              # 布局组件
│   │   ├── Header/          # 顶部导航
│   │   └── Sidebar/         # 侧边导航
│   └── features/            # 功能模块组件
│       ├── Chat/            # 对话模块
│       ├── Agent/           # Agent模块
│       ├── AgentOrchestration/ # 圆桌对话模块
│       ├── Skills/          # 技能模块
│       ├── MCP/             # MCP模块
│       ├── Models/          # 模型管理模块
│       ├── Providers/       # 提供商模块
│       ├── Settings/        # 设置模块
│       ├── Stats/           # 统计模块
│       └── Templates/       # 模板模块
├── hooks/                   # 自定义Hooks
├── services/                # 服务层（API调用、OAuth等）
├── types/                   # TypeScript类型定义
├── utils/                   # 工具函数
├── i18n/                    # 国际化（中英文）
├── data/                    # 静态数据
└── test/                    # 测试文件
```

### 后端架构 (Rust)

```
src-tauri/src/
├── main.rs                  # 主入口
├── lib.rs                   # Tauri命令注册（包含所有命令实现）
├── commands/                # Tauri 命令层
│   ├── config_exporter.rs   # 配置导出命令
│   └── ...
├── services/                # 业务逻辑层
│   ├── config_exporter/     # 配置导出服务
│   │   ├── mod.rs
│   │   ├── export_service.rs
│   │   ├── transformer.rs
│   │   └── writer.rs
│   └── ...
├── mcp/                     # MCP 协议模块
│   ├── mod.rs
│   ├── client.rs            # MCP 客户端管理
│   ├── protocol.rs          # MCP 协议定义
│   ├── session.rs           # 会话管理
│   ├── error.rs             # 错误处理
│   └── transport/           # 传输层
│       ├── mod.rs
│       ├── stdio.rs         # 标准输入输出传输
│       └── http.rs          # HTTP 传输
└── protocol/                # AI 提供商协议模块
    ├── mod.rs
    ├── openai.rs            # OpenAI 协议
    ├── anthropic.rs         # Anthropic 协议
    ├── google.rs            # Google AI 协议
    └── aws.rs               # AWS (Kiro) 协议
```

---

## 📐 UI设计规范

### 颜色系统

| 用途 | 颜色 |
|------|------|
| 主色调 | `from-purple-500 to-pink-500` (渐变) |
| Agent | `from-purple-500 to-pink-500` |
| Skills | `from-blue-500 to-cyan-500` |
| MCP | `from-green-500 to-emerald-500` |
| 成功 | `green-500` |
| 警告 | `yellow-500` |
| 错误 | `red-500` |

### 组件规范

- 圆角: `rounded-xl` (12px) / `rounded-2xl` (16px)
- 阴影: `shadow-sm` / `shadow-lg` / `shadow-xl`
- 过渡: `transition-all`
- 边框: `border-2 border-gray-200`

---

## 🔄 开发规范

> [!IMPORTANT]
> **核心原则**
> 1. **先文档后代码** - 修改功能前必须先更新对应模块文档
> 2. **最小化修改** - 优先复用现有逻辑，避免重复造轮子
> 3. **测试驱动** - 每个功能必须有完善的单元测试

### 模块开发流程

```mermaid
graph LR
    A[需求分析] --> B[更新模块文档]
    B --> C[检查可复用逻辑]
    C --> D[编写测试用例]
    D --> E[实现功能代码]
    E --> F[运行测试]
    F --> G{测试通过?}
    G -->|否| E
    G -->|是| H[代码提交]
```

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2024-01-18 | 1.0.0 | - | 初始版本 - 项目架构设计 |
| 2025-02-04 | 2.0.0 | - | 更新模块状态为已完成，修正后端架构描述 |
| 2026-03-07 | 2.1.0 | MobausStudio | 新增 ConfigSwitcher 配置导出器模块 |
