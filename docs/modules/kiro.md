# Kiro 模块 (kiro)

## 模块职责

管理 Kiro (AWS AI 编程助手) 的认证和模型服务，包括：
- 多种 OAuth 认证方式（AWS Builder ID、IDC、Google、GitHub）
- 可用模型列表获取
- 配额信息管理
- Token 刷新机制

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.9.2 | 2026-03 | Token 刷新失败时自动识别不可恢复错误并清理失效凭证 |
| v0.9.1 | 2024-01 | 支持持久化客户端注册信息，解决重启后无法刷新 Token 的问题 |
| v0.9.0 | 2024-01 | 新增 authMethod 参数，支持 IDC 认证方式 |
| v0.8.0 | 2024-01 | 初始版本，支持 AWS Builder ID 认证 |

## 接口定义

### kiroOAuth 服务

Kiro OAuth 认证服务，支持多种认证方式。

#### requestDeviceCode(authMethod, idcOptions?): Promise<KiroDeviceCodeResponse>

请求 Device Code（AWS Builder ID 或 IDC）

**参数：**
- authMethod (KiroAuthMethod): 认证方式，默认 'aws'
- idcOptions (KiroIdcOptions): IDC 认证选项（仅当 authMethod 为 'idc' 时需要）

**返回：**
```typescript
{
    device_code: string;      // 设备码
    user_code: string;        // 用户码（需要用户输入）
    verification_uri: string; // 验证 URL
    expires_in: number;       // 过期时间（秒）
    interval: number;         // 轮询间隔（秒）
}
```

#### pollForToken(deviceCode, interval, expiresIn, onStatus?, abortSignal?): Promise<KiroOAuthResult>

轮询获取 Access Token

**参数：**
- deviceCode (string): 设备码
- interval (number): 轮询间隔（秒）
- expiresIn (number): 过期时间（秒）
- onStatus (KiroPollStatusCallback): 状态回调
- abortSignal (AbortSignal): 取消信号

**返回：**
```typescript
{
    success: boolean;
    accessToken?: string;      // 访问令牌
    refreshToken?: string;     // 刷新令牌
    profileArn?: string;       // Profile ARN（用于获取模型列表和配额）
    expiresAt?: number;        // Token 过期时间戳（毫秒）
    authMethod?: string;       // 认证方式 ("idc" | "aws")
    kiroClientId?: string;     // v0.9.1: 客户端 ID（需要持久化）
    kiroClientSecret?: string; // v0.9.1: 客户端密钥（需要持久化）
    kiroSsoRegion?: string;    // v0.9.1: SSO 区域（需要持久化）
    kiroStartUrl?: string;     // v0.9.1: IDC Start URL（需要持久化）
    error?: string;
}
```

#### authorize(onDeviceCode, onStatus?, abortSignal?, authMethod?, idcOptions?): Promise<KiroOAuthResult>

完整的 OAuth 流程

**参数：**
- onDeviceCode (function): 获取到 Device Code 时的回调
- onStatus (KiroPollStatusCallback): 状态回调
- abortSignal (AbortSignal): 取消信号
- authMethod (KiroAuthMethod): 认证方式，默认 'aws'
- idcOptions (KiroIdcOptions): IDC 认证选项

#### refreshToken(refreshToken, clientId?, clientSecret?, ssoRegion?): Promise<KiroOAuthResult>

刷新 Access Token

**参数：**
- refreshToken (string): 刷新令牌
- clientId (string): v0.9.1: 客户端 ID（从持久化凭证中获取）
- clientSecret (string): v0.9.1: 客户端密钥（从持久化凭证中获取）
- ssoRegion (string): v0.9.1: SSO 区域（从持久化凭证中获取）

**返回：**
- 成功: `{ success: true, accessToken, refreshToken, expiresAt }`
- 失败（可重试）: `{ success: false, error: "错误信息" }`
- 失败（需要重新认证）: `{ success: false, error: "错误信息", needsReauth: true }` (v0.9.2)

**v0.9.2 改进：**

当 refresh_token 本身失效时（如 "Invalid token provided"、"invalid_grant" 等不可恢复错误），会：

