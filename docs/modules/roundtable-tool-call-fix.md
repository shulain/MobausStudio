# 圆桌会议工具调用修复方案

## 版本信息
- 版本：v4.1.40
- 日期：2025-03-01
- 修改人：-

## 修复状态
🚧 修复中（继续对齐普通对话的工具续传时序与上下文构建）

## 问题总结

当前圆桌会议的工具调用实现存在以下问题：

### 1. 工具调用更新到现有消息而不是创建独立消息
**现状**：
- 工具调用信息直接更新到当前正在生成的消息（`messageId`）的 `toolCalls` 和 `toolResults` 字段
- 多次工具调用会覆盖同一条消息

**问题**：
- 用户无法看到多次工具调用的历史记录
- 与普通对话的行为不一致（普通对话每次工具调用都是独立的消息）

**期望**：
- 每次工具调用应该创建一个独立的消息
- 使用临时消息 `tool-live-${chatId}` 显示执行状态（蓝色卡片）
- 完成后替换为持久化消息（新 UUID）

### 2. Agent 多轮对话替换输出而不是追加
**现状**：
- 工具调用循环使用同一个 `messageId`
- 每次循环都会更新同一条消息的 `content`

**问题**：
- Agent 的回复被覆盖，用户只能看到最后一次的输出
- 无法看到 Agent 基于工具结果的思考过程

**期望**：
- 每次工具调用循环应该创建新的消息
- Agent 的回复应该追加到对话中，而不是替换

### 3. 缺少工具调用过程的视觉反馈
**现状**：
- 工具调用时没有"正在执行"的状态显示
- 用户不知道工具是否正在执行

**问题**：
- 用户体验差，不知道系统在做什么
- 与普通对话的蓝色工具调用卡片不一致

**期望**：
- 实时显示工具调用卡片（蓝色状态）
- 显示执行中/已完成/错误状态
- 显示工具名称、参数、执行时间

### 4. 工具调用期间发言者状态中断
**现状**：
- `done` 事件后清除监听器，但发言者状态保持
- 工具调用循环的 100ms 等待期间，发言者状态仍然保持

**问题**：
- 实际上这个问题不存在，当前实现是正确的
- 发言者状态在整个 `generateAgentResponse` 函数期间保持

**期望**：
- 保持当前实现（无需修改）

## 修复方案

### 方案概述

参考普通对话的实现（App.tsx:2632-2827），为圆桌会议实现相同的工具调用逻辑：

1. **使用临时消息显示工具调用状态**
2. **工具执行完成后创建持久化消息**
3. **每次工具调用循环创建新的 Agent 回复消息**
4. **保持发言者状态直到所有工具调用完成**

### 详细修改步骤

#### 步骤 1：修改工具调用事件处理（App.tsx:1439-1557）

**当前代码问题**：
```typescript
// 更新消息的工具调用信息
if (toolCalls.length > 0) {
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    const messages = c.messages.map(m =>
      m.id === messageId  // ❌ 更新现有消息
        ? { ...m, toolCalls: [...], toolResults: [...] }
        : m
    );
    return { ...c, messages };
  }));
}
```

