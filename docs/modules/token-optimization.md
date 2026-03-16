# Token 消耗优化 (v4.1.38)

## 📋 优化概述

针对长对话场景的 token 二次增长问题，实施滑动窗口机制限制历史消息数量。

| 属性 | 值 |
|------|------|
| 优化模块 | `src/utils/chatUtils.ts` |
| 实施日期 | 2026-02-28 |
| 版本 | v4.1.38 |

---

## 🎯 问题分析

### Token 消耗的二次增长

所有 AI API（OpenAI、Anthropic、Google）都采用**完整上下文**计费模式：

```
每次 API 调用都要发送完整历史 = 历史消息 + 新消息
```

**示例：10 轮对话的 token 消耗**

| 轮次 | 新消息 | 历史累计 | 本次发送 | 累计消耗 |
|------|--------|----------|----------|----------|
| 1 | 100 | 0 | 100 | 100 |
| 2 | 100 | 100 | 200 | 300 |
| 3 | 100 | 200 | 300 | 600 |
| 4 | 100 | 300 | 400 | 1,000 |
| 5 | 100 | 400 | 500 | 1,500 |
| ... | ... | ... | ... | ... |
| 10 | 100 | 900 | 1,000 | 5,500 |

**实际有效内容：1,000 tokens（10 × 100）**
**累计消耗：5,500 tokens**
**浪费率：81.8%**

### 工具调用让问题更严重

每轮工具调用需要 2 次 API 请求：

```
轮次 1：
  - 用户消息：100 tokens → 发送 100 tokens
  - 工具续传：150 tokens → 发送 250 tokens（100 历史 + 150 新）

轮次 2：
  - 用户消息：100 tokens → 发送 350 tokens（250 历史 + 100 新）
  - 工具续传：150 tokens → 发送 500 tokens（350 历史 + 150 新）

10 轮后累计消耗：约 11,000 tokens（比无工具调用多 2 倍）
```

### 长对话的 Token 爆炸

| 对话轮数 | 无限制消耗 | 浪费率 |
|---------|-----------|--------|
| 10 轮 | 5.5k tokens | 81.8% |
| 100 轮 | 505k tokens | 99.0% |
| 500 轮 | 12.5M tokens | 99.96% |

---

## ✅ 优化方案

### 滑动窗口机制

只保留最近 **100 条**历史消息，超出部分自动截断。

```typescript
// src/utils/chatUtils.ts
const MAX_HISTORY_MESSAGES = 100;

// 只保留最近 100 条消息
let windowedHistory = historyMessages.slice(-MAX_HISTORY_MESSAGES);
```

### 工具调用完整性保证

如果窗口第一条是 `tool` 消息，自动向前查找对应的 `assistant` 消息：

```typescript
// 检查第一条消息是否是 tool 结果
if (windowedHistory[0].toolResults) {
    const firstToolCallId = windowedHistory[0].toolResults[0].callId;

    // 从完整历史中向前查找包含该 tool_call_id 的 assistant 消息
    const assistantIndex = historyMessages.findIndex(
        m => m.toolCalls?.some(tc => tc.id === firstToolCallId)
    );

    // 从 assistant 消息开始截取，确保工具调用完整
    if (assistantIndex >= 0) {
        windowedHistory = historyMessages.slice(assistantIndex);
    }
}
```

**为什么需要？**

API 要求 `tool` 消息必须有对应的 `tool_calls`，否则返回 400 错误：

```
❌ 错误示例：
[
  { role: 'tool', tool_call_id: 'call_123', content: 'Result' },  // 找不到对应的 tool_calls
  { role: 'user', content: 'Next' }
]

✅ 正确示例：
[
  { role: 'assistant', tool_calls: [{ id: 'call_123', ... }] },  // 包含 tool_calls
  { role: 'tool', tool_call_id: 'call_123', content: 'Result' },
  { role: 'user', content: 'Next' }
]
```

---

## 📊 优化效果

### Token 消耗对比

假设每轮 500 tokens：

| 对话轮数 | 优化前 | 优化后 | 节省 |
|---------|--------|--------|------|
| 10 轮 | 5.5k | 5.5k | 0% |
| 50 轮 | 127.5k | 127.5k | 0% |
| 100 轮 | 505k | 505k | 0% |
| 200 轮 | 2.01M | 505k | **75%** |
| 500 轮 | 12.5M | 505k | **96%** |
| 1000 轮 | 50M | 505k | **99%** |

### 成本节省

以 Gemini 2.0 Flash 为例（$0.075 / 1M input tokens）：

| 对话轮数 | 优化前成本 | 优化后成本 | 节省金额 |
|---------|-----------|-----------|---------|
| 100 轮 | $0.038 | $0.038 | $0 |
| 500 轮 | $0.938 | $0.038 | **$0.90** |
| 1000 轮 | $3.75 | $0.038 | **$3.71** |

**重度用户（1000 轮对话）可节省 99% 成本！**

---

## 🧪 测试用例

### TC-TOKEN-001: 滑动窗口基本功能