1. 返回 `needsReauth: true` 标志
2. 前端自动删除失效的凭证
3. 通知用户需要重新登录
4. 避免重复尝试刷新已知失效的 token

### kiro-models 服务

Kiro 模型列表和配额服务。

#### fetchKiroAvailableModels(accessToken, profileArn?): Promise<AvailableKiroModel[]>

获取 Kiro 可用模型列表

**参数：**
- accessToken (string): OAuth Access Token
- profileArn (string): 用户配置文件 ARN（可选，AWS Builder ID 用户没有）

**返回：**
```typescript
[{
    id: string;              // 模型 ID
    displayName?: string;    // 显示名称
    description?: string;    // 模型描述
    isExhausted: boolean;    // 配额是否已耗尽
    maxInputTokens?: number; // 最大输入 token 数
    rateMultiplier?: number; // 速率倍数
}]
```

#### fetchKiroQuota(accessToken, profileArn?, authMethod?): Promise<KiroQuotaInfo | null>

获取 Kiro 配额信息

**参数：**
- accessToken (string): OAuth Access Token
- profileArn (string): 用户配置文件 ARN（可选）
- authMethod (string): v0.9.0: 认证方式 ("idc" | "aws")

**返回：**
```typescript
{
    total_limit: number;        // 总配额
    current_usage: number;      // 当前使用量
    remaining_quota: number;    // 剩余配额
    is_exhausted: boolean;      // 是否已耗尽
    resource_type?: string;     // 资源类型
    next_reset?: number;        // 下次重置时间（毫秒时间戳）
    subscription_title?: string; // 订阅类型
}
```

#### formatKiroQuotaInfo(quota): string

格式化配额信息为可读字符串

**参数：**
- quota (KiroQuotaInfo | null): 配额信息

**返回：**
- 正常: `"剩余 80% (400/500)"`
- 耗尽: `"配额已耗尽"`
- 无数据: `""`

#### isKiroQuotaAvailable(quota): boolean

检查配额是否可用

**参数：**
- quota (KiroQuotaInfo | null): 配额信息

**返回：**
- true: 配额可用
- false: 配额已耗尽

### useKiroModels Hook

Kiro 模型列表管理 Hook。

#### 参数

```typescript
{
    accessToken?: string;  // OAuth Access Token
    profileArn?: string;   // 用户配置文件 ARN
    authMethod?: string;   // v0.9.0: 认证方式 ("idc" | "aws")
    autoFetch?: boolean;   // 是否自动获取（默认 true）
}
```

#### 返回值

```typescript
{
    models: ProviderModelInfo[];      // 可用模型列表（已转换格式）
    rawModels: AvailableKiroModel[];  // 原始模型数据
    quota: KiroQuotaInfo | null;      // 配额信息
    loading: boolean;                  // 是否正在加载
    error: string | null;              // 错误信息
    refresh: () => Promise<void>;      // 手动刷新
    formatQuota: () => string;         // 格式化配额信息
    isQuotaAvailable: () => boolean;   // 检查配额是否可用
    lastUpdated: Date | null;          // 上次更新时间
}
```

## 类型定义

### KiroAuthMethod

```typescript
type KiroAuthMethod = 'google' | 'github' | 'aws' | 'idc';
```

| 值 | 说明 |
|----|------|
| google | Google OAuth（Social Auth） |
| github | GitHub OAuth（Social Auth） |
| aws | AWS Builder ID（Device Flow） |
| idc | AWS Identity Center（Device Flow with custom Start URL） |

### KiroIdcOptions

```typescript
interface KiroIdcOptions {
    startUrl: string;  // 组织的 SSO 门户 URL
    region: string;    // AWS 区域（默认 us-east-1）
}
```

### KiroOAuthResult

```typescript
interface KiroOAuthResult {
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    profileArn?: string;
    expiresAt?: number;        // v0.9.0
    authMethod?: string;       // v0.9.0
    kiroClientId?: string;     // v0.9.1
    kiroClientSecret?: string; // v0.9.1
    kiroSsoRegion?: string;    // v0.9.1
    kiroStartUrl?: string;     // v0.9.1
    error?: string;
    needsReauth?: boolean;     // v0.9.2: 是否需要重新认证
}
```