**修复后代码**：
```typescript
// v4.1.40: 实时展示工具调用卡片（executing 状态）
const currentToolCallsSnapshot = [...toolCalls];
const currentToolResultsSnapshot = [...toolResults];
setRoundtableChats(prev => prev.map(c => {
  if (c.id !== chatId) return c;
  // 查找或创建实时工具消息
  const existingIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
  const liveMessage: RoundtableMessage = {
    id: `tool-live-${chatId}`,  // ✅ 使用临时 ID
    chatId,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    participantId,
    round: currentRound,
    toolCalls: currentToolCallsSnapshot,
    toolResults: currentToolResultsSnapshot,
  };
  if (existingIdx >= 0) {
    const newMessages = [...c.messages];
    newMessages[existingIdx] = liveMessage;
    return { ...c, messages: newMessages };
  }
  return { ...c, messages: [...c.messages, liveMessage] };
}));

// ... 工具执行 ...

// v4.1.40: 实时更新工具消息，展示已完成的结果
setRoundtableChats(prev => prev.map(c => {
  if (c.id !== chatId) return c;
  const idx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
  if (idx < 0) return c;
  const newMessages = [...c.messages];
  newMessages[idx] = {
    ...newMessages[idx],
    toolCalls: [...toolCalls],
    toolResults: [...toolResults],
  };
  return { ...c, messages: newMessages };
}));

// v4.1.40: 将实时工具消息替换为持久化消息（更换 ID）
if (toolCalls.length > 0) {
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;

    const toolMessage: RoundtableMessage = {
      id: crypto.randomUUID(),  // ✅ 使用新 UUID
      chatId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      participantId,
      round: currentRound,
      toolCalls: toolCalls.map((tc) => ({ ... })),
      toolResults: toolResults.map((tr) => ({ ... })),
    };

    // 替换实时消息为持久化消息
    const liveIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
    if (liveIdx >= 0) {
      const newMessages = [...c.messages];
      newMessages[liveIdx] = toolMessage;
      return { ...c, messages: newMessages };
    }
    return { ...c, messages: [...c.messages, toolMessage] };
  }));
}
```

#### 步骤 2：修改工具调用循环逻辑（App.tsx:1559-1687）

**当前代码问题**：
```typescript
// v4.1.40: 检查当前消息是否包含工具调用
const currentMessage = roundtableChatsRef.current
  .find(c => c.id === chatId)
  ?.messages.find(m => m.id === messageId);  // ❌ 检查现有消息

const hasToolCalls = currentMessage?.toolCalls && currentMessage.toolCalls.length > 0;
```

**修复后代码**：
```typescript
// v4.1.40: 检查是否有工具调用消息（独立的工具消息）
const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
const hasToolCallMessage = latestChat?.messages.some(m =>
  m.participantId === participantId &&
  m.round === currentRound &&
  m.toolCalls &&
  m.toolCalls.length > 0 &&
  m.content === ''  // 工具消息的 content 为空
);

if (hasToolCallMessage && toolCallRound < maxToolCallRounds) {
  pendingToolContinue = true;
  // ✅ 下次循环会创建新的 messageId
}
```

#### 步骤 3：修改消息创建逻辑（App.tsx:1277-1298）

**当前代码问题**：
```typescript
// 生成消息 ID
const messageId = crypto.randomUUID();  // ❌ 只在函数开始时生成一次

// 先创建一个空消息（用于流式更新）
const agentMessage: RoundtableMessage = {
  id: messageId,
  // ...
};
```

**修复后代码**：
```typescript
// v4.1.40: 工具调用循环 - 每次循环生成新的消息 ID
do {
  pendingToolContinue = false;
  toolCallRound++;

  // ✅ 每次循环生成新的消息 ID
  const messageId = crypto.randomUUID();

  // 先创建一个空消息（用于流式更新）
  const agentMessage: RoundtableMessage = {
    id: messageId,
    chatId,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    participantId,
    round: currentRound,
  };

  // 添加空消息到对话
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: [...c.messages, agentMessage],  // ✅ 追加消息
      updatedAt: new Date(),
    };
  }));

  // ... 流式输出和工具调用 ...

} while (pendingToolContinue && toolCallRound < maxToolCallRounds);
```

#### 步骤 4：修改上下文构建逻辑（utils.ts:202-228）

**当前代码**：
```typescript
// v4.1.40: 如果消息包含工具调用，添加工具调用信息
let toolCallsInfo = '';
if (msg.toolCalls && msg.toolCalls.length > 0) {
  const toolCallsText = msg.toolCalls.map((tc, idx) => {
    const result = msg.toolResults?.find(tr => tr.callId === tc.id);
    const resultText = result
      ? `\n  Result / 结果: ${result.isError ? '❌ Error / 错误: ' : '✅ '}${result.content}`
      : '';
    return `  ${idx + 1}. Tool / 工具: ${tc.name}\n  Arguments / 参数: ${tc.arguments}${resultText}`;
  }).join('\n');
  toolCallsInfo = `\n  [Tool Calls / 工具调用]:\n${toolCallsText}\n`;
}

return `【${participant.avatar} ${participant.role}】：${msg.content}${toolCallsInfo}`;
```

