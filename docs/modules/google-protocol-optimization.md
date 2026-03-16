# Google 协议优化模块

## 模块职责
优化 Google Gemini API 调用的稳定性和可用性，解决 429/503 错误问题

## 核心功能

### 1. 多端点降级机制
实现三层端点自动降级，提高服务可用性

**端点优先级：**
| 端点 | 优先级 | 特点 | 使用场景 |
|------|--------|------|----------|
| Sandbox | 1️⃣ | 最稳定，配额充足，延迟高 | 主要端点 |
| Daily | 2️⃣ | 中等稳定性和延迟 | Sandbox 失败时 |
| Prod | 3️⃣ | 最快，但容易 429 | Daily 失败时 |

### 2. 智能重试策略
根据不同错误码采用不同的重试策略

**重试策略表：**
| 错误码 | 策略 | 参数 | 说明 |
|--------|------|------|------|
| 429 | 线性退避 | 5s 起始 | 配额限制，逐步增加等待 |
| 503 | 指数退避 | 10s 起始，60s 上限 | 服务过载，快速增加等待 |
| 500 | 线性退避 | 3s 起始 | 服务器错误 |
| 401/403 | 固定延迟 | 200ms | 认证错误，快速切换账号 |
| 404 | 固定延迟 | 300ms | 资源未找到，切换账号 |
| 400 | 不重试 | - | 参数错误，无需重试 |

### 3. 账号轮换机制
针对账号级别错误自动切换账号

**轮换条件：**
- 429（配额限制）
- 401/403（认证/权限错误）
- 404（资源未找到）
- 500（服务器错误）

**不轮换条件：**
- 400（参数错误）
- 503（全局服务问题）
- 529（服务器过载）

## 接口定义

### GoogleProtocolOptimizer

#### call_with_fallback()
带端点降级的 API 调用

**参数：**
- method (str): API 方法名
- access_token (str): 访问令牌
- body (Value): 请求体
- query_string (Option<&str>): 查询字符串
- account_id (Option<&str>): 账号 ID

**返回：**
- 成功: Response
- 失败: 错误信息

#### call_with_retry()
带重试的 API 调用

**参数：**
- method (str): API 方法名
- access_token (str): 访问令牌
- body (Value): 请求体
- max_attempts (usize): 最大重试次数

**返回：**
- 成功: Response
- 失败: 错误信息

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-GOOGLE-OPT-001 | 端点降级判断 | 429/503/404 状态码 | 返回 true，应该降级 | ✅ 通过 |
| TC-GOOGLE-OPT-002 | 重试策略判断 | 不同错误码 | 返回对应策略 | ✅ 通过 |
| TC-GOOGLE-OPT-003 | 模型名称映射 | gemini-3-pro-preview | 映射为 gemini-3-pro-low | ✅ 通过 |
| TC-GOOGLE-OPT-004 | OAuth Token 检测 | ya29.xxx | 返回 true | ✅ 通过 |
| TC-GOOGLE-OPT-005 | Prod 端点 429 | 正常请求 | 自动切换到 Daily | 🔄 待集成测试 |
| TC-GOOGLE-OPT-006 | Daily 端点 429 | 正常请求 | 自动切换到 Sandbox | 🔄 待集成测试 |
| TC-GOOGLE-OPT-007 | 503 错误重试 | 正常请求 | 指数退避重试 | 🔄 待集成测试 |
| TC-GOOGLE-OPT-008 | 429 错误重试 | 正常请求 | 线性退避重试 | 🔄 待集成测试 |

## 实现细节

### 端点常量
```rust
const V1_INTERNAL_BASE_URL_PROD: &str = "https://cloudcode-pa.googleapis.com/v1internal";
const V1_INTERNAL_BASE_URL_DAILY: &str = "https://daily-cloudcode-pa.googleapis.com/v1internal";
const V1_INTERNAL_BASE_URL_SANDBOX: &str = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal";

const V1_INTERNAL_BASE_URL_FALLBACKS: [&str; 3] = [
    V1_INTERNAL_BASE_URL_SANDBOX,
    V1_INTERNAL_BASE_URL_DAILY,
    V1_INTERNAL_BASE_URL_PROD,
];
```

### 降级判断逻辑
```rust
fn should_try_next_endpoint(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS
        || status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::NOT_FOUND
        || status.is_server_error()
}
```

## 变更记录

| 日期 | 修改内容 | 修改人 |
|------|----------|--------|
| 2026-02-27 | 初始版本 | Claude |
