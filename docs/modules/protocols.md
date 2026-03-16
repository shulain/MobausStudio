# 协议模块 (protocols)

## 模块职责

v0.9.0: 统一管理 AI 服务提供商的通信协议，包括：
- 协议抽象层定义
- 内置协议实现（OpenAI、Anthropic、Google、AWS）
- 协议自动选择和手动选择
- 消息格式转换
- 流式响应解析

## 设计背景

### 问题

当前实现为每个提供商单独封装了一个函数：
- `chat_stream_anthropic` - Anthropic 协议
- `chat_stream_google` - Google Cloud Code 协议
- `chat_stream_kiro` - Kiro/Amazon Q 协议
- `chat_stream_codex_api` - ChatGPT Codex 协议
- `chat_stream_responses_api` - OpenAI Responses API
- `chat_stream_message` - OpenAI Chat Completions (默认)

**问题**：
1. 代码重复，每个函数都有类似的流式处理逻辑
2. 自定义提供商只能使用 OpenAI 协议
3. 用户无法为自定义模型选择其他协议（如 Anthropic 兼容的服务）

### 解决方案

将协议封装为可复用模块：
- 内置提供商自动匹配对应协议
- 自定义提供商/模型可选择使用哪种协议
- 统一的流式响应处理逻辑

## 协议类型

### ProtocolType

```typescript
type ProtocolType = 'openai' | 'anthropic' | 'google' | 'aws';
```

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| openai | OpenAI Chat Completions API | OpenAI、DeepSeek、Groq、Together、Ollama 等兼容服务 |
| anthropic | Anthropic Messages API | Claude API 兼容服务 |
| google | Google Gemini API | Gemini API 兼容服务 |
| aws | AWS Bedrock / Amazon Q | AWS Bedrock、Kiro 等服务 |

### 协议差异

| 协议 | 端点格式 | 认证方式 | 消息格式 | 流式格式 |
|------|----------|----------|----------|----------|
| OpenAI | `/chat/completions` | Bearer Token | `messages: [{role, content}]` | SSE `data: {...}` |
| Anthropic | `/messages` (自动补全 /v1) | x-api-key / Bearer | `messages: [{role, content: [{type, text}]}]` | SSE `event: xxx\ndata: {...}` |
| Google | `/generateContent` | API Key / OAuth | `contents: [{role, parts}]` | SSE `data: {...}` |
| AWS | 自定义端点 | Bearer Token | `conversationState` | AWS Event Stream 二进制 |

### Base URL 标准 (v4.1.46)

| 协议 | 用户输入 | 自动补全后 | 说明 |
|------|----------|------------|------|
| Anthropic | `https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` | 自动补全 /v1 路径 |
| OpenAI | `https://api.openai.com/v1` | `https://api.openai.com/v1/chat/completions` | 用户需包含 /v1 |
| Google | `https://generativelanguage.googleapis.com/v1beta` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | 用户需包含 /v1beta |
| AWS | 完整端点 | 不修改 | 使用用户提供的完整端点 |

## 接口定义

### Rust Trait: ChatProtocol

```rust
/// 聊天协议 trait
///
/// 定义了不同 AI 服务提供商的通信协议接口
pub trait ChatProtocol: Send + Sync {
    /// 获取协议名称
    fn name(&self) -> &'static str;

    /// 构建请求 URL
    fn build_url(&self, request: &ChatStreamRequest) -> String;

    /// 构建请求头
    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap;

    /// 构建请求体
    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value;

    /// 解析流式响应块
    ///
    /// 返回解析出的事件列表
    fn parse_chunk(
        &self,
        chunk: &[u8],
        buffer: &mut StreamBuffer,
    ) -> Vec<StreamEvent>;
}
```

### StreamEvent

```rust
/// 流式响应事件
pub enum StreamEvent {
    /// 文本内容块
    Chunk { content: String },
    /// 推理内容块（thinking mode）
    ReasoningChunk { content: String },
    /// 工具调用
    ToolCall { id: String, name: String, arguments: String },
    /// 使用统计
    Usage { prompt_tokens: i32, completion_tokens: i32, total_tokens: i32 },
    /// 完成
    Done,
    /// 错误
    Error { message: String },
}
```