**修复建议**：
- 保持当前实现（已经正确）
- 工具调用消息（`content` 为空）会被过滤掉，不会出现在上下文中
- 只有包含实际内容的消息才会被包含

### v4.1.41 补充问题（2026-03-01）

| 用例ID | 场景 | 前置条件 | 输入 | 预期结果 |
| -------- | ------ | ---------- | ------ | ---------- |
| TC-RT-TOOL-006 | 首个发言 Agent 工具续传不串角色 | 两个以上参与者，A 先发言并触发 tool_calls | 用户提问触发 A 调工具再续传 | A 的后续回复始终保持 A 角色，不自称其他 Agent |
| TC-RT-TOOL-007 | 首轮 tool_calls 显示蓝色执行卡片 | 任一 Agent 首次流式回复触发 tool_calls | 触发工具调用 | 立即出现 `tool-live` 蓝色执行状态，完成后替换为持久化工具消息 |
| TC-RT-TOOL-008 | 第二个 Agent 工具调用状态可见 | A 发言结束后 B 发言并触发 tool_calls | B 触发工具调用 | B 的工具调用同样出现蓝色执行状态，且不覆盖 A 的历史工具消息 |

修复要点：

1. 圆桌工具续传请求补回当前参与者 system 上下文，避免角色漂移。
2. 圆桌首轮 `tool_calls` 分支改为与普通对话一致：实时 `tool-live` 蓝色卡片 + 完成后持久化替换。

### v4.1.42 补充问题（2026-03-01）

| 用例ID | 场景 | 前置条件 | 输入 | 预期结果 |
| -------- | ------ | ---------- | ------ | ---------- |
| TC-RT-TOOL-009 | 首轮工具调用不重复展示 | A 在首条消息触发 tool_calls | 正常工具调用 | 仅展示一组工具调用卡片，不在首条消息和工具消息中重复显示同一次调用 |
| TC-RT-TOOL-010 | 工具调用阶段不显示思考中占位文案 | 消息 `content` 为空但存在 `toolCalls` | 任意 tool_calls 触发 | 工具卡片正常显示，不出现“(正在思考中...)”占位文案 |

修复要点：

1. 首轮工具调用仅保留独立工具消息（`tool-live` → 持久化），不再把同一次 `toolCalls/toolResults` 同步写回首条文本消息。
2. 圆桌消息气泡在“仅工具调用、无正文”场景优先展示工具卡片，隐藏“(正在思考中...)”占位文案。

### 修改文件清单

1. **src/App.tsx**
   - 修改 `generateAgentResponse` 函数（1200-1718行）
   - 工具调用事件处理（1439-1557行）
   - 工具调用循环逻辑（1559-1687行）
   - 消息创建逻辑（1277-1298行）

2. **src/components/features/AgentOrchestration/utils.ts**
   - 保持当前实现（无需修改）

### 预期效果

修复后，圆桌会议的工具调用行为将与普通对话完全一致：

1. ✅ **工具调用创建独立消息**
   - 每次工具调用都是一个独立的消息
   - 使用临时 ID `tool-live-${chatId}` 显示执行状态
   - 完成后替换为持久化消息（新 UUID）

2. ✅ **Agent 多轮对话追加输出**
   - 每次工具调用循环创建新的消息
   - Agent 的回复追加到对话中
   - 用户可以看到完整的思考过程

3. ✅ **工具调用过程有视觉反馈**
   - 实时显示工具调用卡片（蓝色状态）
   - 显示执行中/已完成/错误状态
   - 显示工具名称、参数、执行时间

4. ✅ **发言者状态保持一致**
   - 整个工具调用循环期间保持发言者状态
   - 所有工具调用完成后才清除发言者状态

### 风险评估

**高风险**：
- 消息创建逻辑的重构可能影响现有功能
- 需要仔细测试消息 ID 的生成和管理

**中风险**：
- 工具调用循环的状态管理需要正确处理
- 临时消息和持久化消息的替换逻辑需要准确

**低风险**：
- 上下文构建逻辑已经正确，无需修改
- 发言者状态管理已经正确，无需修改

### 测试计划

1. **基本工具调用测试**
   - Agent 调用单个工具
   - 验证工具调用消息独立显示
   - 验证工具结果正确显示