```typescript
it('should limit history to 100 messages (sliding window)', () => {
    // 创建 150 条历史消息
    const history: Message[] = Array.from({ length: 150 }, (_, i) => ({
        id: `msg_${i}`,
        chatId: 'c1',
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        createdAt: new Date(),
    }));

    const result = buildApiMessages(history, '新消息', []);

    // 应该只保留最近 100 条历史 + 1 条当前消息 = 101 条
    expect(result).toHaveLength(101);
    // 第一条应该是第 50 条历史消息（150 - 100 = 50）
    expect(result[0].content).toBe('Message 50');
    // 最后一条是当前消息
    expect(result[100].content).toBe('新消息');
});
```

### TC-TOKEN-002: 工具调用完整性保证

```typescript
it('should preserve tool call integrity when windowing', () => {
    // 创建 110 条消息，最后几条包含工具调用
    const history: Message[] = [
        ...Array.from({ length: 108 }, (_, i) => ({ /* 普通消息 */ })),
        {
            id: 'msg_108',
            role: 'assistant',
            toolCalls: [{ id: 'call_important', ... }],
            toolResults: [{ callId: 'call_important', ... }],
        },
        { id: 'msg_109', role: 'user', content: 'Thanks' },
    ];

    const result = buildApiMessages(history, '继续', []);

    // 应该从包含 tool_calls 的 assistant 消息开始
    const firstAssistant = result.find(m => m.role === 'assistant' && m.tool_calls);
    expect(firstAssistant).toBeDefined();

    // 应该包含对应的 tool 结果
    const toolResult = result.find(m => m.role === 'tool');
    expect(toolResult).toBeDefined();
});
```

### TC-TOKEN-003: 工具续传空消息处理

```typescript
it('should handle empty current message in tool continuation', () => {
    const history: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
    ];

    // 工具续传时，currentContent 和 currentAttachments 都为空
    const result = buildApiMessages(history, '', []);

    // 应该只返回历史消息，不添加空的 user 消息
    expect(result).toHaveLength(1);
});
```

---

## 📝 配置说明

### 调整窗口大小

如需修改窗口大小，编辑 `src/utils/chatUtils.ts`：

```typescript
/**
 * 最大历史消息数量（滑动窗口大小）
 *
 * 建议值：
 * - 50 条：适合短对话场景，最大限度节省 token
 * - 100 条：默认值，平衡上下文和成本
 * - 200 条：适合需要长上下文的场景
 */
const MAX_HISTORY_MESSAGES = 100;  // 修改此值
```

### 窗口大小选择指南

| 窗口大小 | 适用场景 | Token 消耗（500 轮） | 上下文保留 |
|---------|---------|---------------------|-----------|
| 50 条 | 简单问答、代码生成 | 252.5k tokens | 最近 50 轮 |
| 100 条 | 通用场景（推荐） | 505k tokens | 最近 100 轮 |
| 200 条 | 复杂任务、长上下文 | 1.01M tokens | 最近 200 轮 |

---

## ⚠️ 注意事项

### 1. 上下文丢失

超过窗口大小的历史消息会被截断，AI 无法访问更早的对话内容。

**影响场景：**
- 用户引用很早之前的对话内容
- 需要完整对话历史的任务（如总结全部对话）

**解决方案：**
- 对于需要完整历史的场景，可临时增大窗口
- 使用消息摘要功能（未来版本）

### 2. 工具调用链

如果工具调用链很长（> 100 轮），早期的工具调用会被截断。

**影响：**
- 通常不影响，因为工具调用结果已经在后续消息中体现
- 极少数情况下可能需要重新执行工具

### 3. 后端截断

后端（Google/Kiro 协议）也有独立的截断机制：

- Google: 80 万字符（约 200k tokens）
- Kiro: 类似限制

**关系：**
- 前端滑动窗口是第一道防线（100 条消息）
- 后端截断是第二道防线（防止超过模型上下文窗口）

---

## 🔄 未来优化方向

### 1. 智能摘要

将旧消息压缩为摘要，保留关键信息：

```typescript
const messages = [
    { role: 'system', content: '前 50 轮对话摘要：用户询问了天气、新闻、股票...' },
    ...最近 20 条原始消息
];
```

**效果：**
- 摘要：500 tokens
- 最近 20 条：~10k tokens
- 总计：~10.5k tokens（比完整历史省 80%）

### 2. Gemini cachedContent API

Google 提供的上下文缓存功能：

```typescript
// 第 1 次：上传历史并缓存
const cache = await createCachedContent({
    model: 'gemini-2.0-flash',
    contents: first100Messages,  // 缓存前 100 条
    ttl: '3600s'
});

// 后续请求：只发送新消息 + 缓存 ID
await generateContent({
    cachedContent: cache.name,
    contents: [newMessage]  // 只发送新消息
});
```

**效果：**
- 缓存的消息按 1/10 价格计费
- 新消息正常计费
- 省 90% token 成本

### 3. 动态窗口大小

根据对话类型自动调整窗口：

```typescript
const windowSize = {
    'simple-qa': 50,      // 简单问答
    'code-gen': 100,      // 代码生成
    'complex-task': 200,  // 复杂任务
}[conversationType];
```

---

## 📚 相关文档

- [Chat 对话模块](./chat.md)
- [Google 协议优化](./google-protocol-optimization.md)
- [Kiro 消息截断](./kiro.md)

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-02-28 | 4.1.38 | - | 初始版本：添加滑动窗口机制，限制历史消息数量为 100 条 |
