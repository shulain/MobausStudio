# MCP 服务

MCP (Model Context Protocol) 是一种让 AI 模型连接外部工具和服务的协议。通过 MCP，AI 可以访问文件系统、数据库、API 等资源。

## 什么是 MCP？

MCP 允许 AI 模型：
- 📁 读写文件
- 🗄️ 查询数据库
- 🌐 调用外部 API
- 🔧 执行特定工具

这大大扩展了 AI 的能力，使其能够完成更复杂的任务。

---

## 配置 MCP 服务器

### 1. 打开 MCP 页面

点击侧边栏的「🔌 MCP」图标进入 MCP 管理页面。

### 2. 添加服务器

点击「添加服务器」，填写配置信息。

### 3. 选择传输方式

MobausStudio 支持两种传输方式：

| 传输方式 | 说明 | 适用场景 |
|----------|------|----------|
| **stdio** | 通过命令行启动本地进程 | 本地 MCP 服务器 |
| **HTTP** | 通过 HTTP/WebSocket 连接 | 远程 MCP 服务器 |

#### stdio 方式配置

适用于本地运行的 MCP 服务器：

- **启动命令**：如 `npx`、`node`、`python`
- **命令参数**：如 `-y, @modelcontextprotocol/server-filesystem, /path/to/folder`
- **环境变量**：如 `GITHUB_TOKEN=xxx`（每行一个，KEY=VALUE 格式）

#### HTTP 方式配置

适用于远程 MCP 服务器：

- **端点地址**：服务器的 URL，支持 `http://`、`https://`、`ws://`、`wss://`

### 4. 配置认证（可选）

如果 MCP 服务器需要认证，可以选择：

- **无需认证**：公开服务器
- **API Key**：使用 API 密钥认证
- **Token**：使用令牌认证

### 5. 启用与自启动

- **启用开关**：控制服务器是否可用
- **自启动**：应用启动时自动连接此服务器

---

## 常用 MCP 服务器

### 文件系统

允许 AI 读写指定目录的文件：

- **传输方式**：stdio
- **启动命令**：`npx`
- **命令参数**：`-y, @modelcontextprotocol/server-filesystem, /Users/you/projects`

### SQLite 数据库

允许 AI 查询 SQLite 数据库：

- **传输方式**：stdio
- **启动命令**：`npx`
- **命令参数**：`-y, @modelcontextprotocol/server-sqlite, --db-path, /path/to/database.db`

### GitHub

允许 AI 操作 GitHub 仓库：

- **传输方式**：stdio
- **启动命令**：`npx`
- **命令参数**：`-y, @modelcontextprotocol/server-github`
- **环境变量**：`GITHUB_TOKEN=your-github-token`

### 更多服务器

访问 [MCP Servers](https://github.com/modelcontextprotocol/servers) 查看更多官方和社区服务器。

---

## 使用 MCP 工具

### 在对话中使用

配置好 MCP 服务器后，AI 会自动识别可用的工具。你可以直接在对话中请求：

> "请读取 /projects/readme.md 文件的内容"

> "查询数据库中所有用户的数量"

> "在我的 GitHub 仓库创建一个新的 Issue"

### 工具确认

当 AI 需要使用工具时，会显示工具调用信息。某些敏感操作可能需要你确认。

---

## 安全注意事项

### 权限控制

- 只授予 AI 必要的权限
- 文件系统服务器只开放需要的目录
- 数据库只授予只读权限（如果不需要写入）

### 敏感信息

- 不要在 MCP 配置中硬编码敏感信息
- 使用环境变量存储 API 密钥
- 定期轮换访问令牌

### 审计日志

建议开启日志记录，追踪 AI 的工具使用情况。

---

## 故障排除

### 服务器无法启动

1. 确认 Node.js 已安装
2. 确认 npx 命令可用
3. 检查服务器配置是否正确
4. 查看错误日志

### 工具调用失败

1. 确认服务器正在运行
2. 确认权限配置正确
3. 检查路径是否存在
4. 查看详细错误信息

### 连接超时

1. 检查网络连接
2. 增加超时时间配置
3. 确认服务器响应正常

---

## 下一步

- [技能系统](./skills.md) - 使用预设提示词模板
- [快捷键](../advanced/shortcuts.md) - 提高操作效率
