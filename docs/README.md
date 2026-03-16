# MobausStudio 项目文档

MobausStudio 是一个基于 Tauri 框架的 AI 客户端工具。

## 📚 文档索引

### 开发指南
- [开发指南](./DEVELOPMENT_GUIDE.md) - 开发环境配置、代码规范、工作流程

### 模块文档
- [模块文档目录](./modules/README.md) - 功能模块设计与实现文档

### 组件文档
- [通用组件](./components/common.md) - 可复用的通用 UI 组件 (ContextMenu, Modal, Button 等)

### 项目结构
```
MobausStudio/
├── docs/                    # 项目文档
│   ├── README.md           # 文档入口
│   ├── DEVELOPMENT_GUIDE.md # 开发指南
│   ├── modules/            # 模块文档
│   └── components/         # 组件文档
├── src/                    # 前端源码 (React + TypeScript)
│   ├── components/         # React组件
│   ├── hooks/              # 自定义Hooks
│   ├── services/           # 服务层
│   ├── stores/             # 状态管理
│   ├── types/              # TypeScript类型定义
│   └── test/               # 测试配置
├── src-tauri/              # Rust后端源码
│   ├── src/
│   │   ├── main.rs         # 主入口
│   │   └── lib.rs          # 库入口
│   ├── Cargo.toml          # Rust依赖
│   └── tauri.conf.json     # Tauri配置
├── package.json            # Node.js依赖
└── vite.config.ts          # Vite配置
```

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 桌面框架 | Tauri 2 |
| 后端语言 | Rust |
| 测试框架 | Vitest (前端) / Cargo test (Rust) |

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布
npm run tauri build
```

## 📋 开发规范

162. **先文档后代码** - 严格遵守当前模块的文档开发完善项目，如果有功能修改必须先修改模块文档再修改代码。
63. **完善单元测试** - 每个功能模块必须做好完善的单元测试，修改代码后需要修改好单元测试代码，并且运行单元测试通过。
64. **最小化修改** - 最小化修改代码，避免重复造轮子，写代码之前先检查是否可以复用逻辑。
65. **稳定依赖** - 尽量使用成熟稳定依赖库。
