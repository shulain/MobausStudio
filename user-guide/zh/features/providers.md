# 提供商管理

提供商（Provider）是 MobausStudio 连接 AI 服务的核心功能。通过提供商管理，你可以轻松连接各种 AI 服务，无需手动配置复杂的 API 设置。

## 什么是提供商？

提供商是 AI 服务的来源，例如 OpenAI、Anthropic、Google 等。每个提供商提供不同的 AI 模型，连接提供商后，你就可以使用该提供商的所有模型。

---

## 支持的提供商

### 热门提供商

| 提供商 | 说明 | 认证方式 |
|--------|------|----------|
| 🤖 OpenAI | GPT-4、GPT-4o、o1 等模型 | OAuth 登录 / API Key |
| 🧠 Anthropic | Claude 3.5、Claude 3 系列 | OAuth 登录 / API Key |
| ✨ Google AI | Gemini 2.0、Gemini 1.5 系列 | OAuth 登录 / API Key |
| 🔍 DeepSeek | DeepSeek Chat、Reasoner | API Key |
| 🐙 GitHub Copilot | 使用 Copilot 订阅访问多种模型 | OAuth 登录 |
| 🌐 OpenRouter | 统一 API 访问多种模型 | API Key |
| ⚙️ Custom | 自定义 OpenAI 兼容端点 | API Key / 无需认证 |

### 其他提供商

| 提供商 | 说明 |
|--------|------|
| ⚡ Groq | 超快速推理 |
| 🚀 xAI | Grok 系列模型 |
| 🌪️ Mistral AI | Mistral 系列模型 |
| 🔷 Cohere | Command 系列模型 |
| 🤝 Together AI | 开源模型托管 |
| 🎆 Fireworks AI | 高性能推理 |
| 🔮 Perplexity | 联网搜索增强 |
| 🧩 Cerebras | 超快速推理 |

### 企业/云服务

| 提供商 | 说明 |
|--------|------|
| ☁️ Azure OpenAI | 微软 Azure 托管 |
| 🏔️ AWS Bedrock | AWS 托管多种模型 |
| 🔺 Google Vertex AI | Google Cloud 企业级 AI |

### 本地服务

| 提供商 | 说明 |
|--------|------|
| 🦙 Ollama | 本地运行开源模型 |
| 🎬 LM Studio | 本地模型桌面应用 |

---

## 连接提供商

### 方式一：OAuth 登录（推荐）

部分提供商支持 OAuth 登录，这是最简单的连接方式：

1. 点击侧边栏的「🔌 提供商」图标
2. 找到要连接的提供商，点击「连接」
3. 选择「OAuth 登录」方式
4. 点击「开始授权」，浏览器会自动打开
5. 在浏览器中登录你的账号并授权
6. 授权完成后自动返回应用

**支持 OAuth 的提供商：**
- OpenAI（使用 ChatGPT Plus/Pro 订阅）
- Anthropic（使用 Claude Pro/Max 订阅）
- Google AI（使用 Google 账号）
- GitHub Copilot（使用 GitHub 账号）

> 💡 **提示**：OAuth 登录会自动处理认证，无需手动复制 API Key。

### 方式二：API Key

1. 点击侧边栏的「🔌 提供商」图标
2. 找到要连接的提供商，点击「连接」
3. 选择「API Key」方式
4. 输入你的 API Key
5. 点击「连接」

**获取 API Key：**
- 点击「获取 API Key」链接，会打开对应服务商的官网
- 在官网创建 API Key 后复制粘贴

### 方式三：环境变量

部分企业级提供商支持通过环境变量配置：

1. 在系统中设置对应的环境变量
2. 重启 MobausStudio
3. 应用会自动检测并连接

---

## 管理提供商

### 查看连接状态

在提供商页面，你可以看到：

- **已连接**：显示绿色标识，可以使用该提供商的模型
- **未连接**：显示灰色标识，需要先连接
- **连接错误**：显示红色标识，需要检查凭证

### 断开连接

1. 找到已连接的提供商
2. 点击「断开」按钮
3. 确认断开

> ⚠️ 断开连接后，使用该提供商模型的对话将无法继续。

### 搜索和筛选

- 使用搜索框快速查找提供商
- 使用状态筛选器查看已连接/未连接的提供商

---

## 提供商与模型的关系

连接提供商后，该提供商的模型会自动可用：

1. 连接提供商（如 OpenAI）
2. 在「模型」页面添加具体模型（如 GPT-4o）
3. 在对话中选择使用该模型

> 💡 **提示**：一个提供商可以有多个模型，你可以根据需要添加不同的模型配置。

---

## 常见问题

### OAuth 授权失败

- 确保浏览器没有阻止弹出窗口
- 检查网络连接是否正常
- 尝试手动复制授权链接到浏览器

### API Key 无效

- 确认 Key 复制完整，没有多余空格
- 确认 Key 未过期或被撤销
- 确认账户有足够余额

### 本地服务连接失败

- 确认 Ollama 或 LM Studio 已启动
- 检查端口是否正确（Ollama 默认 11434，LM Studio 默认 1234）

---

## 下一步

- [模型配置](./models.md) - 添加和配置具体模型
- [对话功能](./chat.md) - 开始 AI 对话