## 提供商默认协议映射

```typescript
const PROVIDER_DEFAULT_PROTOCOL: Record<string, ProtocolType> = {
    // OpenAI 兼容
    'openai': 'openai',
    'deepseek': 'openai',
    'groq': 'openai',
    'together': 'openai',
    'openrouter': 'openai',
    'mistral': 'openai',
    'xai': 'openai',
    'fireworks': 'openai',
    'perplexity': 'openai',
    'cerebras': 'openai',
    'ollama': 'openai',
    'lmstudio': 'openai',

    // Anthropic
    'anthropic': 'anthropic',

    // Google
    'google': 'google',

    // AWS
    'kiro': 'aws',
    'bedrock': 'aws',

    // 自定义默认使用 OpenAI
    'custom': 'openai',
};
```

## 测试用例

### 协议选择测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-001 | 内置提供商自动选择协议 | provider=openai | 使用 openai 协议 |
| TC-PROTO-002 | 内置提供商自动选择协议 | provider=anthropic | 使用 anthropic 协议 |
| TC-PROTO-003 | 内置提供商自动选择协议 | provider=google | 使用 google 协议 |
| TC-PROTO-004 | 内置提供商自动选择协议 | provider=kiro | 使用 aws 协议 |
| TC-PROTO-005 | 自定义提供商默认协议 | provider=custom, protocol=undefined | 使用 openai 协议 |
| TC-PROTO-006 | 自定义提供商指定协议 | provider=custom, protocol=anthropic | 使用 anthropic 协议 |
| TC-PROTO-007 | 模型覆盖协议 | provider=custom, model.protocol=google | 使用 google 协议 |

### 协议选择器国际化测试 (v0.9.5)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-I18N-001 | 中文环境协议标签 | language=zh | 下拉选项显示中文标签和说明 |
| TC-PROTO-I18N-002 | 英文环境协议标签 | language=en | 下拉选项显示英文标签和说明 |
| TC-PROTO-I18N-003 | 中文环境协议提示 | language=zh, 自定义协议 | 提示文字显示中文 |
| TC-PROTO-I18N-004 | 英文环境协议提示 | language=en, 默认协议 | 提示文字显示英文 |

### 消息格式转换测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-MSG-001 | OpenAI 消息格式 | messages=[{role,content}] | 保持原格式 |
| TC-PROTO-MSG-002 | Anthropic 消息格式 | messages=[{role,content}] | 转换为 [{role, content:[{type,text}]}] |
| TC-PROTO-MSG-003 | Google 消息格式 | messages=[{role,content}] | 转换为 [{role, parts:[{text}]}] |
| TC-PROTO-MSG-004 | AWS 消息格式 | messages=[{role,content}] | 转换为 conversationState 格式 |
| TC-PROTO-MSG-005 | System prompt 处理 | system_prompt="xxx" | 各协议正确处理 |

### 流式响应解析测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-STREAM-001 | OpenAI SSE 解析 | data: {"choices":[...]} | 正确提取 content |
| TC-PROTO-STREAM-002 | Anthropic SSE 解析 | event: content_block_delta\ndata: {...} | 正确提取 delta.text |
| TC-PROTO-STREAM-003 | Google SSE 解析 | data: {"candidates":[...]} | 正确提取 parts[0].text |
| TC-PROTO-STREAM-004 | AWS Event Stream 解析 | 二进制消息 | 正确解析 assistantResponseEvent |
| TC-PROTO-STREAM-005 | 工具调用解析 | tool_calls 数据 | 正确提取工具调用信息 |