2. **多轮工具调用测试**
   - Agent 调用多个工具
   - 验证每次工具调用都是独立消息
   - 验证 Agent 回复追加而不是替换

3. **工具调用循环测试**
   - Agent 调用工具后继续生成
   - 验证工具结果回传给模型
   - 验证循环次数限制（最多 20 轮）

4. **发言者状态测试**
   - 验证工具调用期间发言者状态保持
   - 验证所有工具调用完成后发言者状态清除
   - 验证下一个 Agent 可以正常发言

5. **视觉反馈测试**
   - 验证工具调用卡片显示（蓝色状态）
   - 验证执行中/已完成/错误状态
   - 验证工具名称、参数、执行时间显示

### 回滚方案

如果修复后出现问题，可以通过以下方式回滚：

```bash
# 回滚到修复前的版本
git checkout HEAD~1 src/App.tsx

# 或者使用 git revert
git revert <commit-hash>
```

### 后续优化

1. **性能优化**
   - 减少状态更新次数
   - 使用 RAF 批量更新（参考普通对话）

2. **用户体验优化**
   - 添加工具调用进度提示
   - 优化工具调用卡片样式

3. **错误处理优化**
   - 工具调用失败时的重试机制
   - 更友好的错误提示

## v4.1.44 根因修复（2026-03-03）

### 问题描述

v4.1.43 的修复方案存在两个问题：

1. **第一条消息开头出现 `--- [SYSTEM_PROMPT_END] ---`**
   - 修复方案：在流式输出时过滤掉这个标记
   - 问题：治标不治本，没有找出标记出现的根因

2. **消息顺序混乱**
   - 现象：第一条消息显示"(正在思考中...)"，第二条才是工具调用
   - 修复方案：在工具调用完成后删除空消息
   - 问题：会造成 UI 闪烁，用户体验不好

### 根因分析

**问题1：`--- [SYSTEM_PROMPT_END] ---` 的根因**

在 `utils.ts` 的 `buildRoundtableContext` 函数中，system 消息的末尾包含：
```
Please share your perspective as ${currentParticipant.role}.
请从「${currentParticipant.role}」的角度发表你的看法和观点。
```

然后在 `App.tsx` 中又添加了一个 user 消息：
```
Please respond to the user's message and share your perspective as ${participant.role}.
```

这导致了重复的指令！某些模型（特别是 Gemini）会输出 `--- [SYSTEM_PROMPT_END] ---` 来标记系统提示的结束。

**问题2：消息构建时机不对**

在 `App.tsx` 中，代码在调用 API 之前就创建了空消息：
```typescript
// 先创建一个空消息（用于流式更新）
const agentMessage: RoundtableMessage = {
  id: messageId,
  content: '', // 初始为空
  ...
};
setRoundtableChats(prev => ...); // 立即添加到对话
```

这导致：
- 如果模型直接调用工具（没有文本输出），会显示"正在思考中..."
- 然后创建工具消息
- 最后删除空消息（造成UI闪烁）

### 修复方案

**修复1：移除 system 消息中的重复指令**

在 `utils.ts` 的 `buildRoundtableContext` 函数中，移除末尾的指令：
```typescript
// 修改前
${previousMessages ? `## Previous Discussion / 之前的讨论内容\n${previousMessages}\n` : ''}
Please share your perspective as ${currentParticipant.role}.
请从「${currentParticipant.role}」的角度发表你的看法和观点。`;

// 修改后
${previousMessages ? `## Previous Discussion / 之前的讨论内容\n${previousMessages}` : ''}`;
```

只在 user 消息中保留指令，避免重复。

**修复2：延迟消息创建**

不要预先创建空消息，等收到第一个 chunk 或 tool_calls 时再创建：

```typescript
// 修改前：预先创建空消息
const agentMessage: RoundtableMessage = { ... };
setRoundtableChats(prev => ...);

// 修改后：延迟创建
let messageCreated = false;

