# 常见问题 (FAQ)

## 安装问题

### macOS 提示"无法打开，因为无法验证开发者"

这是 macOS 的安全机制（Gatekeeper）。解决方法：

1. 打开「系统偏好设置」→「安全性与隐私」→「通用」
2. 点击「仍要打开」按钮
3. 或者在终端执行：
   ```bash
   xattr -cr /Applications/MobausStudio.app
   ```

### Windows 提示"Windows 已保护你的电脑"

这是 Windows SmartScreen 的保护机制：

1. 点击「更多信息」
2. 点击「仍要运行」

### Linux AppImage 无法运行

确保已添加执行权限：

```bash
chmod +x MobausStudio_*.AppImage
```

如果仍然无法运行，可能缺少 FUSE：

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```

---

## 提供商与认证问题

### 如何连接 AI 服务？

MobausStudio 支持两种连接方式：

**方式一：OAuth 登录（推荐）**
1. 点击侧边栏的「提供商」图标
2. 找到支持 OAuth 的提供商（OpenAI、Anthropic、Google、GitHub Copilot）
3. 点击「连接」，选择「OAuth 登录」
4. 在浏览器中完成授权

**方式二：API Key**
1. 点击侧边栏的「提供商」图标
2. 找到要连接的提供商，点击「连接」
3. 选择「API Key」方式
4. 输入你的 API Key

### OAuth 登录需要什么条件？

| 提供商 | 需要的订阅 |
|--------|-----------|
| OpenAI | ChatGPT Plus 或 Pro 订阅 |
| Anthropic | Claude Pro 或 Max 订阅 |
| Google AI | Google 账号（免费） |
| GitHub Copilot | GitHub Copilot 订阅 |

### OAuth 授权失败怎么办？

1. **检查浏览器**：确保浏览器没有阻止弹出窗口
2. **检查网络**：确保网络连接正常
3. **手动复制链接**：如果自动跳转失败，尝试手动复制授权链接到浏览器
4. **检查订阅状态**：确认你的订阅仍然有效

### API Key 无效怎么办？

1. **检查复制**：确认 Key 复制完整，没有多余空格
2. **检查有效期**：确认 Key 未过期或被撤销
3. **检查余额**：确认账户有足够余额
4. **检查权限**：部分 Key 可能有使用限制

### 如何获取 API Key？

在提供商连接页面，点击「获取 API Key」链接会跳转到对应服务商的官网：

| 提供商 | 获取地址 |
|--------|----------|
| OpenAI | platform.openai.com |
| Anthropic | console.anthropic.com |
| Google AI | aistudio.google.com |
| DeepSeek | platform.deepseek.com |

### 连接提供商后为什么还要添加模型？

提供商和模型是分开管理的：
- **提供商**：管理认证凭证（API Key 或 OAuth Token）
- **模型**：配置具体使用哪个模型及其参数

连接提供商后，需要在「模型」页面添加具体的模型配置才能使用。

---

## 使用问题

### 支持哪些 AI 模型？

MobausStudio 支持 15+ AI 服务提供商：

**热门提供商：**
- OpenAI（GPT-4o、GPT-4、GPT-3.5、o1 等）
- Anthropic（Claude 3.5、Claude 3 系列）
- Google AI（Gemini 2.0、Gemini 1.5 系列）
- DeepSeek（DeepSeek Chat、Reasoner）
- GitHub Copilot
- OpenRouter

**其他提供商：**
- Groq、xAI、Mistral、Cohere、Together AI、Fireworks AI、Perplexity、Cerebras

**本地服务：**
- Ollama、LM Studio

### 对话记录保存在哪里？

- **桌面版**: 保存在本地应用数据目录
  - macOS: `~/Library/Application Support/MobausStudio/`
  - Windows: `%APPDATA%\MobausStudio\`
  - Linux: `~/.config/MobausStudio/`
- **Web 版**: 保存在浏览器 localStorage

### 如何导出对话记录？

1. 点击侧边栏的「设置」图标
2. 选择「数据管理」
3. 点击「导出配置」
4. 勾选「对话记录」
5. 点击「导出」

### 如何备份所有数据？

1. 点击「设置」→「数据管理」→「导出配置」
2. 勾选所有选项（模型配置、智能体、技能、MCP 服务器、对话记录）
3. 点击「导出」保存文件

### 如何迁移到新电脑？

1. 在旧电脑上导出配置文件
2. 在新电脑上安装 MobausStudio
3. 点击「设置」→「数据管理」→「导入配置」
4. 选择之前导出的文件

---

## 智能体问题

### 智能体和直接对话有什么区别？

| 功能 | 直接对话 | 智能体 |
|------|---------|--------|
| 系统提示词 | 无 | 可自定义 |
| 技能绑定 | 无 | 支持 |
| MCP 工具 | 无 | 支持 |
| 权限控制 | 无 | 支持 |

### 为什么 MCP 服务器列表是空的？

需要先在 MCP 页面添加并连接 MCP 服务器，只有已连接的服务器才会显示在智能体配置中。

### 智能体的权限配置是必须的吗？

不是必须的。权限配置是可选的高级功能，用于限制智能体的操作范围，提高安全性。

### 什么是圆桌会议？

圆桌会议是一种多智能体协作功能，让多个 AI 智能体围绕同一话题进行讨论。适合需要多角度分析的场景，如方案评审、头脑风暴等。

### 如何发起圆桌会议？

1. 在对话页面点击「圆桌会议」按钮
2. 选择 2-5 个参与讨论的智能体
3. 设置讨论主题
4. 点击「开始会议」

详细说明请参考 [圆桌会议](./features/roundtable.md)。

---

## 网络问题

### API 请求超时

可能的原因和解决方法：

1. **网络不稳定**: 检查网络连接
2. **API 服务商限流**: 稍后重试
3. **代理设置问题**: 检查系统代理配置
4. **请求内容过长**: 减少输入内容或降低 Max Tokens

### 无法连接到 API

1. 确认提供商已连接（显示绿色「已连接」状态）
2. 确认模型配置正确
3. 检查是否需要配置代理
4. 确认 API 账户余额充足

---

## MCP 问题

### MCP 服务器无法启动

**stdio 方式：**

1. 确认 Node.js 已安装（运行 `node -v` 检查）
2. 确认 npx 命令可用
3. 检查启动命令和参数是否正确
4. 查看错误日志

**HTTP 方式：**

1. 确认端点地址格式正确（支持 http/https/ws/wss）
2. 确认远程服务器正在运行
3. 检查认证配置是否正确

### MCP 工具调用失败

1. 确认服务器正在运行（显示绿色状态）
2. 确认权限配置正确
3. 检查路径是否存在
4. 查看详细错误信息

### 如何设置 MCP 服务器自动启动？

在添加或编辑 MCP 服务器时，开启「自启动」选项，应用启动时会自动连接该服务器。

---

## 更新问题

### 如何检查更新？

- **桌面版**: 应用启动时自动检查，也可在「设置」→「关于」中手动检查
- **Web 版/Docker**: 需要手动更新部署

### 自动更新失败

1. 检查网络连接
2. 尝试手动下载最新版本安装
3. 查看应用日志获取详细错误信息

---

## Docker 问题

### 容器启动后无法访问

1. 确认容器正在运行：`docker ps`
2. 确认端口映射正确：`docker port mobaus-studio`
3. 检查防火墙设置
4. 查看容器日志：`docker logs mobaus-studio`

### 如何更新 Docker 镜像？

```bash
# 拉取最新镜像
docker pull ghcr.io/shulain/mobausstudio:latest

# 停止并删除旧容器
docker stop mobaus-studio
docker rm mobaus-studio

# 启动新容器
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
```

---

## 其他问题

### 如何反馈 Bug 或建议？

请在 GitHub 提交 Issue：[https://github.com/shulain/MobausStudio/issues](https://github.com/shulain/MobausStudio/issues)

提交时请包含：

- 操作系统和版本
- MobausStudio 版本
- 问题描述和复现步骤
- 相关截图或日志

### 是否开源？

是的，MobausStudio 采用 MIT 许可证开源。

### 数据安全吗？

- 所有数据存储在本地，不会上传到任何服务器
- 只有 API 请求会发送到对应的 AI 服务商
- API Key 和 OAuth Token 存储在本地配置文件中

---

## 没有找到答案？

如果以上内容没有解决你的问题，请：

1. 搜索 [已有 Issues](https://github.com/shulain/MobausStudio/issues)
2. 提交新的 [Issue](https://github.com/shulain/MobausStudio/issues/new)