### KiroQuotaInfo

```typescript
interface KiroQuotaInfo {
    total_limit: number;
    current_usage: number;
    remaining_quota: number;
    is_exhausted: boolean;
    resource_type?: string;
    next_reset?: number;
    subscription_title?: string;
}
```

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-KIRO-001 | 正常获取模型列表和配额 | 有效 accessToken 和 profileArn | 返回模型列表和配额信息 |
| TC-KIRO-002 | 格式化配额信息 | 配额 400/500 | 返回 "剩余 80% (400/500)" |
| TC-KIRO-003 | 配额耗尽状态 | is_exhausted=true | isQuotaAvailable 返回 false |
| TC-KIRO-004 | 包含重置时间 | next_reset 有值 | quota.next_reset 有值 |
| TC-KIRO-005 | 加载状态 | 请求进行中 | loading=true |
| TC-KIRO-006 | 加载失败 | API 返回错误 | error 有值 |
| TC-KIRO-007 | 无 Token 不请求 | accessToken 为空 | 不发起 API 请求 |
| TC-KIRO-008 | 手动刷新 | 调用 refresh() | 强制重新获取，清除缓存 |
| TC-KIRO-009 | 缓存机制 | 相同 Token 多次渲染 | 只请求一次 API |
| TC-KIRO-010 | Builder ID 用户 | 只有 accessToken，无 profileArn | 仍能获取模型列表 |
| TC-KIRO-011 | v0.9.2: Token 刷新失败 - 不可恢复错误自动删除凭证 | refreshToken 失效，后端返回 needsReauth=true | 自动删除凭证，返回 needsReauth=true，通知回调 |
| TC-KIRO-012 | v0.9.2: Token 刷新失败 - 不可恢复错误跳过优雅降级 | refreshToken 失效且旧 token 未过期 | 不使用优雅降级，直接删除凭证并返回失败 |
| TC-KIRO-013 | v0.9.2: Token 刷新失败 - 可重试错误保留凭证 | 网络错误等临时错误 | 保留凭证，走正常重试和优雅降级流程 |
| TC-KIRO-014 | v0.9.2: Token 刷新失败 - UI 通知区分 | needsReauth=true | Toast 显示"需要重新登录"，时长 15 秒 |
| TC-KIRO-015 | v0.9.2: 后端识别不可恢复错误 | "Invalid token provided" 错误 | 返回 needs_reauth=true |
| TC-KIRO-016 | v0.9.2: 后端识别不可恢复错误 | "invalid_grant" 错误 | 返回 needs_reauth=true |
| TC-KIRO-017 | v0.9.2: 后端识别不可恢复错误 | HTTP 401 状态码 | 返回 needs_reauth=true |
| TC-KIRO-018 | v0.9.2: 后端识别可重试错误 | 网络超时等临时错误 | 返回 needs_reauth=false |

## 使用示例

### 基本使用

```tsx
import { useKiroModels } from '../hooks/useKiroModels';

function KiroModelSelector({ credential }) {
    const {
        models,
        quota,
        loading,
        error,
        refresh,
        formatQuota,
        isQuotaAvailable,
    } = useKiroModels({
        accessToken: credential.accessToken,
        profileArn: credential.profileArn,
        authMethod: credential.authMethod,
    });

    if (loading) return <div>加载中...</div>;
    if (error) return <div>错误: {error}</div>;

    return (
        <div>
            <select disabled={!isQuotaAvailable()}>
                {models.map(model => (
                    <option key={model.id} value={model.id}>
                        {model.name}
                    </option>
                ))}
            </select>
            <span>{formatQuota()}</span>
            <button onClick={refresh}>刷新</button>
        </div>
    );
}
```

### OAuth 认证流程

