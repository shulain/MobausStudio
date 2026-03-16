# Analytics Module / Analytics 运营统计模块

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Module Overview

The Analytics module provides operational data analytics functionality, using Mixpanel as the third-party analytics service to collect user counts, user behavior, and other operational data.

| Property | Value |
|----------|-------|
| Module Path | `src/services/analytics.ts` |
| Third-party Service | [Mixpanel](https://mixpanel.com) |
| API Endpoint | `https://api.mixpanel.com` |
| Proxy Solution | Cloudflare Worker |
| Created Date | 2025-01-XX |
| Last Updated | 2025-01-XX |

---

## Feature List

### Core Features

- [x] User identification (Device ID)
- [x] App launch tracking
- [x] User behavior tracking
- [x] Model usage statistics
- [x] Feature usage statistics

### Extended Features

- [x] User property setting
- [x] Cloudflare Worker proxy (solving domestic network access issues)
- [ ] Offline event caching
- [ ] Batch reporting

---

## Architecture Design

### Direct Mode (Overseas Users)

```
+-------------------+
|   MobausStudio    |
|    (Tauri App)    |
+--------+----------+
         |
         | HTTP POST
         v
+-------------------+
|     Mixpanel      |
|   api.mixpanel    |
|      .com         |
+-------------------+
```

### Proxy Mode (Domestic Users)

```
+-------------------+
|   MobausStudio    |
|    (Tauri App)    |
+--------+----------+
         |
         | HTTP POST
         v
+-------------------+
|    Cloudflare     |
|      Worker       |
|   (your-proxy)    |
+--------+----------+
         |
         | Forward request
         v
+-------------------+
|     Mixpanel      |
|   api.mixpanel    |
|      .com         |
+-------------------+
```

### File Structure

```
src/
├── services/
│   └── analytics.ts           # Analytics service (core)
├── test/
│   └── services/
│       └── analytics.test.ts  # Unit tests
scripts/
└── cloudflare-worker-mixpanel.js  # Cloudflare Worker proxy code
```

---

## Data Structures

### AnalyticsConfig Configuration

```typescript
interface AnalyticsConfig {
    /** Mixpanel Project Token */
    projectToken: string;
    /** API endpoint (optional, for proxy configuration) */
    endpoint?: string;
    /** Whether enabled (enabled in production, optional in development) */
    enabled?: boolean;
    /** Debug mode */
    debug?: boolean;
}
```

### UserProperties

```typescript
interface UserProperties {
    /** App version */
    appVersion?: string;
    /** Operating system */
    os?: string;
    /** OS version */
    osVersion?: string;
    /** Language setting */
    language?: string;
    /** Theme setting */
    theme?: string;
    /** First launch time */
    firstLaunchAt?: string;
}
```

---

## API Interface

### analytics.init(config)

Initialize the analytics service

**Parameters:**
- config: AnalyticsConfig - Configuration object

**Returns:**
- void

**Examples:**
```typescript
import { analytics } from '@/services/analytics';

// Direct mode (overseas users)
analytics.init({
    projectToken: 'YOUR_MIXPANEL_PROJECT_TOKEN',
    enabled: true,
    debug: false,
});

// Proxy mode (domestic users)
analytics.init({
    projectToken: 'YOUR_MIXPANEL_PROJECT_TOKEN',
    endpoint: 'https://your-proxy.workers.dev',
    enabled: true,
    debug: false,
});
```

### analytics.identify(userProperties?)

Identify user and set user properties

**Parameters:**
- userProperties: UserProperties (optional) - User properties

**Returns:**
- void

### analytics.track(eventName, properties?)

Track an event

**Parameters:**
- eventName: string - Event name
- properties: Record<string, unknown> (optional) - Event properties

**Returns:**
- void

**Examples:**
```typescript
// Track message sent
analytics.track('message_sent', {
    modelId: 'gpt-4',
    messageLength: 100,
    hasAttachment: false,
});
```

### analytics.setUserProperties(properties)

Update user properties

**Parameters:**
- properties: Partial<UserProperties> - Properties to update

**Returns:**
- void

---

## Cloudflare Worker Proxy Configuration

### Why is a proxy needed?

The Mixpanel API (`api.mixpanel.com`) may not be directly accessible in China. This issue can be resolved through a Cloudflare Worker proxy.

### Deployment Steps

1. **Log in to Cloudflare Dashboard**
   - Visit https://dash.cloudflare.com
   - Register/log in (free)

2. **Create a Worker**
   - Go to Workers & Pages
   - Click "Create Worker"
   - Copy the code from `scripts/cloudflare-worker-mixpanel.js`
   - Deploy

3. **Configure Environment Variables**
   ```bash
   # .env
   VITE_MIXPANEL_TOKEN=your_project_token
   VITE_MIXPANEL_PROXY=https://your-worker.workers.dev
   ```

4. **(Optional) Bind Custom Domain**
   - Add a custom domain in Worker settings
   - e.g., `analytics.yourdomain.com`

### Free Tier

| Item | Free Quota |
|------|------------|
| Requests | 100,000/day |
| CPU Time | 10ms/request |
| Workers Count | Unlimited |

For analytics services, the free tier is more than sufficient.

---

## Event Tracking Design

### User Lifecycle Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `app_launched` | App launch | `{ version, os, language }` |
| `app_closed` | App close | `{ sessionDuration }` |
| `app_updated` | App update | `{ fromVersion, toVersion }` |

### Chat-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `chat_created` | Create new chat | `{ modelId }` |
| `chat_deleted` | Delete chat | `{ messageCount }` |
| `message_sent` | Send message | `{ modelId, messageLength, hasAttachment }` |
| `message_received` | Receive reply | `{ modelId, tokens, responseTime }` |

### Model-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `model_added` | Add model | `{ providerId, modelName }` |
| `model_deleted` | Delete model | `{ providerId, modelName }` |
| `model_switched` | Switch model | `{ fromModel, toModel }` |

### Agent-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `agent_created` | Create Agent | `{ agentName }` |
| `agent_deleted` | Delete Agent | `{ agentName }` |
| `agent_used` | Use Agent | `{ agentId, agentName }` |

### Skill-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `skill_created` | Create skill | `{ skillName, isBuiltIn }` |
| `skill_deleted` | Delete skill | `{ skillName }` |
| `skill_used` | Use skill | `{ skillId, skillName }` |
| `skill_installed` | Install skill | `{ skillName, source }` |

### MCP-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `mcp_server_added` | Add MCP server | `{ serverName, transportType }` |
| `mcp_server_deleted` | Delete MCP server | `{ serverName }` |
| `mcp_server_connected` | Connect MCP server | `{ serverName, toolCount }` |
| `mcp_tool_used` | Use MCP tool | `{ serverName, toolName }` |

### Provider-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `provider_connected` | Connect provider | `{ providerId, authType }` |
| `provider_disconnected` | Disconnect provider | `{ providerId }` |

### Settings-related Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `settings_changed` | Change settings | `{ settingKey, newValue }` |
| `theme_changed` | Switch theme | `{ theme }` |
| `language_changed` | Switch language | `{ language }` |

### Roundtable Events

| Event Name | Trigger | Event Properties |
|------------|---------|------------------|
| `roundtable_created` | Create roundtable | `{ participantCount, topic }` |
| `roundtable_completed` | Complete roundtable | `{ roundCount, messageCount, duration }` |

---

## Test Cases

| Case ID | Scenario | Input | Expected Result | Status |
|---------|----------|-------|-----------------|--------|
| TC-ANALYTICS-001 | Initialize service | Valid config | Service initialized successfully | [x] |
| TC-ANALYTICS-002 | Initialize service (disabled) | enabled=false | No requests sent | [x] |
| TC-ANALYTICS-003 | Track event | Valid event name | Event sent successfully | [x] |
| TC-ANALYTICS-004 | Track event (with properties) | Event name + properties | Properties sent correctly | [x] |
| TC-ANALYTICS-005 | User identification | Device ID | User ID set successfully | [x] |
| TC-ANALYTICS-006 | Set user properties | Properties object | Properties updated successfully | [x] |
| TC-ANALYTICS-007 | Network error handling | Network unavailable | Silent failure, no app impact | [x] |
| TC-ANALYTICS-008 | Debug mode | debug=true | Console log output | [x] |

### Test Files

- `src/test/services/analytics.test.ts`

---

## Implementation Details

### Device ID Generation

Uses UUID v4 to generate a unique device ID, stored locally:

```typescript
function getDeviceId(): string {
    const DEVICE_ID_KEY = 'mobaus_device_id';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
}
```

### Mixpanel Track API Request Format

```typescript
// POST https://api.mixpanel.com/track
[
    {
        "event": "message_sent",
        "properties": {
            "token": "YOUR_PROJECT_TOKEN",
            "distinct_id": "device_id_xxx",
            "time": 1234567890,
            "$insert_id": "unique-id",
            "$os": "macOS",
            "$app_version": "1.0.0",
            "modelId": "gpt-4",
            "messageLength": 100
        }
    }
]
```

### Mixpanel Engage API Request Format (User Properties)

```typescript
// POST https://api.mixpanel.com/engage
[
    {
        "$token": "YOUR_PROJECT_TOKEN",
        "$distinct_id": "device_id_xxx",
        "$set": {
            "appVersion": "1.0.0",
            "os": "macOS",
            "language": "zh"
        }
    }
]
```

### Error Handling

Analytics service errors **should not affect main app functionality**:

```typescript
async function track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    try {
        // Send event...
    } catch (error) {
        // Silent failure, only log in debug mode
        if (config.debug) {
            logger.warn(LogTags.ANALYTICS, 'Event sending failed:', error);
        }
    }
}
```

---

## Environment Variable Configuration

```bash
# .env.local or .env.production

# Mixpanel Project Token (required)
VITE_MIXPANEL_TOKEN=your_project_token

# Mixpanel proxy endpoint (optional, needed for domestic users)
VITE_MIXPANEL_PROXY=https://your-proxy.workers.dev
```

---

## Notes

1. **Privacy Compliance**: No personally identifiable information (PII) is collected, only anonymous device IDs are used
2. **Performance Impact**: Analytics requests are sent asynchronously, not blocking the main thread
3. **Error Isolation**: Analytics failures do not affect normal app functionality
4. **Data Real-time**: Mixpanel data is visible almost in real-time
5. **Domestic Access**: Domestic users need to configure a Cloudflare Worker proxy

---

## Change History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-01-XX | 1.0.0 | - | Initial version (Amplitude) |
| 2025-01-XX | 2.0.0 | - | Migrated to Mixpanel, added Cloudflare Worker proxy support |

---

## Related Links

- [Mixpanel Official Documentation](https://docs.mixpanel.com/)
- [Mixpanel HTTP API](https://docs.mixpanel.com/docs/tracking-methods/http)
- [Mixpanel Pricing](https://mixpanel.com/pricing/) (Free tier supports 20 million events/month)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

---

<a id="中文"></a>

## 模块概述

Analytics 模块提供运营数据统计功能，使用 Mixpanel 作为第三方统计服务，收集用户数量、用户行为等运营数据。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/services/analytics.ts` |
| 第三方服务 | [Mixpanel](https://mixpanel.com) |
| API 端点 | `https://api.mixpanel.com` |
| 代理方案 | Cloudflare Worker |
| 创建日期 | 2025-01-XX |
| 最后更新 | 2025-01-XX |

---

## 功能列表

### 核心功能

- [x] 用户识别（设备 ID）
- [x] 应用启动统计
- [x] 用户行为追踪
- [x] 模型使用统计
- [x] 功能使用统计

### 扩展功能

- [x] 用户属性设置
- [x] Cloudflare Worker 代理（解决国内网络问题）
- [ ] 离线事件缓存
- [ ] 批量上报

---

## 架构设计

### 直连模式（海外用户）

```
┌─────────────────┐
│  MobausStudio   │
│   (Tauri App)   │
└────────┬────────┘
         │
         │ HTTP POST
         ▼
┌─────────────────┐
│    Mixpanel     │
│  api.mixpanel   │
│     .com        │
└─────────────────┘
```

### 代理模式（国内用户）

```
┌─────────────────┐
│  MobausStudio   │
│   (Tauri App)   │
└────────┬────────┘
         │
         │ HTTP POST
         ▼
┌─────────────────┐
│   Cloudflare    │
│     Worker      │
│  (your-proxy)   │
└────────┬────────┘
         │
         │ 转发请求
         ▼
┌─────────────────┐
│    Mixpanel     │
│  api.mixpanel   │
│     .com        │
└─────────────────┘
```

### 文件结构

```
src/
├── services/
│   └── analytics.ts           # 统计服务（核心）
├── test/
│   └── services/
│       └── analytics.test.ts  # 单元测试
scripts/
└── cloudflare-worker-mixpanel.js  # Cloudflare Worker 代理代码
```

---

## 数据结构

### AnalyticsConfig 配置

```typescript
interface AnalyticsConfig {
    /** Mixpanel Project Token */
    projectToken: string;
    /** API 端点（可选，用于配置代理） */
    endpoint?: string;
    /** 是否启用（生产环境启用，开发环境可选） */
    enabled?: boolean;
    /** 调试模式 */
    debug?: boolean;
}
```

### UserProperties 用户属性

```typescript
interface UserProperties {
    /** 应用版本 */
    appVersion?: string;
    /** 操作系统 */
    os?: string;
    /** 操作系统版本 */
    osVersion?: string;
    /** 语言设置 */
    language?: string;
    /** 主题设置 */
    theme?: string;
    /** 首次启动时间 */
    firstLaunchAt?: string;
}
```

---

## API 接口

### analytics.init(config)

初始化统计服务

**参数：**
- config: AnalyticsConfig - 配置对象

**返回：**
- void

**示例：**
```typescript
import { analytics } from '@/services/analytics';

// 直连模式（海外用户）
analytics.init({
    projectToken: 'YOUR_MIXPANEL_PROJECT_TOKEN',
    enabled: true,
    debug: false,
});

// 代理模式（国内用户）
analytics.init({
    projectToken: 'YOUR_MIXPANEL_PROJECT_TOKEN',
    endpoint: 'https://your-proxy.workers.dev',
    enabled: true,
    debug: false,
});
```

### analytics.identify(userProperties?)

识别用户并设置用户属性

**参数：**
- userProperties: UserProperties (可选) - 用户属性

**返回：**
- void

### analytics.track(eventName, properties?)

追踪事件

**参数：**
- eventName: string - 事件名称
- properties: Record<string, unknown> (可选) - 事件属性

**返回：**
- void

**示例：**
```typescript
// 追踪消息发送
analytics.track('message_sent', {
    modelId: 'gpt-4',
    messageLength: 100,
    hasAttachment: false,
});
```

### analytics.setUserProperties(properties)

更新用户属性

**参数：**
- properties: Partial<UserProperties> - 要更新的属性

**返回：**
- void

---

## Cloudflare Worker 代理配置

### 为什么需要代理？

Mixpanel API (`api.mixpanel.com`) 在国内可能无法直接访问。通过 Cloudflare Worker 代理可以解决这个问题。

### 部署步骤

1. **登录 Cloudflare Dashboard**
   - 访问 https://dash.cloudflare.com
   - 注册/登录账号（免费）

2. **创建 Worker**
   - 进入 Workers & Pages
   - 点击 "Create Worker"
   - 复制 `scripts/cloudflare-worker-mixpanel.js` 中的代码
   - 部署

3. **配置环境变量**
   ```bash
   # .env
   VITE_MIXPANEL_TOKEN=your_project_token
   VITE_MIXPANEL_PROXY=https://your-worker.workers.dev
   ```

4. **（可选）绑定自定义域名**
   - 在 Worker 设置中添加自定义域名
   - 如 `analytics.yourdomain.com`

### 免费额度

| 项目 | 免费额度 |
|------|----------|
| 请求数 | 100,000/天 |
| CPU 时间 | 10ms/请求 |
| Workers 数量 | 无限制 |

对于统计服务来说，免费额度完全够用。

---

## 埋点事件设计

### 用户生命周期事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `app_launched` | 应用启动 | `{ version, os, language }` |
| `app_closed` | 应用关闭 | `{ sessionDuration }` |
| `app_updated` | 应用更新 | `{ fromVersion, toVersion }` |

### 对话相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `chat_created` | 创建新对话 | `{ modelId }` |
| `chat_deleted` | 删除对话 | `{ messageCount }` |
| `message_sent` | 发送消息 | `{ modelId, messageLength, hasAttachment }` |
| `message_received` | 收到回复 | `{ modelId, tokens, responseTime }` |

### 模型相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `model_added` | 添加模型 | `{ providerId, modelName }` |
| `model_deleted` | 删除模型 | `{ providerId, modelName }` |
| `model_switched` | 切换模型 | `{ fromModel, toModel }` |

### Agent 相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `agent_created` | 创建 Agent | `{ agentName }` |
| `agent_deleted` | 删除 Agent | `{ agentName }` |
| `agent_used` | 使用 Agent | `{ agentId, agentName }` |

### Skill 相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `skill_created` | 创建技能 | `{ skillName, isBuiltIn }` |
| `skill_deleted` | 删除技能 | `{ skillName }` |
| `skill_used` | 使用技能 | `{ skillId, skillName }` |
| `skill_installed` | 安装技能 | `{ skillName, source }` |

### MCP 相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `mcp_server_added` | 添加 MCP 服务器 | `{ serverName, transportType }` |
| `mcp_server_deleted` | 删除 MCP 服务器 | `{ serverName }` |
| `mcp_server_connected` | 连接 MCP 服务器 | `{ serverName, toolCount }` |
| `mcp_tool_used` | 使用 MCP 工具 | `{ serverName, toolName }` |

### Provider 相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `provider_connected` | 连接提供商 | `{ providerId, authType }` |
| `provider_disconnected` | 断开提供商 | `{ providerId }` |

### 设置相关事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `settings_changed` | 修改设置 | `{ settingKey, newValue }` |
| `theme_changed` | 切换主题 | `{ theme }` |
| `language_changed` | 切换语言 | `{ language }` |

### 圆桌会议事件

| 事件名称 | 触发时机 | 事件属性 |
|----------|----------|----------|
| `roundtable_created` | 创建圆桌会议 | `{ participantCount, topic }` |
| `roundtable_completed` | 完成圆桌会议 | `{ roundCount, messageCount, duration }` |

---

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-ANALYTICS-001 | 初始化服务 | 有效配置 | 服务初始化成功 | [x] |
| TC-ANALYTICS-002 | 初始化服务（禁用） | enabled=false | 不发送任何请求 | [x] |
| TC-ANALYTICS-003 | 追踪事件 | 有效事件名 | 事件发送成功 | [x] |
| TC-ANALYTICS-004 | 追踪事件（带属性） | 事件名+属性 | 属性正确发送 | [x] |
| TC-ANALYTICS-005 | 用户识别 | 设备 ID | 用户 ID 设置成功 | [x] |
| TC-ANALYTICS-006 | 设置用户属性 | 属性对象 | 属性更新成功 | [x] |
| TC-ANALYTICS-007 | 网络错误处理 | 网络不可用 | 静默失败，不影响应用 | [x] |
| TC-ANALYTICS-008 | 调试模式 | debug=true | 控制台输出日志 | [x] |

### 测试文件

- `src/test/services/analytics.test.ts`

---

## 实现细节

### 设备 ID 生成

使用 UUID v4 生成唯一设备 ID，存储在本地：

```typescript
function getDeviceId(): string {
    const DEVICE_ID_KEY = 'mobaus_device_id';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
}
```

### Mixpanel Track API 请求格式

```typescript
// POST https://api.mixpanel.com/track
[
    {
        "event": "message_sent",
        "properties": {
            "token": "YOUR_PROJECT_TOKEN",
            "distinct_id": "device_id_xxx",
            "time": 1234567890,
            "$insert_id": "unique-id",
            "$os": "macOS",
            "$app_version": "1.0.0",
            "modelId": "gpt-4",
            "messageLength": 100
        }
    }
]
```

### Mixpanel Engage API 请求格式（用户属性）

```typescript
// POST https://api.mixpanel.com/engage
[
    {
        "$token": "YOUR_PROJECT_TOKEN",
        "$distinct_id": "device_id_xxx",
        "$set": {
            "appVersion": "1.0.0",
            "os": "macOS",
            "language": "zh"
        }
    }
]
```

### 错误处理

统计服务的错误**不应影响主应用功能**：

```typescript
async function track(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    try {
        // 发送事件...
    } catch (error) {
        // 静默失败，仅在调试模式下输出日志
        if (config.debug) {
            logger.warn(LogTags.ANALYTICS, '事件发送失败:', error);
        }
    }
}
```

---

## 环境变量配置

```bash
# .env.local 或 .env.production

# Mixpanel Project Token（必填）
VITE_MIXPANEL_TOKEN=your_project_token

# Mixpanel 代理端点（可选，国内用户需要配置）
VITE_MIXPANEL_PROXY=https://your-proxy.workers.dev
```

---

## 注意事项

1. **隐私合规**：不收集任何个人身份信息（PII），仅使用匿名设备 ID
2. **性能影响**：统计请求异步发送，不阻塞主线程
3. **错误隔离**：统计失败不影响应用正常功能
4. **数据实时性**：Mixpanel 数据几乎实时可见
5. **国内访问**：国内用户需要配置 Cloudflare Worker 代理

---

## 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2025-01-XX | 1.0.0 | - | 初始版本（Amplitude） |
| 2025-01-XX | 2.0.0 | - | 迁移到 Mixpanel，添加 Cloudflare Worker 代理支持 |

---

## 相关链接

- [Mixpanel 官方文档](https://docs.mixpanel.com/)
- [Mixpanel HTTP API](https://docs.mixpanel.com/docs/tracking-methods/http)
- [Mixpanel 价格](https://mixpanel.com/pricing/)（免费版支持 2000 万事件/月）
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
