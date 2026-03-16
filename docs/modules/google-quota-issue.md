# Google Cloud Code API Quota Issue / Google Cloud Code API 配额问题说明

> [English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

### Symptoms

When using Google Cloud Code API to call Claude models, all endpoints return 429 errors:

```
"message": "You have exhausted your capacity on this model. Your quota will reset after 135h10m5s."
"model": "claude-opus-4-5-thinking"
```

### Root Cause

#### 1. Quota is Account-Level

Google Cloud Code API quota is **account-level**, not endpoint-level. Even when switching endpoints (Sandbox/Daily/Prod), the quota is shared.

#### 2. Different Models Have Different Quotas

- **Gemini models**: More generous quota
- **Claude models**: Stricter quota, easily exhausted

#### 3. Claude Model Quota Exhausted

From the error message:
- Model: `claude-opus-4-5-thinking`
- Status: `QUOTA_EXHAUSTED`
- Reset time: 135 hours (approximately 5.6 days)

### Solutions

#### Solution 1: Switch to Gemini Models (Recommended)

**Advantages:**
- Ample quota
- Fast response
- Tool call support

**Recommended Models:**
```
gemini-2.5-flash          # Fastest, suitable for daily use
gemini-2.5-pro            # More powerful, suitable for complex tasks
gemini-2.0-flash-exp      # Experimental, latest features
```

**Steps:**
1. Open model settings
2. Select Google provider
3. Switch to a Gemini model

#### Solution 2: Use Another Google Account

**Advantages:**
- Can continue using Claude models
- Each account has independent quota

**Steps:**
1. Log out of current Google account
2. Log in with another Google account
3. Re-authorize OAuth

#### Solution 3: Use Anthropic API Directly

**Advantages:**
- Not subject to Google quota limits
- Direct connection to Anthropic, more stable

**Steps:**
1. Get Anthropic API Key (https://console.anthropic.com/)
2. Add Anthropic provider
3. Use Claude models

**Configuration Example:**
```
Provider: Anthropic
API Key: sk-ant-xxx
Model: claude-opus-4
Endpoint: https://api.anthropic.com
```

#### Solution 4: Wait for Quota Reset

**Disadvantage:**
- Need to wait 135 hours (approximately 5.6 days)

**Applicable Scenarios:**
- No other accounts available
- Don't want to switch models
- Not urgent

### Quota Management Recommendations

#### 1. Monitor Quota Usage

Regularly check quota usage:
- Check Google Cloud Console
- Monitor 429 error frequency
- Record quota reset times

#### 2. Choose Models Wisely

Select appropriate models based on task complexity:

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Simple conversation | gemini-2.5-flash | Fast, ample quota |
| Complex reasoning | gemini-2.5-pro | Powerful, ample quota |
| Code generation | claude-sonnet-4-5 | Professional, but limited quota |
| Deep thinking | claude-opus-4-5-thinking | Most powerful, but strictest quota |

#### 3. Multi-Account Rotation

If frequently using Claude models:
- Prepare 2-3 Google accounts
- Rotate usage to avoid single account quota exhaustion
- Record quota reset times for each account

#### 4. Mixed Usage

Mix different providers based on task type:
- **Daily conversation**: Google Gemini
- **Code generation**: Anthropic Claude
- **Quick responses**: OpenAI GPT
- **Local deployment**: Ollama

### Error Message Optimization

#### v0.9.2 Optimization

Now displays a friendlier error message when quota is exhausted:

```
Warning: Claude model quota exhausted (resets in approximately 5-6 days).

Suggestions:
1. Switch to another model (e.g., Gemini 2.5 Flash)
2. Use another Google account
3. Wait for quota reset before trying again
```

#### Error Information Parsing

The system automatically parses error information, extracting:
- Model name (Claude/Gemini)
- Reset time (hours)
- Specific suggestions

### FAQ

#### Q: Why does switching endpoints still result in 429?

A: Because quota is account-level, not endpoint-level. All endpoints share the same account's quota.

#### Q: Do Gemini models also get 429?

A: Yes, but Gemini models have much more generous quota than Claude models and are less likely to be exhausted.

#### Q: How to check remaining quota?

A: Currently Google Cloud Code API does not provide a quota query interface. You can only determine if quota is exhausted through 429 errors.

#### Q: Will quota automatically restore after reset?

A: Yes, quota automatically resets at the specified time; no manual action needed.

#### Q: Can I purchase more quota?

A: Google Cloud Code API currently does not support purchasing additional quota. If you need more, consider using multiple accounts or directly using the Anthropic API.

### Technical Details

#### Quota Error Response Format

```json
{
  "error": {
    "code": 429,
    "message": "You have exhausted your capacity on this model. Your quota will reset after 135h10m5s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "QUOTA_EXHAUSTED",
        "domain": "cloudcode-pa.googleapis.com",
        "metadata": {
          "model": "claude-opus-4-5-thinking",
          "quotaResetDelay": "135h9m46s",
          "quotaResetTimeStamp": "2026-03-05T07:20:42Z"
        }
      }
    ]
  }
}
```

#### Retry Strategy

When encountering 429 errors:
1. Try all endpoints (Sandbox -> Daily -> Prod)
2. Retry 3 times per endpoint
3. Use linear backoff (5s -> 10s -> 15s)
4. After final failure, display friendly message

### References

- [Google Cloud Code API Documentation](https://cloud.google.com/code)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Quota Management Best Practices](https://cloud.google.com/docs/quota)

### Update Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-28 | v0.9.2 | Added friendly quota error messages |

---

<a id="中文"></a>

## 中文

### 问题现象

使用 Google Cloud Code API 调用 Claude 模型时，所有端点都返回 429 错误：

```
"message": "You have exhausted your capacity on this model. Your quota will reset after 135h10m5s."
"model": "claude-opus-4-5-thinking"
```

### 问题原因

#### 1. 配额是账号级别的

Google Cloud Code API 的配额是**账号级别**的，不是端点级别的。即使切换端点（Sandbox/Daily/Prod），配额仍然是共享的。

#### 2. 不同模型有不同配额

- **Gemini 模型**：配额较充足
- **Claude 模型**：配额较严格，容易耗尽

#### 3. Claude 模型配额已耗尽

从错误信息可以看出：
- 模型：`claude-opus-4-5-thinking`
- 状态：`QUOTA_EXHAUSTED`
- 重置时间：135 小时（约 5.6 天）

### 解决方案

#### 方案 1：切换到 Gemini 模型（推荐）

**优点：**
- 配额充足
- 响应速度快
- 支持工具调用

**推荐模型：**
```
gemini-2.5-flash          # 最快，适合日常使用
gemini-2.5-pro            # 更强大，适合复杂任务
gemini-2.0-flash-exp      # 实验版本，功能最新
```

**操作步骤：**
1. 打开模型设置
2. 选择 Google 提供商
3. 切换到 Gemini 模型

#### 方案 2：使用其他 Google 账号

**优点：**
- 可以继续使用 Claude 模型
- 每个账号有独立配额

**操作步骤：**
1. 退出当前 Google 账号
2. 使用另一个 Google 账号登录
3. 重新授权 OAuth

#### 方案 3：直接使用 Anthropic API

**优点：**
- 不受 Google 配额限制
- 直连 Anthropic，更稳定

**操作步骤：**
1. 获取 Anthropic API Key（https://console.anthropic.com/）
2. 添加 Anthropic 提供商
3. 使用 Claude 模型

**配置示例：**
```
Provider: Anthropic
API Key: sk-ant-xxx
Model: claude-opus-4
Endpoint: https://api.anthropic.com
```

#### 方案 4：等待配额重置

**缺点：**
- 需要等待 135 小时（约 5.6 天）

**适用场景：**
- 没有其他账号
- 不想切换模型
- 不着急使用

### 配额管理建议

#### 1. 监控配额使用

定期检查配额使用情况：
- 查看 Google Cloud Console
- 关注 429 错误频率
- 记录配额重置时间

#### 2. 合理选择模型

根据任务复杂度选择合适的模型：

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| 简单对话 | gemini-2.5-flash | 快速，配额充足 |
| 复杂推理 | gemini-2.5-pro | 强大，配额充足 |
| 代码生成 | claude-sonnet-4-5 | 专业，但配额有限 |
| 深度思考 | claude-opus-4-5-thinking | 最强，但配额最严格 |

#### 3. 多账号轮换

如果经常使用 Claude 模型：
- 准备 2-3 个 Google 账号
- 轮换使用，避免单个账号配额耗尽
- 记录每个账号的配额重置时间

#### 4. 混合使用

根据任务类型混合使用不同提供商：
- **日常对话**：Google Gemini
- **代码生成**：Anthropic Claude
- **快速响应**：OpenAI GPT
- **本地部署**：Ollama

### 错误提示优化

#### v0.9.2 优化

现在当遇到配额耗尽时，会显示更友好的错误提示：

```
⚠️ Claude 模型配额已耗尽（约 5-6 天后重置）。

建议：
1. 切换到其他模型（如 Gemini 2.5 Flash）
2. 使用其他 Google 账号
3. 等待配额重置后再试
```

#### 错误信息解析

系统会自动解析错误信息，提取：
- 模型名称（Claude/Gemini）
- 重置时间（小时数）
- 具体建议

### 常见问题

#### Q: 为什么切换端点还是 429？

A: 因为配额是账号级别的，不是端点级别的。所有端点共享同一个账号的配额。

#### Q: Gemini 模型也会 429 吗？

A: 会，但 Gemini 模型的配额比 Claude 模型充足得多，不容易耗尽。

#### Q: 如何查看剩余配额？

A: 目前 Google Cloud Code API 没有提供查询配额的接口。只能通过 429 错误来判断配额是否耗尽。

#### Q: 配额重置后会自动恢复吗？

A: 是的，配额会在指定时间后自动重置，无需手动操作。

#### Q: 可以购买更多配额吗？

A: Google Cloud Code API 目前不支持购买额外配额。如果需要更多配额，建议使用多个账号或直接使用 Anthropic API。

### 技术细节

#### 配额错误响应格式

```json
{
  "error": {
    "code": 429,
    "message": "You have exhausted your capacity on this model. Your quota will reset after 135h10m5s.",
    "status": "RESOURCE_EXHAUSTED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "QUOTA_EXHAUSTED",
        "domain": "cloudcode-pa.googleapis.com",
        "metadata": {
          "model": "claude-opus-4-5-thinking",
          "quotaResetDelay": "135h9m46s",
          "quotaResetTimeStamp": "2026-03-05T07:20:42Z"
        }
      }
    ]
  }
}
```

#### 重试策略

当遇到 429 错误时：
1. 尝试所有端点（Sandbox → Daily → Prod）
2. 每个端点重试 3 次
3. 使用线性退避（5s → 10s → 15s）
4. 最终失败后显示友好提示

### 参考资料

- [Google Cloud Code API 文档](https://cloud.google.com/code)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [配额管理最佳实践](https://cloud.google.com/docs/quota)

### 更新日志

| 日期 | 版本 | 修改内容 |
|------|------|----------|
| 2026-02-28 | v0.9.2 | 添加友好的配额错误提示 |