### Google 工具调用测试 (v4.1.37)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-GOOGLE-TOOL-001 | 工具注册 | request.tools 非空 | build_body 包含 tools.functionDeclarations |
| TC-PROTO-GOOGLE-TOOL-002 | functionCall 消息转换 | assistant 消息带 tool_calls | 转为 model 角色 functionCall part |
| TC-PROTO-GOOGLE-TOOL-003 | functionResponse 消息转换 | tool 角色消息 | 转为 user 角色 functionResponse part |
| TC-PROTO-GOOGLE-TOOL-004 | thought_signature 回传 | tool_call 含 thought_signature | functionCall part 中包含 thought_signature |
| TC-PROTO-GOOGLE-TOOL-005 | 响应解析 functionCall | 响应含 functionCall part | 生成 ToolCallComplete 事件 |
| TC-PROTO-GOOGLE-TOOL-006 | 响应解析 thought_signature | 响应 functionCall 含 thoughtSignature | ToolCallComplete 事件含 thought_signature |
| TC-PROTO-GOOGLE-TOOL-007 | 连续同角色消息合并 | 两个连续 user 消息 | 合并为一个 user 消息 |
| TC-PROTO-GOOGLE-TOOL-008 | 未完成工具调用补充占位结果 | assistant 有 tool_calls 但无对应 tool 结果 | 自动补充占位 functionResponse |
| TC-PROTO-GOOGLE-TOOL-009 | 消息截断防超限 | 超长消息列表 | 截断旧消息，保留最近对话 |

### Kiro 输入长度测试 (v4.1.37)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-KIRO-001 | chatHistory 去重 currentMessage | 最后一条 user 消息 | chatHistory 不含最后一条，currentMessage 包含 |
| TC-PROTO-KIRO-002 | 消息截断 | 超过 200k 字符的消息列表 | 从头部截断旧消息 |
| TC-PROTO-KIRO-003 | 截断后首条为 user | 截断后首条为 assistant | 移除首条，确保以 user 开头 |
| TC-PROTO-KIRO-004 | 工具结果消息处理 | tool 角色消息 | 正确包装为 toolResults 格式 |

### Anthropic URL 构建测试 (v4.1.46)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-ANTHROPIC-URL-001 | 默认端点 | endpoint=None | `https://api.anthropic.com/v1/messages` |
| TC-PROTO-ANTHROPIC-URL-002 | OAuth 模式 | OAuth token + endpoint=None | `https://api.anthropic.com/v1/messages?beta=true` |
| TC-PROTO-ANTHROPIC-URL-003 | Base URL 输入 | endpoint=`https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` |
| TC-PROTO-ANTHROPIC-URL-004 | 完整 URL 输入 | endpoint=`https://api.anthropic.com/v1/messages` | `https://api.anthropic.com/v1/messages` |
| TC-PROTO-ANTHROPIC-URL-005 | 尾部斜杠处理 | endpoint=`https://api.anthropic.com/` | `https://api.anthropic.com/v1/messages` |
| TC-PROTO-ANTHROPIC-URL-006 | 自定义代理 | endpoint=`https://proxy.example.com` | `https://proxy.example.com/v1/messages` |

### test_anthropic URL 构建测试 (v4.1.47)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-TEST-ANTHROPIC-URL-001 | 默认端点 | endpoint=None | `https://api.anthropic.com/v1/messages` |
| TC-TEST-ANTHROPIC-URL-002 | Base URL 输入（不带 /v1） | endpoint=`https://api.anthropic.com` | `https://api.anthropic.com/v1/messages` |
| TC-TEST-ANTHROPIC-URL-003 | 完整 URL 输入（带 /v1） | endpoint=`https://api.anthropic.com/v1` | `https://api.anthropic.com/v1/messages` |
| TC-TEST-ANTHROPIC-URL-004 | 尾部斜杠处理 | endpoint=`https://api.anthropic.com/` | `https://api.anthropic.com/v1/messages` |
| TC-TEST-ANTHROPIC-URL-005 | 自定义代理 | endpoint=`https://proxy.example.com` | `https://proxy.example.com/v1/messages` |

### 响应格式检测测试 (v4.1.46)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-FORMAT-001 | 正常 SSE 响应 | 标准 SSE 流 | 正常解析，不报错 |
| TC-PROTO-FORMAT-002 | HTML 响应检测 | 响应为 HTML 页面 | 检测到 HTML，返回错误给用户 |
| TC-PROTO-FORMAT-003 | 请求地址日志 | 任意请求 | 打印请求 URL 到日志 |
| TC-PROTO-FORMAT-004 | 响应状态码日志 | 任意响应 | 打印响应状态码到日志 |

## 文件结构