```tsx
import { kiroOAuth } from '../services/kiro-oauth';

// AWS Builder ID 认证
async function loginWithBuilderID() {
    const result = await kiroOAuth.authorize(
        (deviceData) => {
            // 显示用户码和验证 URL
            console.log(`请访问 ${deviceData.verification_uri}`);
            console.log(`输入代码: ${deviceData.user_code}`);
        },
        (status) => {
            // 状态更新
            console.log('状态:', status);
        }
    );

    if (result.success) {
        // 保存凭证（包括 v0.9.1 新增的客户端注册信息）
        saveCredential({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            profileArn: result.profileArn,
            expiresAt: result.expiresAt,
            authMethod: result.authMethod,
            kiroClientId: result.kiroClientId,
            kiroClientSecret: result.kiroClientSecret,
            kiroSsoRegion: result.kiroSsoRegion,
        });
    }
}

// IDC 认证
async function loginWithIDC(startUrl: string, region: string) {
    const result = await kiroOAuth.authorize(
        (deviceData) => { /* ... */ },
        (status) => { /* ... */ },
        undefined,
        'idc',
        { startUrl, region }
    );
    // ...
}
```

### Token 刷新

```tsx
import { kiroOAuth } from '../services/kiro-oauth';

async function refreshKiroToken(credential) {
    // v0.9.1: 传入持久化的客户端注册信息
    const result = await kiroOAuth.refreshToken(
        credential.refreshToken,
        credential.kiroClientId,
        credential.kiroClientSecret,
        credential.kiroSsoRegion
    );

    if (result.success) {
        // 更新凭证
        updateCredential({
            ...credential,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
        });
    }
}
```

## 错误码

| 错误码/错误信息 | 说明 | 可恢复 | 处理建议 |
| --------------- | ---- | ------ | -------- |
| expired | Device Code 已过期 | 否 | 重新发起认证流程 |
| cancelled | 用户取消认证 | - | 提示用户重试 |
| slow_down | 轮询过快 | 是 | 自动增加轮询间隔 |
| Token 刷新失败 | Refresh Token 无效或过期 | 否 | 重新登录 |
| Invalid token provided | v0.9.2: refresh_token 已失效 | 否 | 自动删除凭证，提示重新登录 |
| invalid_grant | v0.9.2: OAuth 授权已失效 | 否 | 自动删除凭证，提示重新登录 |
| invalid_client | v0.9.2: 客户端认证失败 | 否 | 自动删除凭证，提示重新登录 |
| unauthorized_client | v0.9.2: 客户端未授权 | 否 | 自动删除凭证，提示重新登录 |
| HTTP 401 | v0.9.2: 认证失败 | 否 | 自动删除凭证，提示重新登录 |
| 网络超时/连接失败 | 临时网络问题 | 是 | 自动重试（最多 3 次，指数退避） |
| 获取模型列表失败 | Access Token 无效 | 是 | 尝试刷新 Token 或重新登录 |

## 注意事项

1. **v0.9.2 自动凭证清理**：当 Token 刷新遇到不可恢复错误时（如 refresh_token 失效），系统会自动删除失效的凭证并通知用户重新登录，避免重复的无效刷新尝试。

2. **v0.9.1 持久化要求**：认证成功后必须持久化 `kiroClientId`、`kiroClientSecret`、`kiroSsoRegion` 字段，否则应用重启后无法刷新 Token。

3. **Builder ID vs IDC**：
   - AWS Builder ID 用户没有 `profileArn`，但仍可获取模型列表
   - IDC 用户需要提供组织的 `startUrl` 和 `region`

4. **配额是全局的**：Kiro 的配额是账户级别的，所有模型共享同一配额。

5. **缓存机制**：Hook 内置 5 分钟缓存，相同 Token 不会重复请求。调用 `refresh()` 可强制刷新。

## 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
| ---- | ---- | -------- | ------ |
| 2026-03-15 | v0.9.2 | Token 刷新失败时自动识别不可恢复错误并清理失效凭证 | - |
| 2024-01-XX | v0.9.1 | 支持持久化客户端注册信息 | - |
| 2024-01-XX | v0.9.0 | 新增 authMethod 参数，支持 IDC 认证 | - |
| 2024-01-XX | v0.8.0 | 初始版本 | - |
