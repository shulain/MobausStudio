# Anthropic 模型更新记录

## 📅 2026-02-28 更新

### 新增模型

#### Claude 4.6 系列（最新）

| 模型 ID | 名称 | 发布日期 | 上下文窗口 | 最大输出 | 特性 |
|---------|------|----------|-----------|---------|------|
| `claude-opus-4-20260205` | Claude Opus 4.6 | 2026-02-05 | 1M tokens | 128K | 最强推理能力，支持自适应思考 |
| `claude-sonnet-4-20260217` | Claude Sonnet 4.6 | 2026-02-17 | 1M tokens | 16K | 速度与智能平衡，支持扩展思考 |

**亮点：**
- ✅ **1M token 上下文窗口**（beta）
- ✅ **自适应思考**（Opus 4.6）
- ✅ **扩展思考**（Sonnet 4.6）
- ✅ **代码执行工具**免费（与 web search/fetch 配合使用）
- ✅ **动态过滤**（web search）
- ✅ **Fast Mode**（Opus 4.6，研究预览）

#### Claude 4.5 系列

| 模型 ID | 名称 | 发布日期 | 上下文窗口 | 最大输出 |
|---------|------|----------|-----------|---------|
| `claude-opus-4-5-20251124` | Claude Opus 4.5 | 2025-11-24 | 200K | 16K |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 | 2025-09-29 | 1M (beta) | 16K |
| `claude-haiku-4-5-20251015` | Claude Haiku 4.5 | 2025-10-15 | 200K | 8K |

#### Claude 4.1 系列

| 模型 ID | 名称 | 发布日期 | 上下文窗口 | 最大输出 |
|---------|------|----------|-----------|---------|
| `claude-opus-4-1-20250805` | Claude Opus 4.1 | 2025-08-05 | 200K | 16K |

#### Claude 4 系列

| 模型 ID | 名称 | 发布日期 | 上下文窗口 | 最大输出 |
|---------|------|----------|-----------|---------|
| `claude-opus-4-20250522` | Claude Opus 4 | 2025-05-22 | 200K | 16K |
| `claude-sonnet-4-20250522` | Claude Sonnet 4 | 2025-05-22 | 1M (beta) | 16K |

### 已废弃模型

#### 2026-02-19 废弃

- ❌ `claude-3-7-sonnet-20250219` - Claude 3.7 Sonnet
- ❌ `claude-3-5-haiku-20241022` - Claude 3.5 Haiku

**替代方案：**
- Claude 3.7 Sonnet → Claude Sonnet 4.6
- Claude 3.5 Haiku → Claude Haiku 4.5

#### 2026-01-05 废弃

- ❌ `claude-3-opus-20240229` - Claude 3 Opus

**替代方案：** Claude Opus 4.5（性能提升，成本降低 2/3）

#### 2025-10-28 废弃

- ❌ `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet (2024-10-22)
- ❌ `claude-3-5-sonnet-20240620` - Claude 3.5 Sonnet (2024-06-20)

**替代方案：** Claude Sonnet 4.5

#### 2025-07-21 废弃

- ❌ `claude-3-sonnet-20240229` - Claude 3 Sonnet
- ❌ `claude-2.1` - Claude 2.1
- ❌ `claude-2.0` - Claude 2.0

#### 即将废弃（2026-04-19）

- ⚠️ `claude-3-haiku-20240307` - Claude 3 Haiku

**替代方案：** Claude Haiku 4.5

---

## 📊 模型对比

### 推荐模型（2026-02）

| 用途 | 推荐模型 | 理由 |
|------|---------|------|
| 复杂推理任务 | Claude Opus 4.6 | 最强推理能力，1M 上下文 |
| 日常对话 | Claude Sonnet 4.6 | 速度与智能平衡，性价比高 |
| 高频调用 | Claude Haiku 4.5 | 最快速度，成本最低 |
| 代码生成 | Claude Sonnet 4.5/4.6 | 优秀的编程能力 |
| 长文档处理 | Claude Opus 4.6 / Sonnet 4.6 | 1M token 上下文窗口 |

### 定价对比（每百万 token）

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| Claude Opus 4.6 | $5 | $25 |
| Claude Sonnet 4.6 | $3 | $15 |
| Claude Opus 4.5 | $5 | $25 |
| Claude Sonnet 4.5 | $3 | $15 |
| Claude Haiku 4.5 | $1 | $5 |

---

## 🆕 新功能

### 自动缓存（2026-02-19）

- 只需添加一个 `cache_control` 字段
- 系统自动缓存最后一个可缓存块
- 随着对话增长自动移动缓存点
- 无需手动管理断点

### 1M Token 上下文窗口（Beta）

**支持模型：**
- Claude Opus 4.6
- Claude Sonnet 4.6
- Claude Sonnet 4.5
- Claude Sonnet 4

**定价：**
- 前 200K tokens：标准价格
- 超过 200K tokens：长上下文定价

### Fast Mode（研究预览）

**仅限 Claude Opus 4.6：**
- 输出速度提升 2.5 倍
- 需要加入 [waitlist](https://claude.com/fast-mode)
- 高级定价

### 代码执行工具

- 与 web search/fetch 配合使用时**免费**
- 支持 Bash 命令执行
- 直接文件操作
- 多语言支持

---

## 🔄 迁移指南

### 从 Claude 3.5 迁移到 4.6

```typescript
// 旧配置
const model = 'claude-3-5-sonnet-20241022';

// 新配置
const model = 'claude-sonnet-4-20260217';
```

**注意事项：**
- ✅ API 接口完全兼容
- ✅ 性能显著提升
- ✅ 支持更多功能（扩展思考、1M 上下文）
- ⚠️ 定价可能不同

### 从 Claude 3 Opus 迁移到 Opus 4.5

```typescript
// 旧配置
const model = 'claude-3-opus-20240229';

// 新配置
const model = 'claude-opus-4-5-20251124';
```

**优势：**
- ✅ 性能提升
- ✅ 成本降低 2/3
- ✅ 更好的视觉能力
- ✅ 更强的编程能力

---

## 📝 更新日志

### 2026-02-28
- ✅ 更新到最新模型列表
- ✅ 添加 Claude 4.6 系列
- ✅ 标记已废弃模型
- ✅ 更新上下文窗口信息
- ✅ 更新最大输出 token 数

### 历史版本
- 2025-05-22: 添加 Claude 4 系列
- 2025-09-29: 添加 Claude Sonnet 4.5
- 2025-10-15: 添加 Claude Haiku 4.5
- 2025-11-24: 添加 Claude Opus 4.5
- 2026-02-05: 添加 Claude Opus 4.6
- 2026-02-17: 添加 Claude Sonnet 4.6

---

## 🔗 参考资源

- [Anthropic 官方文档](https://platform.claude.com/docs)
- [模型定价](https://claude.com/platform/api)
- [API 发布说明](https://platform.claude.com/docs/en/release-notes/api)
- [模型废弃计划](https://platform.claude.com/docs/en/about-claude/model-deprecations)

---

## Sources

- [Claude Developer Platform](https://platform.claude.com/docs/en/release-notes/api)
- [Claude Sonnet 4.6 API Guide](https://www.apidog.com/blog/claude-sonnet-4-6-api/)
- [Claude Opus 4.6 API Guide](https://apidog.com/blog/claude-opus-4-6-api/)
- [Claude API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude Opus 4.6 Pricing Guide](https://blog.laozhang.ai/en/posts/claude-opus-4-6-pricing-subscription-guide)