```
src-tauri/src/
├── protocol/
│   ├── mod.rs          # 协议 trait 定义和分发逻辑
│   ├── openai.rs       # OpenAI 协议实现
│   ├── anthropic.rs    # Anthropic 协议实现
│   ├── google.rs       # Google 协议实现
│   └── aws.rs          # AWS 协议实现
└── lib.rs              # 修改 chat_stream_message 使用协议分发

src/
├── types/index.ts      # 添加 ProtocolType 类型
└── data/
    └── protocols.ts    # 协议配置数据
```

## 错误处理

### 错误类型定义

所有错误消息必须支持国际化，使用 i18n key 而非硬编码字符串。

#### AppError 基类

```typescript
/**
 * 应用错误基类
 *
 * 所有自定义错误都应继承此类，支持国际化和参数插值
 */
export class AppError extends Error {
  /** i18n 翻译 key */
  readonly i18nKey: string;
  /** 翻译参数 */
  readonly params?: Record<string, string | number>;
  /** 原始错误（如果有） */
  readonly cause?: Error;

  constructor(i18nKey: string, params?: Record<string, string | number>, cause?: Error) {
    super(i18nKey);
    this.name = this.constructor.name;
    this.i18nKey = i18nKey;
    this.params = params;
    this.cause = cause;
  }
}
```

#### 具体错误类

| 错误类 | i18n Key 前缀 | 使用场景 |
|--------|---------------|----------|
| SkillNotFoundError | errors.skill.notFound | 技能不存在 |
| SkillInstallError | errors.skill.installFailed | 技能安装失败 |
| ModelFetchError | errors.model.fetchFailed | 模型获取失败 |
| ProviderConnectionError | errors.provider.connectionFailed | 提供商连接失败 |
| OAuthError | errors.oauth.* | OAuth 认证失败 |
| ProtocolError | errors.protocol.* | 协议处理错误 |

### 错误消息国际化

#### 中文 (zh.ts)

```typescript
export const zh = {
  errors: {
    skill: {
      notFound: '技能 "{{skillId}}" 不存在',
      installFailed: '安装技能失败：{{reason}}',
    },
    model: {
      fetchFailed: '获取模型列表失败：{{reason}}',
      fallbackToCache: '使用缓存数据',
      fallbackToBuiltin: '使用内置数据',
    },
    provider: {
      connectionFailed: '连接提供商失败：{{provider}}',
      invalidCredentials: '认证信息无效',
    },
    oauth: {
      authorizationFailed: 'OAuth 授权失败',
      tokenRefreshFailed: 'Token 刷新失败',
    },
    protocol: {
      unsupportedProtocol: '不支持的协议：{{protocol}}',
      parseError: '解析响应失败：{{reason}}',
    },
  },
};
```

#### 英文 (en.ts)

```typescript
export const en = {
  errors: {
    skill: {
      notFound: 'Skill "{{skillId}}" not found',
      installFailed: 'Failed to install skill: {{reason}}',
    },
    model: {
      fetchFailed: 'Failed to fetch model list: {{reason}}',
      fallbackToCache: 'Using cached data',
      fallbackToBuiltin: 'Using built-in data',
    },
    provider: {
      connectionFailed: 'Failed to connect to provider: {{provider}}',
      invalidCredentials: 'Invalid credentials',
    },
    oauth: {
      authorizationFailed: 'OAuth authorization failed',
      tokenRefreshFailed: 'Token refresh failed',
    },
    protocol: {
      unsupportedProtocol: 'Unsupported protocol: {{protocol}}',
      parseError: 'Failed to parse response: {{reason}}',
    },
  },
};
```

### 错误处理测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-I18N-001 | 中文环境错误消息 | locale=zh, throw SkillNotFoundError('test-skill') | 显示"技能 \"test-skill\" 不存在" |
| TC-I18N-002 | 英文环境错误消息 | locale=en, throw SkillNotFoundError('test-skill') | 显示"Skill \"test-skill\" not found" |
| TC-I18N-003 | 错误参数插值 | throw ModelFetchError({reason: 'Network error'}) | 正确替换 {{reason}} 参数 |

### OAuth 服务测试用例

