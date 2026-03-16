# 软件更新模块 (updater)

## 模块职责

处理应用程序的自动更新检查和手动更新功能。

## 功能说明

1. **启动自动检查** - 应用启动时自动检查是否有新版本
2. **手动检查更新** - 用户可在设置页面手动触发检查
3. **下载并安装** - 检测到新版本后，下载并提示用户安装

## 技术方案

使用 Tauri 官方的 `tauri-plugin-updater` 插件，配合 GitHub Releases 作为更新源。

### 更新流程

```
启动应用
    ↓
自动检查更新（静默）
    ↓
有新版本？ → 否 → 结束
    ↓ 是
显示更新提示对话框
    ↓
用户确认？ → 否 → 结束
    ↓ 是
下载更新包
    ↓
安装并重启
```

## 接口定义

### 前端 API

#### checkForUpdates()

检查是否有新版本。

**返回：**

```typescript
interface UpdateInfo {
  available: boolean;      // 是否有新版本
  currentVersion: string;  // 当前版本
  latestVersion?: string;  // 最新版本
  releaseNotes?: string;   // 更新说明
  downloadUrl?: string;    // 下载地址
}
```

#### downloadAndInstall(onProgress?)

下载并安装更新，完成后自动重启应用。

**参数：**

- `onProgress` (可选): 下载进度回调函数 `(downloaded: number, total: number) => void`

**返回：**

- 成功: 调用 `relaunch()` 重启应用
- 失败: 抛出错误

**注意：**

Tauri v2 的 `@tauri-apps/plugin-updater` 中，`update.downloadAndInstall()` 完成后**不会自动重启**，必须手动调用 `@tauri-apps/plugin-process` 的 `relaunch()` 来重启应用并应用更新。

### Tauri 命令

#### check_update

检查更新。

**返回：**

```json
{
  "available": true,
  "current_version": "0.2.0",
  "latest_version": "0.3.0",
  "release_notes": "## 更新内容\n- 新增功能...",
  "download_url": "https://github.com/..."
}
```

#### install_update

下载并安装更新。

## 配置说明

### tauri.conf.json

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/shulain/MobausStudio/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

### 生成签名密钥

Tauri updater 需要签名密钥来验证更新包的完整性。

```bash
# 生成密钥对（会提示输入密码）
npx @tauri-apps/cli signer generate -w ~/.tauri/mobaus.key

# 输出示例：
# Your public key was generated successfully:
# dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6...
#
# Your secret key was generated successfully - Keep it secret!
# ~/.tauri/mobaus.key
```

### GitHub Secrets 配置

在 GitHub 仓库设置中添加以下 Secrets：

| Secret 名称                          | 说明                                         |
|--------------------------------------|----------------------------------------------|
| `TAURI_SIGNING_PRIVATE_KEY`          | 私钥内容（~/.tauri/mobaus.key 文件内容）     |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成密钥时设置的密码                         |

### 配置公钥

将生成的公钥填入 `tauri.conf.json` 的 `plugins.updater.pubkey` 字段。

### 更新清单文件 (latest.json)

CI 自动生成，格式如下：

```json
{
  "version": "0.3.0",
  "notes": "更新说明",
  "pub_date": "2024-01-15T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/.../MobausStudio_0.3.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../MobausStudio_0.3.0_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../MobausStudio_0.3.0_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../MobausStudio_0.3.0_x64-setup.nsis.zip"
    }
  }
}
```

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-UPDATER-001 | 启动时自动检查（无更新） | 当前版本=最新版本 | 静默，无提示 |
| TC-UPDATER-002 | 启动时自动检查（有更新） | 当前版本<最新版本 | 显示更新提示 |
| TC-UPDATER-003 | 手动检查（无更新） | 点击检查更新 | 提示"已是最新版本" |
| TC-UPDATER-004 | 手动检查（有更新） | 点击检查更新 | 显示更新详情 |
| TC-UPDATER-005 | 下载更新 | 确认更新 | 显示下载进度 |
| TC-UPDATER-006 | 安装更新 | 下载完成 | 提示重启安装 |
| TC-UPDATER-007 | 网络错误 | 无网络连接 | 显示错误提示 |

## UI 设计

### 设置页面

在设置页面添加"检查更新"按钮：

```
┌─────────────────────────────────────┐
│ 关于                                │
├─────────────────────────────────────┤
│ 版本: 0.2.0                         │
│ [检查更新]                          │
│                                     │
│ 自动检查更新: [✓]                   │
└─────────────────────────────────────┘
```

### 更新提示对话框

```
┌─────────────────────────────────────┐
│ 发现新版本                          │
├─────────────────────────────────────┤
│ 当前版本: 0.2.0                     │
│ 最新版本: 0.3.0                     │
│                                     │
│ 更新内容:                           │
│ - 新增软件更新功能                  │
│ - 修复若干问题                      │
│                                     │
│        [稍后提醒]  [立即更新]       │
└─────────────────────────────────────┘
```

## 变更记录

| 日期 | 修改内容 | 修改人 |
|------|----------|--------|
| 2024-01-15 | 初始版本 | Claude |
| 2025-01-20 | 修复更新下载完成后不重启问题，添加 relaunch() 调用 | Claude |
| 2025-01-21 | 修复 relaunch() 卡住问题：改用 setTimeout 异步调用，避免 await 阻塞 | Claude |