// 在收到第一个 chunk 时创建
if (payload.event === 'chunk' && payload.content) {
  if (!messageCreated) {
    const agentMessage: RoundtableMessage = { ... };
    setRoundtableChats(prev => ...);
    messageCreated = true;
  }
  // 更新内容...
}
```

这样：
- 如果模型输出文本，收到第一个 chunk 时创建消息
- 如果模型直接调用工具，不会创建空消息，只创建工具消息
- 不需要删除空消息，避免 UI 闪烁

**修复3：移除临时修复代码**

移除 v4.1.43 中的临时修复代码：
- 移除过滤 `--- [SYSTEM_PROMPT_END] ---` 的代码
- 移除删除空消息的代码

### 测试用例

| 用例ID | 场景 | 前置条件 | 输入 | 预期结果 |
| -------- | ------ | ---------- | ------ | ---------- |
| TC-RT-TOOL-012 | 模型直接调用工具 | Agent 配置了工具，用户提问需要调用工具 | 用户："帮我查一下天气" | 只显示工具调用消息，不显示"正在思考中..." |
| TC-RT-TOOL-013 | 模型先输出文本再调用工具 | Agent 配置了工具 | 用户："分析一下这个问题" | 先显示文本消息，然后显示工具调用消息 |
| TC-RT-TOOL-014 | 不出现系统标记 | 使用 Gemini 模型 | 任意用户输入 | 模型输出不包含 `--- [SYSTEM_PROMPT_END] ---` |

### 修改文件

- `src/components/features/AgentOrchestration/utils.ts` (第260-266行)
- `src/App.tsx` (第1286-1305行, 第1407-1454行, 第1675-1679行)

### 后续发现的问题（v4.1.44 补充修复）

**问题1：API 调用失败时前端没有错误提示**

由于 v4.1.44 改为延迟创建消息（收到第一个 chunk 时才创建），如果 API 调用失败（如 OAuth token 过期），在收到 `error` 事件时消息还没有被创建，导致错误提示无法显示。

**修复方案（前端）**：

在错误处理中检查消息是否已创建：
- 如果消息未创建，先创建一个错误消息
- 如果消息已创建，更新消息内容显示错误

影响范围：
- 圆桌会议 Agent 回复 (App.tsx 第1755-1795行)
- 普通对话 (App.tsx 第3140-3175行)
- 圆桌会议总结 (App.tsx 第2626-2650行)

**问题2：Rust 后端 API 错误没有发送 error 事件**

更深层的问题：Rust 后端在 API 调用失败时（如 401 Unauthorized），只是记录日志并返回 `Err`，没有通过 `chat-event` 发送 `error` 事件到前端。这导致前端的错误处理逻辑无法触发。

**修复方案（后端）**：

在所有流式 API 函数中，当 API 返回错误状态码时，先发送 `error` 事件到前端，然后再返回 `Err`：

```rust
// v4.1.44: 发送 error 事件到前端
let msg_id = request.message_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
let _ = window.emit("chat-event", serde_json::json!({
    "id": msg_id,
    "event": "error",
    "error": format!("API Error {}: {}", status, err_text)
}));
```

影响范围：
- `chat_stream_anthropic` (lib.rs 第7302-7316行)
- `chat_stream_google` (lib.rs 第8463-8476行)
- `chat_stream_kiro` (lib.rs 第9242-9298行)
- `chat_stream_codex_api` (lib.rs 第9570-9583行)
- `chat_stream_responses_api` (lib.rs 第9751-9764行)

修改文件：
- `src/App.tsx`
- `src-tauri/src/lib.rs`

## v4.1.45 Google API 工具调用兼容性修复（2026-03-03）

### 问题描述

Google API 返回 400 错误：
```
Please ensure that function response turn comes immediately after a function call turn.
```

**问题根源**：

Google API 对消息顺序有严格要求：function response 必须紧跟在 function call 之后，不能有其他消息插在中间。

但是在圆桌会议中，多个 agent 的消息可能交替出现，例如：
1. Agent A 调用工具
2. Agent B 发言
3. Agent A 的工具结果

这样的顺序不符合 Google API 的要求。

### 解决方案

采用**方案3：根据 provider 区分处理**

根据 provider 类型决定是否发送工具调用历史：
- **Google**: 不发送工具调用历史，只发送文本消息（避免消息顺序问题）
- **Anthropic/OpenAI**: 发送完整的工具调用历史（保留完整上下文）

```typescript
// v4.1.45: 根据 provider 类型区分处理
const includeToolCallHistory = model.provider !== 'Google' && model.provider !== 'google';

