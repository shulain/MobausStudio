# Service Layer / 服务层文档

> **English**: The service layer handles business logic, API calls, OAuth authentication, and data storage. Located at `src/services/`.
>
> Key services: Storage (local persistence via Tauri FS), Analytics, Template Service, Model Fetcher, Token Refresher, OAuth (OpenAI / Anthropic / Google / Kiro), Credential Access Helper, and Auto Updater.
>
> Detailed API docs and test cases are in Chinese below.

## 模块职责

服务层负责处理业务逻辑、API 调用、OAuth 认证、数据存储等核心功能。位于 `src/services/` 目录下。

## 服务模块概览

| 服务 | 文件 | 说明 | 测试状态 |
|------|------|------|----------|
| 数据分析 | `analytics.ts` | 使用统计、数据分析 | ✅ 已测试 |
| 数据存储 | `storage.ts` | 本地数据持久化 | ✅ 已测试 |
| 模板服务 | `templateService.ts` | Agent 模板解析和安装 | ✅ 已测试 |
| 模型获取 | `modelFetcher.ts` | 从各提供商获取模型列表 | ⚠️ 待测试 |
| Token 刷新 | `tokenRefresher.ts` | OAuth Token 自动刷新 | ⚠️ 待测试 |
| OAuth 通用 | `oauth.ts` | OAuth 认证通用逻辑 | ⚠️ 待测试 |
| OAuth 回调 | `oauth-callback.ts` | OAuth 回调处理 | ⚠️ 待测试 |
| OpenAI OAuth | `openai-oauth.ts` | OpenAI OAuth 认证 | ⚠️ 待测试 |
| Anthropic OAuth | `anthropic-oauth.ts` | Anthropic OAuth 认证 | ⚠️ 待测试 |
| Google OAuth | `google-oauth.ts` | Google AI OAuth 认证 | ⚠️ 待测试 |
| Kiro OAuth | `kiro-oauth.ts` | Kiro (AWS) OAuth 认证 | ⚠️ 待测试 |
| 凭证访问辅助 | `auth/providerCredentialAccess.ts` | Provider 凭证安全读取与统一错误处理 | ✅ 已测试 |
| Google 模型 | `google-models.ts` | Google AI 模型定义 | - |
| Kiro 模型 | `kiro-models.ts` | Kiro 模型定义 | - |
| 自动更新 | `updater.ts` | 应用自动更新 | ⚠️ 待测试 |

---

## 核心服务详解

### 1. 数据存储服务 (storage.ts)

负责所有本地数据的持久化存储，使用 Tauri 的文件系统 API。

#### 主要功能

```typescript
// 对话存储
saveChats(chats: Chat[]): Promise<void>
loadChats(): Promise<Chat[]>

// Agent 存储
saveAgents(agents: Agent[]): Promise<void>
loadAgents(): Promise<Agent[]>

// 技能存储
saveSkills(skills: Skill[]): Promise<void>
loadSkills(): Promise<Skill[]>

// MCP 服务器存储
saveMCPServers(servers: MCPServer[]): Promise<void>
loadMCPServers(): Promise<MCPServer[]>

// 模型存储
saveModels(models: AIModel[]): Promise<void>
loadModels(): Promise<AIModel[]>

// 设置存储
saveSettings(settings: AppSettings): Promise<void>
loadSettings(): Promise<AppSettings>
```

#### 存储位置

- macOS: `~/Library/Application Support/com.mobaus.studio/`
- Windows: `%APPDATA%/com.mobaus.studio/`
- Linux: `~/.config/com.mobaus.studio/`

---

### 2. 数据分析服务 (analytics.ts)

提供使用统计和数据分析功能。

#### 主要功能

```typescript
// 统计数据
interface UsageStats {
    totalChats: number;
    totalMessages: number;
    totalTokens: number;
    modelUsage: Record<string, number>;
    dailyUsage: DailyUsage[];
}

// 获取统计数据
getUsageStats(): Promise<UsageStats>

// 记录使用
recordUsage(model: string, tokens: number): Promise<void>

// 导出数据
exportStats(format: 'json' | 'csv'): Promise<string>
```

---

### 3. 模板服务 (templateService.ts)

处理 Agent 模板的解析、验证和安装。

#### 主要功能

```typescript
// 解析模板
parseTemplate(source: string | File): Promise<AgentTemplatePackage>

// 获取所需变量
getRequiredVariables(template: AgentTemplatePackage): TemplateVariable[]

// 安装模板
installTemplate(
    template: AgentTemplatePackage,
    options: InstallOptions,
    handlers: InstallHandlers
): Promise<TemplateInstallResult>

// 发现 GitHub 仓库中的模板
discoverTemplatesFromRepo(repoUrl: string): Promise<DiscoveredTemplate[]>

// 检查是否为 GitHub 仓库 URL
isGitHubRepoUrl(url: string): boolean
```