#### Google OAuth 测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-OAUTH-GOOGLE-001 | 成功授权流程 | 正确的授权码 | 返回 accessToken 和 refreshToken |
| TC-OAUTH-GOOGLE-002 | 授权码交换失败 | 无效的授权码 | 返回 type='failed' 和错误信息 |
| TC-OAUTH-GOOGLE-003 | State 验证失败 | 不匹配的 state | 返回 CSRF 错误 |
| TC-OAUTH-GOOGLE-004 | Token 刷新成功 | 有效的 refreshToken | 返回新的 accessToken |
| TC-OAUTH-GOOGLE-005 | Token 刷新失败 | 无效的 refreshToken | 返回 type='failed' |
| TC-OAUTH-GOOGLE-006 | Antigravity onboard | 新用户授权 | 自动创建 GCP 项目，返回 projectId |

#### Anthropic OAuth 测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-OAUTH-ANTHROPIC-001 | Max 模式授权成功 | mode='max', 正确授权码 | 返回 OAuth token |
| TC-OAUTH-ANTHROPIC-002 | Console 模式授权成功 | mode='console', 正确授权码 | 返回 API Key |
| TC-OAUTH-ANTHROPIC-003 | 授权码格式错误 | 缺少 state 的授权码 | 正确解析并交换 |
| TC-OAUTH-ANTHROPIC-004 | Token 刷新成功 | 有效的 refreshToken | 返回新的 accessToken |
| TC-OAUTH-ANTHROPIC-005 | Token 刷新失败 | 无效的 refreshToken | 返回 type='failed' |

#### OpenAI OAuth 测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-OAUTH-OPENAI-001 | 成功授权流程 | 正确的授权码 | 返回 accessToken 和 idToken |
| TC-OAUTH-OPENAI-002 | 授权码交换失败 | 无效的授权码 | 返回 type='failed' |
| TC-OAUTH-OPENAI-003 | State 验证失败 | 不匹配的 state | 返回 CSRF 错误 |
| TC-OAUTH-OPENAI-004 | Token 刷新成功 | 有效的 refreshToken | 返回新的 accessToken |
| TC-OAUTH-OPENAI-005 | Token 刷新失败 | 无效的 refreshToken | 返回 type='failed' |

#### Token Refresher 测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-REFRESH-001 | 启动自动续期服务 | 调用 start() | isRunning=true, 开始定时检查 |
| TC-REFRESH-002 | 停止自动续期服务 | 调用 stop() | isRunning=false, 清除定时器 |
| TC-REFRESH-003 | 检测即将过期 Token | expiresAt 在 30 分钟内 | 自动刷新 Token |
| TC-REFRESH-004 | 检测已过期 Token | expiresAt < now | 自动刷新 Token |
| TC-REFRESH-005 | 刷新成功 | 有效的 refreshToken | 更新凭证，通知回调 |
| TC-REFRESH-006 | 刷新失败但 Token 未过期 | 刷新失败，Token 还有 10 分钟 | 优雅降级，继续使用旧 Token |
| TC-REFRESH-007 | 刷新失败且 Token 已过期 | 刷新失败，Token 已过期 | 返回失败，通知回调 |
| TC-REFRESH-008 | 重试机制 | 第 1 次失败，第 2 次成功 | 自动重试，最终成功 |
| TC-REFRESH-009 | 防止重复刷新 | 同时调用 2 次 refreshToken | 只执行 1 次刷新 |
| TC-REFRESH-010 | 手动刷新 Token | 调用 refreshByProviderId | 立即刷新指定提供商 |

## 日志规范

### 日志级别使用场景

| 级别 | 使用场景 | 示例 |
|------|----------|------|
| debug | 开发调试信息 | 函数参数、中间变量 |
| info | 重要业务节点 | 用户登录、模型切换、技能安装 |
| warn | 可恢复的异常 | API 失败回退到缓存 |
| error | 不可恢复的错误 | 网络请求失败、解析错误 |

### LogTags 定义

```typescript
export enum LogTags {
  APP = 'APP',           // 应用主流程
  STORAGE = 'STORAGE',   // 存储操作
  MODEL = 'MODEL',       // 模型管理
  PROVIDER = 'PROVIDER', // 提供商管理
  SKILL = 'SKILL',       // 技能管理
  OAUTH = 'OAUTH',       // OAuth 认证
  PROTOCOL = 'PROTOCOL', // 协议处理
  MCP = 'MCP',           // MCP 服务
  AGENT = 'AGENT',       // Agent 管理
}
```

