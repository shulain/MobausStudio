# 提供商模块 (providers)

## 模块职责

管理 AI 服务提供商的认证和连接，包括：
- 提供商列表展示和搜索
- API Key 认证
- OAuth 认证（GitHub Copilot、OpenAI、Anthropic、Google 等）
- 凭证安全存储
- 连接状态管理

## 接口定义

### ProviderCredentialsStorage

提供商凭证存储服务

#### save(credentials: ProviderCredential[]): Promise<void>

保存所有凭证

**参数：**
- credentials (ProviderCredential[]): 凭证列表

**返回：**
- Promise<void>

#### load(): Promise<ProviderCredential[]>

加载所有凭证

**返回：**
- Promise<ProviderCredential[]>: 凭证列表

#### add(credential: ProviderCredential): Promise<void>

添加单个凭证

**参数：**
- credential (ProviderCredential): 凭证对象

**返回：**
- Promise<void>

#### remove(providerId: string): Promise<void>

删除指定提供商的凭证

**参数：**
- providerId (string): 提供商 ID

**返回：**
- Promise<void>

#### get(providerId: string): Promise<ProviderCredential | null>

获取指定提供商的凭证

**参数：**
- providerId (string): 提供商 ID

**返回：**
- Promise<ProviderCredential | null>: 凭证对象或 null

### useProviders Hook

Provider 状态管理 Hook

#### 返回值

```typescript
{
    providers: AIProvider[];           // 所有提供商列表
    connectedProviders: AIProvider[];  // 已连接的提供商
    popularProviders: AIProvider[];    // 热门提供商
    connect: (input: ProviderConnectInput) => Promise<boolean>;  // 连接提供商
    disconnect: (providerId: string) => Promise<void>;           // 断开连接
    testConnection: (providerId: string) => Promise<boolean>;    // 测试连接
    isLoading: boolean;                // 加载状态
}
```

## 类型定义

### ProviderAuthType

```typescript
type ProviderAuthType = 'api' | 'oauth' | 'env' | 'none';
```

| 值 | 说明 |
|----|------|
| api | API Key 认证 |
| oauth | OAuth 认证 |
| env | 环境变量认证 |
| none | 无需认证（本地服务） |

### ProviderStatus

```typescript
type ProviderStatus = 'connected' | 'disconnected' | 'error';
```

| 值 | 说明 |
|----|------|
| connected | 已连接 |
| disconnected | 未连接 |
| error | 连接错误 |

### AIProvider

```typescript
interface AIProvider {
    id: string;                    // 提供商 ID
    name: string;                  // 显示名称
    icon: string;                  // 图标
    description?: string;          // 描述
    note?: { zh: string; en: string };  // 说明文字
    website?: string;              // 官网地址（用于获取 API Key 链接）(v3.4.10)
    defaultEndpoint: string;       // 默认端点
    envKeys?: string[];            // 环境变量名
    authMethods: ProviderAuthMethod[];  // 认证方式
    models: ProviderModel[];       // 模型列表
    status: ProviderStatus;        // 连接状态
    source?: ProviderSource;       // 认证来源
    popular?: boolean;             // 是否热门
    category?: 'popular' | 'cloud' | 'local' | 'other';
    requiresEndpoint?: boolean;    // 是否需要自定义端点 (v3.4.8)
}
```

### ProviderCredential