for (const msg of latestMessages) {
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    if (includeToolCallHistory) {
      // Anthropic/OpenAI: 发送完整的工具调用历史
      apiMessages.push({ role: 'assistant', tool_calls: ... });
      apiMessages.push({ role: 'tool', content: ... });
    } else {
      // Google: 只发送工具调用后的文本内容（如果有）
      if (msg.content) {
        apiMessages.push({ role: 'assistant', content: msg.content });
      }
    }
  }
}
```

### 优点

1. **兼容性好**：每个 provider 使用最适合的格式
2. **保留上下文**：Anthropic/OpenAI 保留完整的工具调用上下文
3. **避免错误**：Google 避免消息顺序问题
4. **易于扩展**：未来可以为其他 provider 添加特殊处理

### 测试用例

| 用例ID | 场景 | 前置条件 | 输入 | 预期结果 |
| -------- | ------ | ---------- | ------ | ---------- |
| TC-RT-TOOL-015 | Google 模型圆桌会议 | 使用 Google 模型，有工具调用历史 | 用户提问 | 不返回 400 错误，正常回复 |
| TC-RT-TOOL-016 | Anthropic 模型圆桌会议 | 使用 Anthropic 模型，有工具调用历史 | 用户提问 | 发送完整工具调用历史，正常回复 |

### 修改文件

- `src/App.tsx` (第1325-1395行)
- `src-tauri/src/lib.rs` (第8210-8224行 - 修复 Google 错误提示)

## v4.1.43 补充问题（2026-03-03）

| 用例ID | 场景 | 前置条件 | 输入 | 预期结果 |
| -------- | ------ | ---------- | ------ | ---------- |
| TC-RT-TOOL-011 | 工具参数中的换行符正确传递 | Agent 调用需要多行文本参数的工具（如小红书MCP发笔记） | Agent 生成包含换行的工具参数 | 工具接收到的参数中换行符正确，发布到小红书的笔记排版正常 |

**问题根源**：

圆桌会议之前使用了非标准的消息格式：将工具调用结果嵌入到 system 消息的文本中。这导致：
1. 模型看到的工具结果包含真实换行符，可能在生成新的工具参数时错误地处理换行符
2. 与普通对话的标准 API 格式不一致（普通对话使用 `assistant` + `tool` 消息）
3. 工具结果被嵌入文本后，模型无法正确理解工具调用的上下文

**修复方案**：

彻底重构圆桌会议的消息构建逻辑，改为使用标准的 OpenAI/Anthropic API 格式：

1. **移除工具结果的文本嵌入**（`utils.ts`）
   - 不再将工具调用结果嵌入到 system 消息中
   - 过滤掉纯工具调用消息（content 为空的消息）
   - 只在上下文中包含有实际内容的消息

2. **使用标准 API 消息格式**（`App.tsx`）
   - `system` 消息：包含角色定义和讨论规则
   - 历史消息：使用标准的 `assistant`/`tool` 格式
     - 工具调用：`assistant` 消息（带 `tool_calls`）
     - 工具结果：`tool` 消息（带 `tool_call_id`）
   - `user` 消息：触发当前参与者发言

3. **与普通对话保持一致**
   - 两者现在使用完全相同的工具调用格式
   - 模型能正确理解工具调用的上下文
   - 避免因非标准格式导致的各种问题

**修改文件**：
- `src/components/features/AgentOrchestration/utils.ts` (第202-221行)
- `src/App.tsx` (第1345-1405行)

## 总结

本修复方案旨在让圆桌会议的工具调用行为与普通对话完全一致，提供更好的用户体验。主要修改点是：

1. 工具调用创建独立消息（而不是更新现有消息）
2. Agent 多轮对话追加输出（而不是替换）
3. 添加工具调用过程的视觉反馈
4. 修复工具结果中换行符的显示问题

修复后，用户可以清楚地看到 Agent 的完整思考过程，包括工具调用和基于工具结果的回复。