### 日志消息国际化

所有日志消息必须使用 i18n key，不允许硬编码中文或英文。

#### 错误示例

```typescript
// ❌ 硬编码中文
logger.info(LogTags.MODEL, '开始获取模型列表');
console.log('模型获取成功');

// ❌ 硬编码英文
logger.error(LogTags.OAUTH, 'Token refresh failed');
```

#### 正确示例

```typescript
// ✅ 使用 i18n key
logger.info(LogTags.MODEL, t('logs.model.fetchStart'));
logger.error(LogTags.OAUTH, t('logs.oauth.tokenRefreshFailed'), { error });
```

### 日志国际化配置

#### 中文 (zh.ts)

```typescript
export const zh = {
  logs: {
    model: {
      fetchStart: '开始获取模型列表',
      fetchSuccess: '模型列表获取成功',
      fetchFailed: '模型列表获取失败',
      fallbackToCache: '回退到缓存数据',
    },
    provider: {
      connecting: '正在连接提供商：{{provider}}',
      connected: '提供商连接成功',
      disconnected: '提供商已断开',
    },
    oauth: {
      authStart: '开始 OAuth 授权',
      authSuccess: 'OAuth 授权成功',
      tokenRefreshFailed: 'Token 刷新失败',
    },
  },
};
```

#### 英文 (en.ts)

```typescript
export const en = {
  logs: {
    model: {
      fetchStart: 'Fetching model list',
      fetchSuccess: 'Model list fetched successfully',
      fetchFailed: 'Failed to fetch model list',
      fallbackToCache: 'Falling back to cached data',
    },
    provider: {
      connecting: 'Connecting to provider: {{provider}}',
      connected: 'Provider connected successfully',
      disconnected: 'Provider disconnected',
    },
    oauth: {
      authStart: 'Starting OAuth authorization',
      authSuccess: 'OAuth authorization successful',
      tokenRefreshFailed: 'Token refresh failed',
    },
  },
};
```

### 日志规范测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-LOG-001 | 中文环境日志 | locale=zh, logger.info(LogTags.MODEL, t('logs.model.fetchStart')) | 输出"[MODEL] 开始获取模型列表" |
| TC-LOG-002 | 英文环境日志 | locale=en, logger.info(LogTags.MODEL, t('logs.model.fetchStart')) | 输出"[MODEL] Fetching model list" |
| TC-LOG-003 | 日志参数插值 | logger.info(LogTags.PROVIDER, t('logs.provider.connecting', {provider: 'OpenAI'})) | 正确替换 {{provider}} 参数 |
| TC-LOG-004 | 禁止 console.log | 扫描所有源代码 | 除测试文件外，零 console.log |

### 日志脱敏规范

敏感信息必须脱敏后再记录：

```typescript
// ✅ 正确：脱敏 API Key
logger.info(LogTags.OAUTH, t('logs.oauth.tokenReceived'), {
  token: maskToken(token), // 只显示前4位和后4位
});

// ❌ 错误：直接记录敏感信息
logger.info(LogTags.OAUTH, 'Token:', token);
```

## 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 2024-01-XX | v0.9.0 | 初始版本，协议抽象层设计 | Claude |
| 2026-03-04 | v4.1.46 | Anthropic 协议自动补全 /v1 路径；所有流式协议添加请求地址和响应状态码日志；所有流式协议添加 HTML 响应格式检测；移除 anthropic.rs 中重复的消息合并逻辑 | Claude |
| 2026-03-04 | v0.9.1 | 添加错误处理和日志规范章节；定义 AppError 基类和具体错误类；添加错误消息和日志消息国际化配置；添加测试用例 TC-I18N-001~003、TC-LOG-001~004 | - |
| 2026-03-06 | v4.1.47 | 修复 test_anthropic 函数 URL 构建逻辑，自动补全 /v1 路径；添加测试用例 TC-TEST-ANTHROPIC-URL-001~005 | Claude |
| 2026-03-13 | v0.9.5 | 修复协议选择器硬编码中文问题，使用 getLocalizedText 根据当前语言动态显示协议标签和说明 | - |