```typescript
interface ProviderCredential {
    providerId: string;
    type: ProviderAuthType;
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;   // v3.3.5: OpenAI/ChatGPT 账户 ID（用于 Codex API）
    projectId?: string;   // v3.4.3: Google Cloud 项目 ID（用于 Cloud Code API）
    createdAt: Date;
    updatedAt: Date;
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| providerId | string | 提供商 ID |
| type | ProviderAuthType | 认证类型 |
| apiKey | string? | API Key（api 类型认证） |
| accessToken | string? | OAuth Access Token |
| refreshToken | string? | OAuth Refresh Token |
| expiresAt | number? | Token 过期时间戳 |
| accountId | string? | OpenAI 账户 ID，用于 ChatGPT Codex API 调用 |
| projectId | string? | Google Cloud 项目 ID，用于 Cloud Code API 调用 |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

## 测试用例

### 凭证存储测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROV-001 | 保存凭证 | 有效的 ProviderCredential | 保存成功，可重新加载 |
| TC-PROV-002 | 加载凭证 | 已保存的凭证 | 返回正确的凭证列表 |
| TC-PROV-003 | 添加单个凭证 | 新的 ProviderCredential | 添加成功，列表长度+1 |
| TC-PROV-004 | 删除凭证 | 存在的 providerId | 删除成功，列表长度-1 |
| TC-PROV-005 | 获取凭证 | 存在的 providerId | 返回对应凭证 |
| TC-PROV-006 | 获取不存在的凭证 | 不存在的 providerId | 返回 null |
| TC-PROV-007 | 更新凭证 | 已存在的 providerId | 更新成功，旧凭证被覆盖 |
| TC-PROV-008 | 保存含 accountId 的凭证 | OpenAI OAuth 凭证 | accountId 正确序列化和反序列化 |
| TC-PROV-009 | 保存含 projectId 的凭证 | Google OAuth 凭证 | projectId 正确序列化和反序列化 |

### 提供商连接测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROV-010 | API Key 连接成功 | 有效的 API Key | status='connected' |
| TC-PROV-011 | API Key 连接失败 | 无效的 API Key | status='error'，显示错误信息 |
| TC-PROV-012 | 断开连接 | 已连接的 providerId | status='disconnected'，凭证被删除 |
| TC-PROV-013 | 测试连接成功 | 有效凭证 | 返回 true |
| TC-PROV-014 | 测试连接失败 | 无效凭证 | 返回 false |

### UI 组件测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROV-020 | 显示提供商列表 | 15+ 提供商数据 | 正确渲染所有提供商 |
| TC-PROV-021 | 搜索提供商 | 搜索关键词 "open" | 显示匹配的提供商 |
| TC-PROV-022 | 分组显示 | 热门/其他分类 | 正确分组显示 |
| TC-PROV-023 | 连接对话框 | 点击连接按钮 | 显示 API Key 输入框 |
| TC-PROV-024 | 密钥显示切换 | 点击眼睛图标 | 切换密码显示/隐藏 |

## 支持的提供商

### 热门提供商

| ID | 名称 | 认证方式 | 默认端点 |
|----|------|----------|----------|
| openai | OpenAI | API Key / OAuth | https://api.openai.com/v1 |
| anthropic | Anthropic | API Key / OAuth | https://api.anthropic.com/v1 |
| google | Google AI | OAuth / API Key | https://generativelanguage.googleapis.com/v1beta |
| deepseek | DeepSeek | API Key | https://api.deepseek.com/v1 |
| github-copilot | GitHub Copilot | OAuth | GitHub Device Flow |
| kiro | Kiro | OAuth | AWS Builder ID Device Flow (v0.7.2) |
| qwen | 通义千问 | API Key | DashScope API (v0.7.2) |
| openrouter | OpenRouter | API Key | https://openrouter.ai/api/v1 |

### 扩展提供商

| ID | 名称 | 认证方式 | 默认端点 |
|----|------|----------|----------|
| groq | Groq | API Key | https://api.groq.com/openai/v1 |
| xai | xAI (Grok) | API Key | https://api.x.ai/v1 |
| mistral | Mistral | API Key | https://api.mistral.ai/v1 |
| cohere | Cohere | API Key | https://api.cohere.ai/v1 |
| together | Together AI | API Key | https://api.together.xyz/v1 |
| fireworks | Fireworks AI | API Key | https://api.fireworks.ai/inference/v1 |
| perplexity | Perplexity | API Key | https://api.perplexity.ai |
| cerebras | Cerebras | API Key | https://api.cerebras.ai/v1 |

### 企业/云服务

| ID | 名称 | 认证方式 | 说明 |
|----|------|----------|------|
| azure | Azure OpenAI | API Key + 环境变量 | 需要 AZURE_RESOURCE_NAME |
| bedrock | AWS Bedrock | 环境变量 | AWS_ACCESS_KEY_ID 等 |
| vertex | Google Vertex AI | 环境变量 | GOOGLE_CLOUD_PROJECT |

### 本地/自定义

| ID | 名称 | 认证方式 | 说明 |
|----|------|----------|------|
| ollama | Ollama | 无需认证 | 本地运行，默认 http://localhost:11434 |
| lmstudio | LM Studio | 无需认证 | 本地运行，默认 http://localhost:1234 |

**注意：** 自定义提供商功能已独立实现，详见 [custom-providers.md](./custom-providers.md)。

## 模型动态获取 (v3.3.3)

### 功能说明

连接提供商后，系统会自动尝试从多个数据源获取最新的模型列表，而不是仅使用内置的静态数据。

### 获取策略（按优先级）

1. **models.dev**：从远程数据库获取最新模型列表（推荐，与 opencode 相同实现）
2. **提供商 API**：调用提供商 API 获取实时模型列表
3. **缓存数据**：使用本地缓存的模型列表（24小时有效）
4. **内置数据**：使用代码中写死的基础数据作为 fallback

### models.dev 数据源 (v3.3.3 新增)

[models.dev](https://models.dev) 是一个开源的 AI 模型数据库，提供最新的模型信息，包括：
- 模型 ID 和名称
- 上下文窗口和输出限制
- 价格信息（输入/输出/缓存）
- 能力支持（视觉、函数调用、推理等）
- 支持的输入/输出模态

**优势**：
- 数据更新及时，无需等待应用更新
- 覆盖 75+ 提供商
- 与 opencode 等工具使用相同数据源

### 支持动态获取的提供商

| 提供商 | API 端点 | models.dev | 说明 |
|--------|----------|------------|------|
| OpenAI | GET /v1/models | ✅ 支持 | 优先使用 models.dev |
| OpenRouter | GET /api/v1/models | ✅ 支持 | 返回所有可用模型 |
| Google AI | GET /v1beta/models | ✅ 支持 | 支持 |
| Groq | GET /openai/v1/models | ✅ 支持 | 支持 |
| Together AI | GET /v1/models | ✅ 支持 | 支持 |
| Anthropic | ❌ 不支持 | ✅ 支持 | 使用 models.dev 或内置数据 |
| DeepSeek | ❌ 不支持 | ✅ 支持 | 使用 models.dev 或内置数据 |

### 接口定义

#### modelFetcher.fetchModels()

从提供商获取模型列表

**参数：**
- providerId (string): 提供商 ID
- apiKey (string): API Key
- baseUrl (string, 可选): 自定义端点
- builtinModels (ProviderModel[], 可选): 内置模型作为 fallback

**返回：**

```typescript
{
    models: ProviderModel[];
    source: 'api' | 'cache' | 'remote' | 'builtin' | 'models.dev';
}
```

#### modelFetcher.fetchFromModelsDev()

从 models.dev 获取模型列表（v3.3.3 新增）

**参数：**
- providerId (string): 提供商 ID

**返回：**
- Promise<ProviderModel[]>: 模型列表

#### modelFetcher.getModelsDevProviders()

获取 models.dev 支持的所有提供商列表（v3.3.3 新增）

**返回：**
- Promise<string[]>: 提供商 ID 数组

#### modelFetcher.refreshModelsDev()

刷新 models.dev 数据，强制从远程重新获取（v3.3.3 新增）

**返回：**
- Promise<void>

#### modelFetcher.supportsDynamicFetch()

检查提供商是否支持从 API 动态获取

**参数：**
- providerId (string): 提供商 ID

**返回：**
- boolean: 是否支持

#### modelFetcher.supportsModelsDev()

检查提供商是否在 models.dev 中（v3.3.3 新增）

**参数：**
- providerId (string): 提供商 ID

**返回：**
- Promise<boolean>: 是否支持

#### modelFetcher.clearCache()

清除模型缓存

**参数：**
- providerId (string, 可选): 指定提供商，不传则清除所有
- includeModelsDev (boolean, 可选): 是否同时清除 models.dev 缓存，默认 false

#### modelFetcher.getCachedModels() (v3.4.10 新增)

获取指定提供商的缓存模型列表

**参数：**
- providerId (string): 提供商 ID

**返回：**
- Promise<ProviderModel[] | undefined>: 缓存的模型列表，如果没有缓存则返回 undefined

**用途：** 用于应用启动时恢复 providers 的模型数据

#### modelFetcher.getAllCachedModels() (v3.4.10 新增)

获取所有缓存的模型数据

**返回：**
- Promise<Record<string, ProviderModel[]>>: 提供商 ID 到模型列表的映射

**用途：** 用于应用启动时批量恢复 providers 的模型数据

#### modelFetcher.initialize() (v3.4.7 新增)

初始化模型缓存服务，预加载持久化的缓存到内存

**返回：**
- Promise<{ modelCacheLoaded: boolean; modelsDevCacheLoaded: boolean }>: 加载状态

**用途：** 在应用启动时调用，确保重启后缓存数据不会丢失

### 缓存机制

v3.4.6: 缓存支持双环境存储

**存储方式：**
- **Tauri 环境**：优先使用文件系统存储（用户数据目录），更可靠
- **浏览器环境**：回退到 localStorage

**缓存位置：**
- **模型缓存**：
  - Tauri: 调用 `save_model_cache` / `load_model_cache` 命令
  - localStorage: key 为 `mobaus_model_cache`
- **models.dev 缓存**：
  - Tauri: 调用 `save_models_dev_cache` / `load_models_dev_cache` 命令
  - localStorage: key 为 `mobaus_models_dev_cache`

**缓存有效期**：24 小时

**模型缓存结构：**

```typescript
{
    [providerId: string]: {
        providerId: string;
        models: ProviderModel[];
        fetchedAt: number;  // 时间戳
        source: 'api' | 'remote' | 'builtin' | 'models.dev';
    }
}
```

**models.dev 缓存结构：**

```typescript
{
    data: ModelsDevData;  // 完整的 models.dev 数据
    fetchedAt: number;    // 时间戳
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-MODEL-001 | 从 models.dev 获取模型 | 有效提供商 ID | 返回模型列表，source='models.dev' |
| TC-MODEL-002 | models.dev 失败回退 API | models.dev 不可用 + 有效 API Key | 返回模型列表，source='api' |
| TC-MODEL-003 | API 失败回退缓存 | 无效 API Key + 有缓存 | 返回缓存数据，source='cache' |
| TC-MODEL-004 | 无缓存回退内置 | 无效 API Key + 无缓存 | 返回内置数据，source='builtin' |
| TC-MODEL-005 | 缓存过期 | 超过24小时的缓存 | 重新获取或使用内置 |
| TC-MODEL-006 | 刷新 models.dev | 调用 refreshModelsDev | 清除缓存，下次获取重新请求 |
| TC-MODEL-007 | 获取单个提供商缓存 | 调用 getCachedModels | 返回缓存的模型列表或 undefined |
| TC-MODEL-008 | 获取所有缓存模型 | 调用 getAllCachedModels | 返回所有提供商的缓存模型映射 |
| TC-MODEL-009 | 启动时恢复模型数据 | 应用重启 | 已连接提供商的模型数量正确恢复 |

## 变更记录

| 日期 | 修改内容 | 修改人 |
|------|----------|--------|
| 2025-02-01 | v0.8.0: 统一动态模型处理架构，在 App.tsx 层面增强 providers | Claude |
| 2025-02-01 | v0.7.3: Kiro OAuth 支持多种认证方式（Google/GitHub/AWS Builder ID），参考 CLIProxyAPIPlus 实现 | Claude |
| 2025-01-31 | v0.7.2: 添加 Kiro OAuth 支持（AWS Builder ID Device Flow），添加通义千问提供商 | Claude |
| 2025-01-30 | v3.4.11: 修复 OAuth Token 自动续期问题，完善 expiresAt/refreshToken 持久化 | Claude |
| 2025-01-29 | v3.4.10: 添加 website 字段用于获取 API Key 链接，修复重启后模型数量丢失问题 | Claude |
| 2025-01-30 | v3.4.6: 添加 OAuth Token 自动续期服务，优化模型缓存持久化（支持 Tauri 文件系统） | Claude |
| 2025-01-30 | v3.4.5: 修复 projectId 字段序列化问题，添加 PKCE 公共工具模块 | Claude |
| 2025-01-29 | v3.3.4: 添加 OpenAI Responses API 支持，支持 GPT-5、GPT-4.1-nano 等新模型 | Claude |
| 2025-01-29 | v3.3.3: 添加 models.dev 数据源支持，与 opencode 相同实现 | Claude |
| 2025-01-29 | v3.3.2: 改进 OpenAI 模型列表，标记免费可用模型，添加 o3 支持 | Claude |
| 2025-01-29 | v3.3.1: 添加 Antigravity onboard 流程，自动获取/创建 GCP 项目 | Claude |
| 2025-01-28 | v3.3.0: 添加 Google OAuth 支持（Authorization Code Flow） | Claude |
| 2025-01-28 | v3.3.0: 添加模型动态获取功能 | Claude |
| 2025-01-28 | 初始版本，支持 15+ 提供商 | Claude |

## OAuth Token 自动续期 (v3.4.11)

### 问题背景

OAuth Token 通常有过期时间（如 1 小时），之前的实现存在以下问题：
1. OAuth 认证成功后，`expiresAt` 和 `refreshToken` 未正确保存到凭证存储
2. `tokenRefresher.start()` 未在应用启动时调用，导致自动续期服务未运行
3. Token 刷新失败时，Provider 状态未更新为断开

### 修复内容

1. **完善 OAuth 凭证保存**
   - `ProviderConnectModal` 现在传递完整的 `OAuthResult` 对象
   - 包含 `accessToken`、`refreshToken`、`expiresAt`、`accountId`、`projectId`

2. **启动自动续期服务**
   - 应用启动时检测是否有 OAuth 凭证
   - 如果有，自动调用 `tokenRefresher.start()` 启动续期服务

3. **Token 刷新失败处理**
   - 添加 `tokenRefresher` 回调监听刷新结果
   - 刷新失败时自动将 Provider 状态更新为 `disconnected`
   - 显示 Toast 通知用户重新连接

### 接口变更

#### OAuthResult 类型 (v3.4.11 新增，v0.9.1 扩展)

```typescript
interface OAuthResult {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;   // OpenAI/ChatGPT 账户 ID
    projectId?: string;   // Google Cloud 项目 ID
    profileArn?: string;  // Kiro Profile ARN（用于获取模型列表和配额）
    authMethod?: 'idc' | 'aws';  // Kiro 认证方式（用于选择正确的 User-Agent）
    kiroClientId?: string;       // Kiro 客户端 ID（用于 token 刷新，需要持久化）
    kiroClientSecret?: string;   // Kiro 客户端密钥（用于 token 刷新，需要持久化）
    kiroSsoRegion?: string;      // Kiro SSO 区域（用于 token 刷新，需要持久化）
    kiroStartUrl?: string;       // Kiro IDC Start URL（IDC 认证时使用，需要持久化）
}
```

**注意**：此类型定义在 `src/types/index.ts` 中，是唯一的真实来源。其他文件不应重复定义此类型。

#### onConnect 回调签名变更

```typescript
// 旧签名 (v3.4.10)
onConnect: (providerId: string, authMethod: number, apiKey?: string, accountId?: string, projectId?: string) => Promise<boolean>;

// 新签名 (v3.4.11)
onConnect: (providerId: string, authMethod: number, apiKey?: string, oauthResult?: OAuthResult) => Promise<boolean>;
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-OAUTH-001 | OAuth 凭证保存完整性 | OpenAI OAuth 认证 | expiresAt 和 refreshToken 正确保存 |
| TC-OAUTH-002 | 自动续期服务启动 | 应用启动时有 OAuth 凭证 | tokenRefresher.start() 被调用 |
| TC-OAUTH-003 | Token 自动刷新 | Token 即将过期（5分钟内） | 自动刷新成功，凭证更新 |
| TC-OAUTH-004 | 刷新失败断开连接 | refreshToken 无效 | Provider 状态变为 disconnected |
| TC-OAUTH-005 | 刷新失败通知 | refreshToken 无效 | 显示 Toast 通知用户 |

## OpenAI Responses API 支持 (v3.3.4)

### 背景

OpenAI 的新模型（GPT-5 系列、GPT-4.1 系列等）使用新的 Responses API (`/v1/responses`)，而不是传统的 Chat Completions API (`/v1/chat/completions`)。

### 两种 API 的区别

| 特性 | Chat Completions API | Responses API |
|------|---------------------|---------------|
| 端点 | `/v1/chat/completions` | `/v1/responses` |
| 支持模型 | GPT-3.5, GPT-4, GPT-4o, GPT-4o-mini | GPT-5, GPT-4.1-nano, GPT-4.1-mini, o3, o4 等 |
| 请求格式 | `messages` 数组 | `input` 数组 |
| 系统角色 | `system` | `developer` |
| 响应格式 | `choices[0].message.content` | 流式事件 `response.output_text.delta` |

### 自动选择 API

系统会根据模型名称自动选择使用哪个 API：

- GPT-5 系列（除了 gpt-5-mini）→ Responses API
- GPT-4.1 系列（nano、mini 等）→ Responses API
- o3 系列（非 mini）→ Responses API
- o4 系列（非 mini）→ Responses API
- codex 系列（非 mini）→ Responses API
- 其他模型 → Chat Completions API

### 支持的新模型

| 模型 ID | API | 说明 |
|---------|-----|------|
| gpt-4.1-nano | Responses | 最便宜，$0.1/M 输入 |
| gpt-5-nano | Responses | 超低成本，$0.05/M 输入 |
| gpt-4.1-mini | Responses | 推荐，$0.4/M 输入 |
| gpt-5.1 | Responses | 最新一代 |
| gpt-5.1-codex | Responses | 代码专用 |
| o3 | Responses | 推理模型 |
| gpt-4o-mini | Chat Completions | 仍使用旧 API |
| gpt-4o | Chat Completions | 仍使用旧 API |

### 实现细节

1. **消息格式转换**：将 Chat Completions 格式转换为 Responses API 格式
2. **流式事件处理**：处理 `response.output_text.delta`、`response.reasoning.delta` 等事件
3. **工具调用**：支持 `response.function_call_arguments.done` 事件
4. **兼容性**：仅对 OpenAI 官方端点使用 Responses API，其他兼容端点仍使用 Chat Completions API

## OpenAI 模型说明 (v3.3.2)

### 低成本/免费用户推荐模型

| 模型 ID | 名称 | 成本 ($/M tokens) | 说明 |
|---------|------|-------------------|------|
| gpt-4.1-nano | GPT-4.1 Nano | $0.1 / $0.4 | 最便宜，超大上下文 (1M) |
| gpt-5-nano | GPT-5 Nano | $0.05 / $0.4 | 超低成本，支持推理 |
| gpt-4o-mini | GPT-4o Mini | $0.15 / $0.6 | 性价比高，支持视觉 |
| gpt-4.1-mini | GPT-4.1 Mini | $0.4 / $1.6 | 超大上下文 (1M) |
| gpt-3.5-turbo | GPT-3.5 Turbo | $0.5 / $1.5 | 速度快 |

### 标准模型

| 模型 ID | 名称 | 说明 |
|---------|------|------|
| gpt-4o | GPT-4o | 最新旗舰模型，支持视觉 |
| gpt-4-turbo | GPT-4 Turbo | 高性能版本 |
| gpt-4 | GPT-4 | 经典版本 |

### GPT-5 系列

| 模型 ID | 名称 | 说明 |
|---------|------|------|
| gpt-5.1 | GPT-5.1 | 最新一代，支持推理 |
| gpt-5.1-codex | GPT-5.1 Codex | 代码专用版本 |
| gpt-5.1-codex-mini | GPT-5.1 Codex Mini | 轻量代码版本 |

### 推理模型 (o 系列)

| 模型 ID | 名称 | 说明 |
|---------|------|------|
| o1 | o1 | 深度推理模型 |
| o1-mini | o1 Mini | 轻量推理模型 |
| o3-mini | o3 Mini | 最新推理模型，支持工具调用 |

**注意**：
- 动态获取模型列表时，低成本模型会自动标记 ⭐ 并排在前面
- 模型数据来源于 [models.dev](https://models.dev)，会定期更新

## OAuth 认证支持 (v3.3.0)

### 支持的 OAuth 提供商

| 提供商 | OAuth 类型 | 说明 |
|--------|------------|------|
| GitHub Copilot | Device Flow | 使用 GitHub 账号授权 |
| OpenAI | Device Flow | 使用 ChatGPT Plus/Pro 订阅账号 |
| Anthropic | Authorization Code | 支持 Claude Pro/Max 订阅和 Console API Key 创建 |
| Google AI | Authorization Code + PKCE | 使用 Google 账号授权访问 Gemini API |
| Kiro | Device Flow | 使用 AWS Builder ID 授权 (v0.7.2) |

### OAuth 流程说明

#### GitHub Copilot (Device Flow)
1. 请求 Device Code
2. 用户访问验证 URL 并输入用户码
3. 轮询检查授权状态
4. 获取 Access Token

#### OpenAI (Device Flow)
1. 请求 Device Code
2. 用户访问验证 URL 并输入用户码
3. 轮询检查授权状态
4. 交换授权码获取 Token

#### Anthropic (Authorization Code)
1. 生成 PKCE 验证器和挑战码
2. 打开授权 URL
3. 用户手动复制授权码
4. 交换授权码获取 Token 或 API Key

#### Google AI (Authorization Code + PKCE)
1. 生成 PKCE 验证器和挑战码
2. 启动本地回调服务器（端口 8085）
3. 打开授权 URL
4. 用户在浏览器中完成授权
5. 回调服务器接收授权码
6. 交换授权码获取 Token

**注意**：Google OAuth 使用 `cloud-platform` scope，需要用户满足以下条件：

- 拥有 Google Cloud 项目
- 项目已启用 Generative Language API
- 如果不满足条件，请使用 API Key 方式（从 aistudio.google.com 获取）

#### Kiro - v0.7.3 更新

Kiro 支持多种认证方式：

**1. Google OAuth (推荐)**
- 使用 Kiro AuthService 的社交登录
- Authorization Code Flow + PKCE
- 端点：`https://prod.us-east-1.auth.desktop.kiro.dev`

**2. GitHub OAuth**
- 使用 Kiro AuthService 的社交登录
- Authorization Code Flow + PKCE
- 端点：`https://prod.us-east-1.auth.desktop.kiro.dev`

**3. AWS Builder ID (Device Flow)**
1. 请求 Device Code（AWS SSO OIDC）
2. 用户访问验证 URL 并使用 AWS Builder ID 登录
3. 轮询检查授权状态
4. 获取 Access Token
5. 使用 Token 调用 Kiro API

**说明**：

- Kiro 是 AWS 的 AI 编程助手
- 支持 Google、GitHub、AWS Builder ID 三种登录方式
- AWS SSO OIDC 端点：`oidc.us-east-1.amazonaws.com`
- Kiro AuthService 端点：`https://prod.us-east-1.auth.desktop.kiro.dev`
- API 端点：`https://kiro.api.amazoncodewhisperer.com`

### 相关文件

| 文件 | 说明 |
|------|------|
| `src/services/oauth.ts` | GitHub Copilot OAuth 服务 |
| `src/services/openai-oauth.ts` | OpenAI OAuth 服务 |
| `src/services/anthropic-oauth.ts` | Anthropic OAuth 服务 |
| `src/services/google-oauth.ts` | Google OAuth 服务 |
| `src/services/kiro-oauth.ts` | Kiro OAuth 服务 (v0.7.2) |
| `src/services/tokenRefresher.ts` | OAuth Token 自动续期服务 (v3.4.6) |
| `src/utils/pkce.ts` | PKCE 公共工具模块 (v3.4.5) |
| `src-tauri/src/lib.rs` | Rust 后端 OAuth 命令 |

### OAuth Token 自动续期 (v3.4.6)

OAuth Token 有过期时间，系统提供自动续期服务确保 Token 始终有效。

#### tokenRefresher 服务

**启动服务：**

```typescript
import { tokenRefresher } from './services/tokenRefresher';

// 启动自动续期服务
tokenRefresher.start((result) => {
    console.log('Token 刷新结果:', result);
});

// 停止服务
tokenRefresher.stop();
```

**手动刷新：**

```typescript
// 刷新指定提供商的 Token
const result = await tokenRefresher.refreshByProviderId('openai');

// 确保 Token 有效（API 调用前使用）
const isValid = await tokenRefresher.ensureTokenValid('google');

// 检查 Token 是否有效
const valid = await tokenRefresher.isTokenValid('anthropic');

// 获取 Token 剩余有效时间（毫秒）
const ttl = await tokenRefresher.getTokenTTL('openai');
```

**配置参数：**

| 参数 | 值 | 说明 |
|------|-----|------|
| REFRESH_BUFFER_MS | 5 分钟 | Token 过期前多久开始刷新 |
| CHECK_INTERVAL_MS | 1 分钟 | 定时检查间隔 |

**支持的提供商：**

| 提供商 | 刷新函数 | 说明 |
|--------|----------|------|
| OpenAI | `refreshOpenAIToken()` | 使用 refresh_token 刷新 |
| Google | `refreshGoogleToken()` | 使用 refresh_token 刷新 |
| Anthropic | `refreshAnthropicToken()` | 使用 refresh_token 刷新 |

#### Token 续期测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-REFRESH-001 | 自动刷新即将过期的 Token | Token 5分钟内过期 | 自动刷新成功，更新凭证 |
| TC-REFRESH-002 | 手动刷新 Token | 调用 refreshByProviderId | 刷新成功，返回新过期时间 |
| TC-REFRESH-003 | 确保 Token 有效 | 调用 ensureTokenValid | 如需刷新则刷新，返回有效性 |
| TC-REFRESH-004 | 刷新失败处理 | 无效 refresh_token | 返回失败结果，不影响其他凭证 |
| TC-REFRESH-005 | 防止重复刷新 | 同时触发多次刷新 | 只执行一次刷新 |

### OAuth 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-OAUTH-001 | GitHub Device Flow 成功 | 有效 GitHub 账号 | 获取 Access Token |
| TC-OAUTH-002 | OpenAI Device Flow 成功 | ChatGPT Plus 账号 | 获取 Access Token |
| TC-OAUTH-003 | Anthropic 授权码交换 | 有效授权码 | 获取 Token 或 API Key |
| TC-OAUTH-004 | Google OAuth 成功 | 有效 Google 账号 | 获取 Access Token |
| TC-OAUTH-005 | OAuth 超时 | 用户未授权 | 显示超时错误 |
| TC-OAUTH-006 | OAuth 取消 | 用户点击取消 | 返回 idle 状态 |

## 凭证隔离机制 (v3.4.6)

### 问题：不同提供商的凭证是否会互相影响？

**答案：不会互相影响。**

每个提供商的凭证是完全独立存储的，以 `providerId` 为唯一标识。

### 存储结构

```typescript
// 凭证存储为数组，每个元素对应一个提供商
[
    { providerId: 'openai', type: 'oauth', accessToken: '...', refreshToken: '...' },
    { providerId: 'google', type: 'oauth', accessToken: '...', refreshToken: '...' },
    { providerId: 'anthropic', type: 'api', apiKey: '...' },
    { providerId: 'deepseek', type: 'api', apiKey: '...' },
]
```

### 隔离保证

1. **存储隔离**：每个提供商的凭证独立存储，互不干扰
2. **操作隔离**：连接/断开一个提供商不会影响其他提供商
3. **刷新隔离**：Token 刷新失败只影响对应提供商，不影响其他
4. **类型独立**：API Key 和 OAuth 可以同时存在于不同提供商

### 特殊情况：Google OAuth + Cloud Code

当使用 Google OAuth 登录时，系统会自动添加 Cloud Code 支持的 Claude 模型。这是**功能增强**，不是凭证冲突：

```typescript
// modelFetcher.ts 中的处理
if (providerId === 'google' && isGoogleOAuthToken(apiKey)) {
    // 添加 Claude 模型到 Google 提供商的模型列表
    models = [...GOOGLE_CLOUD_CODE_CLAUDE_MODELS, ...models];
}
```

这意味着：
- Google 凭证仍然只属于 Google 提供商
- Claude 模型通过 Google Cloud Code API 调用
- Anthropic 提供商的凭证完全独立

## 持久化一致性 (v3.4.6)

### 问题：不同认证方式的持久化逻辑是否一致？

**答案：是的，完全一致。**

### 统一的存储流程

```
┌─────────────────────────────────────────────────────────────┐
│                    providerCredentialsStorage                │
│                                                              │
│  save(credentials) ──────────────────────────────────────►  │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────┐     ┌─────────────────────────────┐    │
│  │ Tauri 环境?     │ Yes │ invoke('save_provider_      │    │
│  │                 │────►│ credentials', { credentials })│   │
│  └────────┬────────┘     └─────────────────────────────┘    │
│           │ No                                               │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ localStorage.setItem('mobaus_provider_credentials') │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 各认证方式的字段使用

| 认证方式 | type | apiKey | accessToken | refreshToken | expiresAt |
|---------|------|--------|-------------|--------------|-----------|
| API Key | 'api' | ✅ 使用 | - | - | - |
| OAuth | 'oauth' | - | ✅ 使用 | ✅ 使用 | ✅ 使用 |
| 环境变量 | 'env' | - | - | - | - |
| 无认证 | 'none' | - | - | - | - |

**注意**：环境变量认证不存储凭证，运行时从 `process.env` 读取。

## 模型缓存持久化 (v3.4.6)

### 问题：模型缓存为什么会丢失？

**可能原因：**

1. **localStorage 被清除**：浏览器清理或用户手动清除
2. **Tauri 命令未实现**：后端缺少 `load_model_cache` 命令
3. **缓存过期**：超过 24 小时自动失效
4. **内存缓存未同步**：`_modelsDevData` 是内存变量，重启后丢失

### 当前实现

```typescript
// 缓存有效期
const CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 小时

// 双重存储
async function saveCacheAsync(cache: Record<string, ModelCache>): Promise<void> {
    if (isTauri()) {
        await invoke('save_model_cache', { cache: cacheStr });  // 文件系统
    }
    localStorage.setItem(CACHE_KEY, cacheStr);  // localStorage 备份
}
```

### 建议改进

1. **启动时优先加载持久化缓存**
2. **后台静默检查更新**（不阻塞 UI）
3. **增加缓存版本号**（避免格式不兼容）
4. **缓存过期时保留旧数据**（作为 fallback）

## models.dev vs 官方 API (v3.4.6)

### 问题：哪种获取模型的方式更好？

### 当前策略

```
优先级：models.dev > 官方 API > 缓存 > 内置数据
```

### 两种方式对比

| 特性 | models.dev | 官方 API |
|-----|-----------|---------|
| 数据来源 | 第三方聚合 | 官方实时 |
| 更新频率 | 可能滞后 1-2 天 | 实时 |
| 额外信息 | 价格、能力标签、模态 | 基础信息 |
| 网络请求 | 1 次获取所有提供商 | 每个提供商 1 次 |
| CORS 问题 | 可能有 | 需要后端代理 |
| 覆盖范围 | 75+ 提供商 | 仅支持 5 个 |

### 建议策略

**混合策略更优：**

1. **官方 API 作为主数据源** - 确保模型列表实时准确
2. **models.dev 作为补充** - 获取价格、能力等元信息
3. **合并两者数据** - 用官方 API 的模型 ID，补充 models.dev 的元信息

```typescript
// 建议的获取顺序
1. 官方 API      ──→ 获取最新模型 ID 列表
2. models.dev    ──→ 补充价格、能力等元信息
3. 缓存          ──→ 网络失败时的 fallback
4. 内置数据      ──→ 最后的 fallback
```

### 当前实现的问题

- models.dev 优先级太高，可能导致新模型延迟出现
- 如果 models.dev 数据过时，用户看不到最新模型
- 建议调整为官方 API 优先

## UI 改进建议 (v3.4.6)

### 问题：如何在卡片上显示认证方式？

### 当前实现

`ProviderCard.tsx` 只在**已连接**时显示认证来源：

```tsx
{isConnected && sourceLabel && (
    <span className={`...`}>
        {sourceLabel.icon}
        {language === 'zh' ? sourceLabel.zh : sourceLabel.en}
    </span>
)}
```

### 建议改进

**未连接时也显示支持的认证方式：**

```tsx
{/* 支持的认证方式（未连接时显示） */}
{!isConnected && provider.authMethods && (
    <div className="flex items-center gap-1 text-xs text-gray-400">
        {provider.authMethods.map(method => (
            <span key={method.type} className="px-1.5 py-0.5 bg-gray-100 rounded">
                {method.type === 'oauth' ? '🔐 OAuth' :
                 method.type === 'api' ? '🔑 API Key' :
                 method.type === 'env' ? '⚙️ 环境变量' : '🔓 无需认证'}
            </span>
        ))}
    </div>
)}
```

### 自定义提供商移到热门

修改 `providers.ts`：

```typescript
{
    id: 'custom',
    name: 'Custom (OpenAI Compatible)',
    icon: '⚙️',
    popular: true,        // 改为 true
    category: 'popular',  // 改为 'popular'
    // ...
}
```

## 动态模型统一处理架构 (v0.8.0)

### 问题背景

之前的实现中，动态模型列表的获取和增强分散在多个组件中：

1. **ProviderPage** - 使用 `useGoogleModels` 和 `useKiroModels` 获取动态模型，通过 `enhancedProviders` 增强
2. **ModelModal** - 也单独使用这两个 hooks 获取动态模型
3. **App.tsx** - 只传递原始的 `providers` 数据

这导致了：
- 代码重复
- 多次网络请求
- 数据不一致的风险

### 新架构

v0.8.0 将动态模型处理统一到 **App.tsx** 层面：

```
┌─────────────────────────────────────────────────────────────────┐
│                           App.tsx                                │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ useGoogleModels  │    │  useKiroModels   │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                              │
│           └───────────┬───────────┘                              │
│                       ▼                                          │
│              ┌────────────────┐                                  │
│              │ enhancedProviders │  ← 统一增强                   │
│              └────────┬───────┘                                  │
│                       │                                          │
│           ┌───────────┼───────────┐                              │
│           ▼           ▼           ▼                              │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│    │ProviderPage│ │ModelModal│ │modelProviders│                  │
│    └──────────┘ └──────────┘ └──────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 实现细节

#### 1. App.tsx 中的动态模型获取

```typescript
// 检查提供商连接状态
const googleProvider = providers.find(p => p.id.toLowerCase() === 'google');
const kiroProvider = providers.find(p => p.id.toLowerCase() === 'kiro');
const isGoogleConnected = googleProvider?.status === 'connected';
const isKiroConnected = kiroProvider?.status === 'connected';

// 凭证状态
const [googleCredential, setGoogleCredential] = useState<{ accessToken?: string; projectId?: string }>({});
const [kiroCredential, setKiroCredential] = useState<{ accessToken?: string; profileArn?: string }>({});

// 使用 hooks 获取动态模型
const { rawModels: googleRawModels } = useGoogleModels({
    accessToken: isGoogleConnected ? googleCredential.accessToken : undefined,
    projectId: googleCredential.projectId,
    autoFetch: isGoogleConnected && !!googleCredential.accessToken,
});

const { rawModels: kiroRawModels } = useKiroModels({
    accessToken: isKiroConnected ? kiroCredential.accessToken : undefined,
    profileArn: kiroCredential.profileArn,
    autoFetch: isKiroConnected && !!kiroCredential.accessToken,
});
```

#### 2. 统一增强 providers

```typescript
const enhancedProviders = useMemo(() => {
    return providers.map(p => {
        // Google 动态模型
        if (p.id.toLowerCase() === 'google' && p.status === 'connected' && googleRawModels.length > 0) {
            const dynamicModels = googleRawModels
                .filter(m => !m.id.toLowerCase().includes('chat_') && !m.id.toLowerCase().includes('tab_'))
                .map(m => ({
                    id: m.id,
                    name: m.displayName || m.id,
                    maxTokens: 65536,
                    contextWindow: 1000000,
                    capabilities: { vision: true, functionCalling: true, streaming: true },
                }));
            return { ...p, models: dynamicModels.length > 0 ? dynamicModels : p.models };
        }

        // Kiro 动态模型
        if (p.id.toLowerCase() === 'kiro' && p.status === 'connected' && kiroRawModels.length > 0) {
            const dynamicModels = kiroRawModels.map(m => ({
                id: m.id,
                name: m.displayName || m.id,
                maxTokens: m.maxInputTokens || 200000,
                contextWindow: m.maxInputTokens || 200000,
                capabilities: { vision: true, functionCalling: true, streaming: true },
            }));
            return { ...p, models: dynamicModels.length > 0 ? dynamicModels : p.models };
        }

        return p;
    });
}, [providers, googleRawModels, kiroRawModels]);
```

#### 3. 传递增强后的数据

```typescript
// ProviderPage 使用增强后的 providers
<ProviderPage providers={enhancedProviders} ... />

// modelProviders 也使用增强后的数据
const modelProviders = useMemo(() => {
    const connectedProviders = enhancedProviders.filter(p => p.status === 'connected')...
}, [enhancedProviders]);
```

### 各组件职责

| 组件 | 职责 | 动态模型来源 |
|------|------|-------------|
| **App.tsx** | 统一获取和增强动态模型 | `useGoogleModels`, `useKiroModels` |
| **ProviderPage** | 显示提供商列表和配额 | 使用传入的 `enhancedProviders`，自己获取配额信息用于显示 |
| **ModelModal** | 创建/编辑模型配置 | 使用传入的 `modelProviders`（已包含动态模型），自己获取 Google 配额用于显示 |

### 配额显示

配额信息（剩余百分比、是否耗尽等）仍然由各组件自己获取，因为：

1. **ProviderPage** 需要在卡片上显示配额面板
2. **ModelModal** 需要在模型选择器中显示配额状态

这些是 UI 展示需求，与模型列表数据分离是合理的。

### 优势

1. **减少重复代码** - 动态模型增强逻辑只在 App.tsx 中实现一次
2. **减少网络请求** - 只在 App.tsx 中获取一次动态模型
3. **数据一致性** - 所有组件使用相同的增强后数据
4. **易于维护** - 新增提供商只需修改 App.tsx 中的增强逻辑

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 | 测试文件 |
|--------|------|------|----------|----------|
| TC-DYN-001 | Google 动态模型增强 | Google 已连接 | providers 中 Google 的 models 被动态模型替换 | useGoogleModels.test.ts |
| TC-DYN-002 | Kiro 动态模型增强 | Kiro 已连接 | providers 中 Kiro 的 models 被动态模型替换 | useKiroModels.test.ts |
| TC-DYN-003 | ModelModal 使用动态模型 | 选择 Kiro 提供商 | 显示动态获取的模型列表 | ModelModal.test.tsx |
| TC-DYN-004 | ProviderPage 模型数量 | Google/Kiro 已连接 | 卡片上显示动态模型数量 | ProviderPage.test.tsx |
| TC-DYN-005 | 统计模型数量 | 多个提供商已连接 | 只统计已连接提供商的模型数量 | ProviderPage.test.tsx (TC-PROV-STATS-003) |

#### useKiroModels Hook 测试 (v0.8.0 新增)

| 用例ID | 场景 | 预期结果 |
|--------|------|----------|
| TC-KIRO-001 | Kiro模型配额获取 | 正确获取模型列表和配额 |
| TC-KIRO-002 | Kiro模型配额显示 | 格式化配额信息正确 |
| TC-KIRO-003 | Kiro配额耗尽提示 | 配额耗尽时标记为不可用 |
| TC-KIRO-004 | Kiro配额重置时间 | 包含配额重置时间信息 |
| TC-KIRO-005 | Kiro模型加载状态 | 加载过程中显示 loading 状态 |
| TC-KIRO-006 | Kiro模型加载失败 | 加载失败时设置错误状态 |
| TC-KIRO-007 | 无 Access Token | 不发起请求 |
| TC-KIRO-008 | 手动刷新功能 | 强制重新获取模型列表和配额 |
| TC-KIRO-009 | 缓存机制 | 相同 Token 使用缓存 |
| TC-KIRO-010 | 无 profileArn (Builder ID) | 仍能获取模型列表 |

#### ProviderPage 统计测试 (v0.8.0 新增)

| 用例ID | 场景 | 预期结果 |
|--------|------|----------|
| TC-PROV-STATS-001 | 总提供商数量 | 显示正确的总数 |
| TC-PROV-STATS-002 | 已连接提供商数量 | 显示正确的已连接数 |
| TC-PROV-STATS-003 | 模型数量统计 | 只统计已连接提供商的模型 |
| TC-PROV-STATS-004 | 无已连接提供商 | 模型数量为 0 |
| TC-PROV-STATS-005 | 未连接提供商数量 | 显示正确的未连接数 |

---

## 🐛 已知问题与修复

### [P1] 凭证存储在 Tauri 失败时回退到 localStorage，安全边界退化（v4.2.5）

**问题描述：**

在 `providerCredentialsStorage` 的 `save()` 和 `load()` 方法中，当 Tauri 环境下调用 `save_provider_credentials` 或 `load_provider_credentials` 失败时，会直接回退到 localStorage 存储。这会让 access_token/refresh_token/api_key 在异常路径进入前端存储，存在安全风险。

**影响范围：**

- Tauri 环境下，如果后端命令失败（如文件系统权限问题、磁盘空间不足等），敏感凭证会被存储到 localStorage
- localStorage 是明文存储，可以被浏览器扩展、XSS 攻击等方式读取
- 用户可能不知道凭证已经降级到不安全的存储方式

**根本原因：**

storage.ts line 1184-1195 的错误处理逻辑：

```typescript
// ❌ 错误：Tauri 失败后直接回退到 localStorage
if (isTauriEnvironment()) {
    try {
        await invoke('save_provider_credentials', { credentials: serialized });
        logDebug('已通过 Tauri 保存 Provider 凭证');
    } catch (error) {
        logError(' Tauri save_provider_credentials 失败:', error);
        // 回退到 localStorage
        saveToLocalStorage(STORAGE_KEYS.PROVIDER_CREDENTIALS, serialized);
    }
}
```

**修复方案：**

1. **Tauri 失败时不回退，直接抛出错误**：让调用方感知到存储失败，而不是静默降级
2. **添加用户提示**：告知用户凭证存储失败，需要检查系统权限或磁盘空间
3. **可选：添加配置项**：允许用户明确选择是否允许回退到 localStorage（默认不允许）

```typescript
// ✅ 正确：Tauri 失败时抛出错误，不回退
if (isTauriEnvironment()) {
    try {
        await invoke('save_provider_credentials', { credentials: serialized });
        logDebug('已通过 Tauri 保存 Provider 凭证');
    } catch (error) {
        logError(' Tauri save_provider_credentials 失败:', error);
        // 不回退到 localStorage，直接抛出错误
        throw new Error('凭证存储失败：无法写入安全存储。请检查应用权限和磁盘空间。');
    }
} else {
    // 浏览器环境才使用 localStorage
    saveToLocalStorage(STORAGE_KEYS.PROVIDER_CREDENTIALS, serialized);
}
```

**load() 方法同理：**

```typescript
// ✅ 正确：Tauri 失败时抛出错误，不回退
if (isTauriEnvironment()) {
    try {
        const credentials = await invoke<any[]>('load_provider_credentials');
        logDebug('已通过 Tauri 加载 Provider 凭证，数量:', credentials.length);
        return credentials.map(cred => ({ /* 转换逻辑 */ }));
    } catch (error) {
        logError(' Tauri load_provider_credentials 失败:', error);
        // 不回退到 localStorage，直接抛出错误
        throw new Error('凭证加载失败：无法读取安全存储。请检查应用权限。');
    }
} else {
    // 浏览器环境才使用 localStorage
    return this.loadSync();
}
```

**测试用例：**

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
| ------ | ---- | ---- | -------- | ---- |
| TC-CRED-SEC-001 | Tauri 保存成功 | 有效凭证 + Tauri 环境 | 凭证保存到文件系统，不使用 localStorage | [ ] |
| TC-CRED-SEC-002 | Tauri 保存失败 | 有效凭证 + Tauri 环境 + 后端失败 | 抛出错误，不回退到 localStorage | [ ] |
| TC-CRED-SEC-003 | Tauri 加载成功 | Tauri 环境 + 已保存凭证 | 从文件系统加载凭证 | [ ] |
| TC-CRED-SEC-004 | Tauri 加载失败 | Tauri 环境 + 后端失败 | 抛出错误，不回退到 localStorage | [ ] |
| TC-CRED-SEC-005 | 浏览器环境保存 | 有效凭证 + 浏览器环境 | 凭证保存到 localStorage（预期行为） | [ ] |
| TC-CRED-SEC-006 | 浏览器环境加载 | 浏览器环境 + 已保存凭证 | 从 localStorage 加载凭证（预期行为） | [ ] |
| TC-CRED-SEC-007 | 错误消息清晰 | Tauri 保存失败 | 错误消息包含"检查应用权限和磁盘空间" | [ ] |
| TC-CRED-SEC-008 | 错误消息清晰 | Tauri 加载失败 | 错误消息包含"检查应用权限" | [ ] |

**修复版本：** v4.2.5

**相关文件：**

- `src/services/storage.ts` (line 1184-1240)
- `docs/modules/providers.md` (本文档)

---

### [P2] 凭证读取入口分散，错误处理策略不一致（v4.2.6）

**问题描述：**

多个页面和 Hook 直接调用 `providerCredentialsStorage.load()`，各自实现 `try/catch`。这会导致：

- 错误日志格式不一致
- 有些场景仅记录日志，无用户提示
- 后续安全策略调整需要多处同步修改

**修复方案：**

新增统一入口 `loadProviderCredentialsSafe`，集中处理：

1. 统一错误日志（`[Auth]` 标签 + context）
2. 支持调用方注入 `onError`（用于 toast/UI 提示）
3. 失败时返回可控 `fallback`，避免上层级联中断

```typescript
const credentials = await loadProviderCredentialsSafe({
    context: 'App 启动读取凭证失败',
    fallback: [],
    onError: (message, error) => {
        // 可选：显示提示
    }
});
```

**落地点：**

- `src/hooks/useAppBootstrap.ts`：启动阶段/刷新后重载统一走安全入口
- `src/components/features/Providers/index.tsx`：Google/Kiro 凭证读取统一走安全入口
- `src/components/features/Models/ModelModal.tsx`：Google 凭证和提交时凭证读取统一走安全入口
- `src/App.tsx`：动态模型凭证加载、自定义 Provider 重载统一走安全入口

**测试用例：**

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-CRED-ACCESS-001 | 读取成功 | storage.load 返回凭证 | 返回真实凭证列表 | [x] |
| TC-CRED-ACCESS-002 | 读取失败 + fallback | storage.load 抛错 + fallback | 返回 fallback，触发 onError | [x] |
| TC-CRED-ACCESS-003 | 读取失败 + 默认值 | storage.load 抛错 | 返回空数组 | [x] |
| TC-CRED-ACCESS-004 | 错误日志 | storage.load 抛错 + context | 记录带 context 的错误日志 | [x] |

**相关文件：**

- `src/services/auth/providerCredentialAccess.ts`
- `src/test/services/auth/providerCredentialAccess.test.ts`
