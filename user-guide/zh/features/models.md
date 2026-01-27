# 模型配置

MobausStudio 支持多种 AI 模型，本文介绍如何配置和管理模型。

## 支持的模型

### OpenAI

- GPT-4o
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

### Anthropic

- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku

### 其他兼容模型

任何兼容 OpenAI API 格式的模型：
- Azure OpenAI
- 本地部署的开源模型（通过 Ollama、LM Studio 等）
- 其他第三方 API 服务

---

## 配置步骤

### 1. 打开设置

点击侧边栏的「⚙️ 设置」图标，选择「模型配置」。

### 2. 添加 API 密钥

#### OpenAI

1. 访问 [OpenAI API Keys](https://platform.openai.com/api-keys)
2. 创建新的 API Key
3. 复制密钥，粘贴到 MobausStudio 的 OpenAI API Key 输入框

#### Anthropic

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 创建 API Key
3. 复制密钥，粘贴到 MobausStudio 的 Anthropic API Key 输入框

### 3. 选择默认模型

配置完成后，选择一个默认使用的模型。

---

## 自定义 API 端点

如果你使用代理或自托管服务，可以配置自定义 API 端点：

### OpenAI 兼容端点

```
https://your-proxy.com/v1
```

### 常见场景

| 场景 | 端点配置 |
|------|----------|
| OpenAI 官方 | `https://api.openai.com/v1`（默认） |
| Azure OpenAI | `https://your-resource.openai.azure.com/` |
| 本地 Ollama | `http://localhost:11434/v1` |
| 第三方代理 | 根据服务商提供的地址 |

---

## 模型参数

### Temperature（温度）

控制回复的随机性：
- **0**: 最确定性，适合代码、事实性问答
- **0.7**: 平衡（默认）
- **1+**: 更有创意，适合创作

### Max Tokens（最大令牌数）

限制回复的最大长度。根据需要调整：
- 简短回答：500-1000
- 详细解释：2000-4000
- 长文生成：4000+

### Top P

另一种控制随机性的参数，通常保持默认值 1。

---

## 模型选择建议

### 日常对话

推荐：**GPT-3.5 Turbo** 或 **Claude 3 Haiku**
- 响应速度快
- 成本较低
- 足够处理大多数对话

### 复杂任务

推荐：**GPT-4o** 或 **Claude 3.5 Sonnet**
- 推理能力强
- 代码质量高
- 理解复杂指令

### 长文本处理

推荐：**Claude 3** 系列
- 支持更长的上下文
- 长文本理解能力强

### 代码生成

推荐：**GPT-4o** 或 **Claude 3.5 Sonnet**
- 代码质量高
- 支持多种编程语言
- 能理解复杂需求

---

## 费用说明

使用 AI 模型需要支付 API 费用，费用由模型提供商收取：

| 模型 | 大致费用（每百万 Token） |
|------|-------------------------|
| GPT-3.5 Turbo | $0.5 - $1.5 |
| GPT-4o | $2.5 - $10 |
| Claude 3 Haiku | $0.25 - $1.25 |
| Claude 3.5 Sonnet | $3 - $15 |

> 💡 具体费用请参考各服务商官网，价格可能会变动。

---

## 故障排除

### API 密钥无效

- 确认密钥复制完整，没有多余空格
- 确认密钥未过期或被撤销
- 确认账户有足够余额

### 请求超时

- 检查网络连接
- 尝试使用代理
- 减少请求的 Max Tokens

### 模型不可用

- 确认 API 端点正确
- 确认账户有权限使用该模型
- 查看服务商状态页面

---

## 下一步

- [MCP 服务](./mcp.md) - 让 AI 使用外部工具
- [技能系统](./skills.md) - 使用预设提示词
