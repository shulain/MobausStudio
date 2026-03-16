# MobausStudio

一个基于 Tauri + React + TypeScript 构建的跨平台桌面应用。

## 下载安装

### 桌面应用

从 [Releases](https://github.com/shulain/MobausStudio/releases) 页面下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `MobausStudio_x.x.x_aarch64.dmg` |
| macOS (Intel) | `MobausStudio_x.x.x_x64.dmg` |
| Windows | `MobausStudio_x.x.x_x64-setup.exe` 或 `.msi` |
| Linux (Debian/Ubuntu) | `MobausStudio_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `MobausStudio_x.x.x_amd64.rpm` |
| Linux (通用) | `MobausStudio_x.x.x_amd64.AppImage` |

### Web 版本

下载 `MobausStudio-web.zip`，解压后使用任意 HTTP 服务器托管：

```bash
unzip MobausStudio-web.zip -d mobaus-web
cd mobaus-web
npx serve .
```

### Docker

```bash
# 拉取并运行
docker run -d -p 8080:80 ghcr.io/shulain/mobausstudio:latest

# 访问 http://localhost:8080
```

或使用 docker-compose：

```yaml
services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

## 本地开发

### 环境要求

- Node.js 20+
- Rust (stable)
- 系统依赖（参考 [Tauri 官方文档](https://tauri.app/v1/guides/getting-started/prerequisites)）

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
# 仅前端
npm run dev

# 完整 Tauri 应用
npm run tauri dev
```

### 构建

```bash
# 构建 Web 版本
npm run build

# 构建桌面应用
npm run tauri build
```

### 测试

```bash
# 运行前端测试
npm test

# 运行 Rust 测试
npm run test:rust

# 测试覆盖率
npm run test:coverage
```

## 发布新版本

> **注意**：`package.json` 和 `tauri.conf.json` 中的 `version` 字段为占位符 `0.0.0-dev`，**请勿手动修改**。版本号由 CI 根据 git tag 自动设置。

### 方式一：打 tag（推荐）

```bash
git tag v0.3.0
git push origin v0.3.0
```

### 方式二：手动触发 GitHub Actions

1. 进入 [Actions](https://github.com/shulain/MobausStudio/actions) 页面
2. 选择 "Release" workflow
3. 点击 "Run workflow"
4. **必须填写版本号**（如 `0.3.0`）

CI 会自动构建并发布：

- 桌面应用（macOS、Windows、Linux）
- Web 静态包
- Docker 镜像

## 推荐 IDE 配置

- [VS Code](https://code.visualstudio.com/)
- [Tauri 插件](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 许可证

MIT