---

### 4. OAuth 认证服务

#### 4.1 通用 OAuth (oauth.ts)

```typescript
// OAuth 配置
interface OAuthConfig {
    clientId: string;
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    redirectUri: string;
}

// 启动 OAuth 流程
startOAuthFlow(config: OAuthConfig): Promise<void>

// 处理回调
handleOAuthCallback(code: string, state: string): Promise<OAuthTokens>
```

#### 4.2 提供商特定 OAuth

每个提供商有独立的 OAuth 实现：

| 提供商 | 文件 | 特点 |
|--------|------|------|
| OpenAI | `openai-oauth.ts` | 标准 OAuth 2.0 |
| Anthropic | `anthropic-oauth.ts` | 标准 OAuth 2.0 |
| Google | `google-oauth.ts` | Google OAuth 2.0 + API Key |
| Kiro | `kiro-oauth.ts` | AWS Cognito + Device Flow |

#### 4.3 凭证访问辅助 (auth/providerCredentialAccess.ts)

用于统一读取 `providerCredentialsStorage`，减少 UI 层重复 `try/catch`，并在安全存储失败时提供可控 fallback。

```typescript
loadProviderCredentialsSafe({
    context: 'App 启动读取凭证失败',
    fallback: [],
    onError: (message, error) => { /* 可选 UI 提示 */ }
}): Promise<ProviderCredential[]>
```

测试覆盖：

| 用例ID | 场景 | 预期结果 |
|--------|------|----------|
| TC-CRED-ACCESS-001 | 凭证读取成功 | 返回真实凭证列表 |
| TC-CRED-ACCESS-002 | 凭证读取失败 + 自定义 fallback | 返回 fallback 且触发 onError |
| TC-CRED-ACCESS-003 | 凭证读取失败 + 默认 fallback | 返回空数组 |
| TC-CRED-ACCESS-004 | 凭证读取失败日志 | 日志包含 context + 原始错误信息 |

---

### 5. 模型获取服务 (modelFetcher.ts)

从各 AI 提供商获取可用模型列表。

#### 主要功能

```typescript
// 获取提供商模型
fetchModelsFromProvider(
    provider: string,
    credentials: ProviderCredentials
): Promise<AIModel[]>

// 测试模型连接
testModelConnection(
    provider: string,
    model: string,
    credentials: ProviderCredentials
): Promise<boolean>

// 获取模型定价
getModelPricing(provider: string, model: string): ModelPricing | null
```

---

### 6. Token 刷新服务 (tokenRefresher.ts)

自动刷新 OAuth Token，确保认证持续有效。

#### 主要功能

```typescript
// 启动自动刷新
startTokenRefresher(provider: string): void

// 停止自动刷新
stopTokenRefresher(provider: string): void

// 手动刷新 Token
refreshToken(provider: string): Promise<OAuthTokens>

// 检查 Token 是否过期
isTokenExpired(provider: string): boolean
```

---

### 7. 自动更新服务 (updater.ts)

处理应用的自动更新检查和安装。

#### 主要功能

```typescript
// 检查更新
checkForUpdates(): Promise<UpdateInfo | null>

// 下载更新
downloadUpdate(): Promise<void>

// 安装更新
installUpdate(): Promise<void>

// 获取当前版本
getCurrentVersion(): string
```

---

## 服务依赖关系

```
┌─────────────────────────────────────────────────────┐
│                    UI Components                     │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                      Hooks                           │
│  (useChats, useAgents, useModels, useMCPServers)    │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                    Services                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  storage    │  │  analytics  │  │  template   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ modelFetch  │  │   oauth     │  │  updater    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                  Tauri Commands                      │
│            (src-tauri/src/lib.rs)                   │
└─────────────────────────────────────────────────────┘
```

---

## 错误处理规范

所有服务应遵循统一的错误处理规范：

```typescript
// 使用 logger 记录错误
import { logger, LogTags } from '../utils/logger';

try {
    // 业务逻辑
} catch (error) {
    logger.error(LogTags.SERVICE, '[ServiceName] 操作失败', error);
    throw new ServiceError('操作失败', { cause: error });
}
```

---

## 变更记录

| 日期 | 修改内容 | 修改人 |
|------|----------|--------|
| 2025-02-04 | 初始版本 - 服务层文档 | - |
