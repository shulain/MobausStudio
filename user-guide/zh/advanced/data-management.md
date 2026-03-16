# 数据管理

了解 MobausStudio 如何存储数据，以及如何备份和管理你的数据。

## 数据存储位置

### 桌面应用

MobausStudio 将数据存储在系统应用数据目录：

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/MobausStudio/` |
| Windows | `%APPDATA%\MobausStudio\` |
| Linux | `~/.config/MobausStudio/` |

### Web 版本

Web 版本数据存储在浏览器的 localStorage 中。

---

## 数据内容

### 存储的数据

| 数据类型 | 说明 |
|----------|------|
| 对话记录 | 所有对话的消息历史 |
| 设置配置 | 模型配置（含 API 密钥）、MCP 配置等 |
| 技能数据 | 自定义技能 |
| 应用状态 | 窗口大小、主题等 |

> ⚠️ **安全提示**: API 密钥存储在本地配置文件中，请确保你的设备安全，不要将配置文件分享给他人。

---

## 备份数据

### 手动备份

1. 关闭 MobausStudio
2. 复制整个数据目录到安全位置

```bash
# macOS
cp -r ~/Library/Application\ Support/MobausStudio ~/Backup/

# Windows (PowerShell)
Copy-Item -Recurse $env:APPDATA\MobausStudio C:\Backup\

# Linux
cp -r ~/.config/MobausStudio ~/Backup/
```

### 恢复备份

1. 关闭 MobausStudio
2. 将备份目录复制回原位置
3. 重新启动应用

---

## 导入/导出配置

MobausStudio 支持导入和导出应用配置，方便备份和迁移。

### 导出配置

1. 点击侧边栏的「⚙️ 设置」图标
2. 选择「数据管理」
3. 点击「导出配置」
4. 选择要导出的内容：
   - **模型配置**: AI 模型设置（包含 API Key）
   - **智能体**: 自定义 AI 助手
   - **技能**: 自定义技能
   - **MCP 服务器**: MCP 配置
   - **对话记录**: 所有对话历史
5. 点击「导出」，选择保存位置

> ⚠️ **安全提示**: 导出文件包含 API 密钥等敏感信息，请妥善保管。

### 导入配置

1. 点击侧边栏的「⚙️ 设置」图标
2. 选择「数据管理」
3. 点击「导入配置」
4. 选择之前导出的配置文件
5. 选择导入选项：
   - **合并**: 与现有数据合并
   - **覆盖**: 替换现有数据
6. 点击「导入」

---

## 导出对话

### 单个对话

1. 打开要导出的对话
2. 点击菜单中的「导出」
3. 选择导出格式（Markdown / JSON）

### 批量导出

目前暂不支持批量导出，该功能正在开发中。

---

## 清理数据

### 清除单个对话

右键点击对话，选择「删除」。

### 清除所有数据

> ⚠️ 此操作不可恢复，请先备份重要数据！

1. 关闭 MobausStudio
2. 删除数据目录
3. 重新启动应用

```bash
# macOS
rm -rf ~/Library/Application\ Support/MobausStudio

# Windows (PowerShell)
Remove-Item -Recurse $env:APPDATA\MobausStudio

# Linux
rm -rf ~/.config/MobausStudio
```

---

## 数据安全

### API 密钥存储

API 密钥存储在本地配置文件中（与模型配置一起保存）：

- **macOS**: `~/Library/Application Support/MobausStudio/models.json`
- **Windows**: `%APPDATA%\MobausStudio\models.json`
- **Linux**: `~/.config/MobausStudio/models.json`

> ⚠️ **安全建议**: 请勿将配置文件分享给他人，避免 API 密钥泄露。

### 本地数据

- 对话数据存储在本地，不会上传到任何服务器
- 只有 API 请求会发送到对应的 AI 服务商

### 建议

1. 定期备份重要对话
2. 不要在对话中输入敏感信息（如密码）
3. 使用强密码保护你的系统账户
4. 不要将数据目录分享给他人

---

## 数据迁移

### 迁移到新电脑

1. 在旧电脑上备份数据目录
2. 在新电脑上安装 MobausStudio
3. 关闭应用，将备份复制到新电脑的数据目录
4. 重新启动应用
5. API 密钥会随配置一起迁移

### 跨平台迁移

数据格式跨平台兼容，可以直接复制。

---

## 下一步

- [自动更新](./auto-update.md) - 了解更新机制
- [常见问题](../faq.md) - 查看 FAQ
