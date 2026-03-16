# Roundtable Tool Call Fix / 圆桌会议工具调用修复方案

> [English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

### Version Info
- Version: v4.1.40
- Date: 2025-03-01
- Author: -

### Fix Status
🚧 In Progress (continuing to align tool continuation timing and context building with normal chat)

### Problem Summary

The current roundtable tool call implementation has the following issues:

#### 1. Tool calls update existing messages instead of creating independent messages
**Current behavior**:
- Tool call info is directly updated to the currently generating message (`messageId`)'s `toolCalls` and `toolResults` fields
- Multiple tool calls overwrite the same message

**Problem**:
- Users cannot see the history of multiple tool calls
- Inconsistent with normal chat behavior (normal chat creates independent messages for each tool call)

**Expected**:
- Each tool call should create an independent message
- Use temporary message `tool-live-${chatId}` to display execution status (blue card)
- Replace with persisted message (new UUID) after completion

#### 2. Agent multi-turn conversation replaces output instead of appending
**Current behavior**:
- Tool call loop uses the same `messageId`
- Each loop iteration updates the same message's `content`

**Problem**:
- Agent's replies get overwritten, users can only see the last output
- Cannot see Agent's thinking process based on tool results

**Expected**:
- Each tool call loop should create a new message
- Agent's replies should be appended to the conversation, not replaced

#### 3. Missing visual feedback during tool calls
**Current behavior**:
- No "executing" status display during tool calls
- Users don't know if the tool is executing

**Problem**:
- Poor user experience, users don't know what the system is doing
- Inconsistent with normal chat's blue tool call cards

**Expected**:
- Real-time display of tool call cards (blue status)
- Show executing/completed/error states
- Show tool name, parameters, execution time

#### 4. Speaker status interruption during tool calls
**Current behavior**:
- Listener is cleared after `done` event, but speaker status persists
- During 100ms wait in tool call loop, speaker status still persists

**Problem**:
- Actually this problem doesn't exist, current implementation is correct
- Speaker status persists throughout the entire `generateAgentResponse` function

**Expected**:
- Keep current implementation (no modification needed)

### Fix Plan

#### Plan Overview

Reference normal chat implementation (App.tsx:2632-2827), implement the same tool call logic for roundtable:

1. **Use temporary messages to display tool call status**
2. **Create persisted messages after tool execution completes**
3. **Create new Agent reply message for each tool call loop**
4. **Maintain speaker status until all tool calls complete**

#### Step 1: Modify tool call event handling (App.tsx:1439-1557)

**Current code issue**:
```typescript
// Update message's tool call info
if (toolCalls.length > 0) {
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    const messages = c.messages.map(m =>
      m.id === messageId  // ❌ Updates existing message
        ? { ...m, toolCalls: [...], toolResults: [...] }
        : m
    );
    return { ...c, messages };
  }));
}
```

**Fixed code**:
```typescript
// v4.1.40: Real-time display of tool call card (executing status)
const currentToolCallsSnapshot = [...toolCalls];
const currentToolResultsSnapshot = [...toolResults];
setRoundtableChats(prev => prev.map(c => {
  if (c.id !== chatId) return c;
  // Find or create live tool message
  const existingIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
  const liveMessage: RoundtableMessage = {
    id: `tool-live-${chatId}`,  // ✅ Use temporary ID
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

// ... Tool execution ...

// v4.1.40: Real-time update of tool message, showing completed results
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

// v4.1.40: Replace live tool message with persisted message (change ID)
if (toolCalls.length > 0) {
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;

    const toolMessage: RoundtableMessage = {
      id: crypto.randomUUID(),  // ✅ Use new UUID
      chatId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      participantId,
      round: currentRound,
      toolCalls: toolCalls.map((tc) => ({ ... })),
      toolResults: toolResults.map((tr) => ({ ... })),
    };

    // Replace live message with persisted message
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

#### Step 2: Modify tool call loop logic (App.tsx:1559-1687)

**Current code issue**:
```typescript
// v4.1.40: Check if current message contains tool calls
const currentMessage = roundtableChatsRef.current
  .find(c => c.id === chatId)
  ?.messages.find(m => m.id === messageId);  // ❌ Checks existing message

const hasToolCalls = currentMessage?.toolCalls && currentMessage.toolCalls.length > 0;
```

**Fixed code**:
```typescript
// v4.1.40: Check if there are tool call messages (independent tool messages)
const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
const hasToolCallMessage = latestChat?.messages.some(m =>
  m.participantId === participantId &&
  m.round === currentRound &&
  m.toolCalls &&
  m.toolCalls.length > 0 &&
  m.content === ''  // Tool message content is empty
);

if (hasToolCallMessage && toolCallRound < maxToolCallRounds) {
  pendingToolContinue = true;
  // ✅ Next loop will create new messageId
}
```

#### Step 3: Modify message creation logic (App.tsx:1277-1298)

**Current code issue**:
```typescript
// Generate message ID
const messageId = crypto.randomUUID();  // ❌ Only generated once at function start

// Create empty message first (for streaming updates)
const agentMessage: RoundtableMessage = {
  id: messageId,
  // ...
};
```

**Fixed code**:
```typescript
// v4.1.40: Tool call loop - generate new message ID for each iteration
do {
  pendingToolContinue = false;
  toolCallRound++;

  // ✅ Generate new message ID for each iteration
  const messageId = crypto.randomUUID();

  // Create empty message first (for streaming updates)
  const agentMessage: RoundtableMessage = {
    id: messageId,
    chatId,
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    participantId,
    round: currentRound,
  };

  // Add empty message to conversation
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: [...c.messages, agentMessage],  // ✅ Append message
      updatedAt: new Date(),
    };
  }));

  // ... Streaming output and tool calls ...

} while (pendingToolContinue && toolCallRound < maxToolCallRounds);
```

#### Step 4: Modify context building logic (utils.ts:202-228)

**Current code**:
```typescript
// v4.1.40: If message contains tool calls, add tool call info
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

**Fix suggestion**:
- Keep current implementation (already correct)
- Tool call messages (`content` is empty) will be filtered out and won't appear in context
- Only messages with actual content will be included

### v4.1.41 Supplementary Issues (2026-03-01)

| Test Case ID | Scenario | Precondition | Input | Expected Result |
|---|---|---|---|---|
| TC-RT-TOOL-006 | First speaking Agent tool continuation doesn't mix roles | Two or more participants, A speaks first and triggers tool_calls | User question triggers A to call tools then continue | A's follow-up replies always maintain A's role, doesn't impersonate other Agents |
| TC-RT-TOOL-007 | First round tool_calls display blue execution card | Any Agent's first streaming reply triggers tool_calls | Trigger tool call | `tool-live` blue execution status appears immediately, replaced with persisted tool message after completion |
| TC-RT-TOOL-008 | Second Agent tool call status visible | After A finishes speaking, B speaks and triggers tool_calls | B triggers tool call | B's tool calls also show blue execution status, without overwriting A's historical tool messages |

Fix key points:

1. Roundtable tool continuation requests add back current participant system context to avoid role drift.
2. Roundtable first round `tool_calls` branch changed to be consistent with normal chat: real-time `tool-live` blue card + persisted replacement after completion.

### v4.1.42 Supplementary Issues (2026-03-01)

| Test Case ID | Scenario | Precondition | Input | Expected Result |
|---|---|---|---|---|
| TC-RT-TOOL-009 | First round tool call no duplicate display | A triggers tool_calls in first message | Normal tool call | Only one set of tool call cards displayed, not duplicated in both first message and tool message |
| TC-RT-TOOL-010 | No thinking placeholder during tool call phase | Message `content` is empty but `toolCalls` exist | Any tool_calls trigger | Tool cards display normally, no "(Thinking...)" placeholder text |

Fix key points:

1. First round tool calls only keep independent tool messages (`tool-live` -> persisted), no longer write the same `toolCalls/toolResults` back to the first text message.
2. Roundtable message bubble in "only tool calls, no body text" scenario prioritizes showing tool cards, hides "(Thinking...)" placeholder text.

### Modified Files List

1. **src/App.tsx**
   - Modify `generateAgentResponse` function (lines 1200-1718)
   - Tool call event handling (lines 1439-1557)
   - Tool call loop logic (lines 1559-1687)
   - Message creation logic (lines 1277-1298)

2. **src/components/features/AgentOrchestration/utils.ts**
   - Keep current implementation (no modification needed)

### Expected Results

After fix, roundtable tool call behavior will be fully consistent with normal chat:

1. ✅ **Tool calls create independent messages**
   - Each tool call is an independent message
   - Use temporary ID `tool-live-${chatId}` to display execution status
   - Replace with persisted message (new UUID) after completion

2. ✅ **Agent multi-turn conversation appends output**
   - Each tool call loop creates a new message
   - Agent's replies are appended to the conversation
   - Users can see the complete thinking process

3. ✅ **Tool call process has visual feedback**
   - Real-time display of tool call cards (blue status)
   - Show executing/completed/error states
   - Show tool name, parameters, execution time

4. ✅ **Speaker status remains consistent**
   - Speaker status maintained throughout the entire tool call loop
   - Speaker status cleared only after all tool calls complete

### Risk Assessment

**High risk**:
- Message creation logic refactoring may affect existing functionality
- Need to carefully test message ID generation and management

**Medium risk**:
- Tool call loop state management needs to be handled correctly
- Temporary message to persisted message replacement logic needs to be accurate

**Low risk**:
- Context building logic is already correct, no modification needed
- Speaker status management is already correct, no modification needed

### Test Plan

1. **Basic tool call test**
   - Agent calls a single tool
   - Verify tool call message displays independently
   - Verify tool results display correctly

2. **Multi-turn tool call test**
   - Agent calls multiple tools
   - Verify each tool call is an independent message
   - Verify Agent replies are appended, not replaced

3. **Tool call loop test**
   - Agent calls tool then continues generating
   - Verify tool results are passed back to model
   - Verify loop count limit (max 20 rounds)

4. **Speaker status test**
   - Verify speaker status persists during tool calls
   - Verify speaker status clears after all tool calls complete
   - Verify next Agent can speak normally

5. **Visual feedback test**
   - Verify tool call card display (blue status)
   - Verify executing/completed/error states
   - Verify tool name, parameters, execution time display

### Rollback Plan

If issues arise after fix, rollback via:

```bash
# Rollback to pre-fix version
git checkout HEAD~1 src/App.tsx

# Or use git revert
git revert <commit-hash>
```

### Future Optimizations

1. **Performance optimization**
   - Reduce state update frequency
   - Use RAF batch updates (reference normal chat)

2. **User experience optimization**
   - Add tool call progress indicators
   - Optimize tool call card styling

3. **Error handling optimization**
   - Retry mechanism for failed tool calls
   - More user-friendly error messages

## v4.1.44 Root Cause Fix (2026-03-03)

### Problem Description

The v4.1.43 fix had two issues:

1. **First message starts with `--- [SYSTEM_PROMPT_END] ---`**
   - Fix approach: Filter out this marker during streaming output
   - Problem: Treats the symptom, not the root cause

2. **Message order confusion**
   - Symptom: First message shows "(Thinking...)", second one is the tool call
   - Fix approach: Delete empty message after tool call completes
   - Problem: Causes UI flickering, poor user experience

### Root Cause Analysis

**Issue 1: Root cause of `--- [SYSTEM_PROMPT_END] ---`**

In `utils.ts`'s `buildRoundtableContext` function, the system message ends with:
```
Please share your perspective as ${currentParticipant.role}.
请从「${currentParticipant.role}」的角度发表你的看法和观点。
```

Then in `App.tsx`, another user message is added:
```
Please respond to the user's message and share your perspective as ${participant.role}.
```

This caused duplicate instructions! Certain models (especially Gemini) output `--- [SYSTEM_PROMPT_END] ---` to mark the end of system prompt.

**Issue 2: Wrong message creation timing**

In `App.tsx`, the code creates an empty message before calling the API:
```typescript
// Create empty message first (for streaming updates)
const agentMessage: RoundtableMessage = {
  id: messageId,
  content: '', // Initially empty
  ...
};
setRoundtableChats(prev => ...); // Immediately add to conversation
```

This causes:
- If model directly calls tools (no text output), shows "Thinking..."
- Then creates tool message
- Finally deletes empty message (causes UI flickering)

### Fix Plan

**Fix 1: Remove duplicate instructions in system message**

In `utils.ts`'s `buildRoundtableContext` function, remove the trailing instruction:
```typescript
// Before fix
${previousMessages ? `## Previous Discussion / 之前的讨论内容\n${previousMessages}\n` : ''}
Please share your perspective as ${currentParticipant.role}.
请从「${currentParticipant.role}」的角度发表你的看法和观点。`;

// After fix
${previousMessages ? `## Previous Discussion / 之前的讨论内容\n${previousMessages}` : ''}`;
```

Keep instruction only in user message to avoid duplication.

**Fix 2: Deferred message creation**

Don't pre-create empty message, wait until first chunk or tool_calls received:

```typescript
// Before: Pre-create empty message
const agentMessage: RoundtableMessage = { ... };
setRoundtableChats(prev => ...);

// After: Deferred creation
let messageCreated = false;

// Create when first chunk received
if (payload.event === 'chunk' && payload.content) {
  if (!messageCreated) {
    const agentMessage: RoundtableMessage = { ... };
    setRoundtableChats(prev => ...);
    messageCreated = true;
  }
  // Update content...
}
```

This way:
- If model outputs text, create message when first chunk received
- If model directly calls tools, no empty message created, only tool message
- No need to delete empty messages, avoiding UI flickering

**Fix 3: Remove temporary fix code**

Remove v4.1.43 temporary fix code:
- Remove code filtering `--- [SYSTEM_PROMPT_END] ---`
- Remove code deleting empty messages

### Test Cases

| Test Case ID | Scenario | Precondition | Input | Expected Result |
|---|---|---|---|---|
| TC-RT-TOOL-012 | Model directly calls tool | Agent configured with tools, user question requires tool call | User: "Check the weather for me" | Only show tool call message, no "Thinking..." display |
| TC-RT-TOOL-013 | Model outputs text then calls tool | Agent configured with tools | User: "Analyze this problem" | Show text message first, then tool call message |
| TC-RT-TOOL-014 | No system markers appear | Using Gemini model | Any user input | Model output doesn't contain `--- [SYSTEM_PROMPT_END] ---` |

### Modified Files

- `src/components/features/AgentOrchestration/utils.ts` (lines 260-266)
- `src/App.tsx` (lines 1286-1305, 1407-1454, 1675-1679)

### Subsequently Discovered Issues (v4.1.44 Supplementary Fix)

**Issue 1: No error notification on frontend when API call fails**

Since v4.1.44 changed to deferred message creation (created only when first chunk received), if API call fails (e.g., OAuth token expired), the message hasn't been created yet when `error` event is received, causing error notifications to not display.

**Fix (Frontend)**:

Check if message has been created in error handling:
- If message not created, create an error message first
- If message already created, update message content to show error

Affected scope:
- Roundtable Agent reply (App.tsx lines 1755-1795)
- Normal chat (App.tsx lines 3140-3175)
- Roundtable summary (App.tsx lines 2626-2650)

**Issue 2: Rust backend API errors don't send error events**

Deeper issue: When Rust backend API calls fail (e.g., 401 Unauthorized), it only logs and returns `Err`, without sending `error` event to frontend via `chat-event`. This prevents frontend error handling logic from triggering.

**Fix (Backend)**:

In all streaming API functions, when API returns error status code, send `error` event to frontend first, then return `Err`:

```rust
// v4.1.44: Send error event to frontend
let msg_id = request.message_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
let _ = window.emit("chat-event", serde_json::json!({
    "id": msg_id,
    "event": "error",
    "error": format!("API Error {}: {}", status, err_text)
}));
```

Affected scope:
- `chat_stream_anthropic` (lib.rs lines 7302-7316)
- `chat_stream_google` (lib.rs lines 8463-8476)
- `chat_stream_kiro` (lib.rs lines 9242-9298)
- `chat_stream_codex_api` (lib.rs lines 9570-9583)
- `chat_stream_responses_api` (lib.rs lines 9751-9764)

Modified files:
- `src/App.tsx`
- `src-tauri/src/lib.rs`

## v4.1.45 Google API Tool Call Compatibility Fix (2026-03-03)

### Problem Description

Google API returns 400 error:
```
Please ensure that function response turn comes immediately after a function call turn.
```

**Root cause**:

Google API strictly requires function response to immediately follow function call, with no other messages in between.

However, in roundtable, multiple agents' messages may interleave, for example:
1. Agent A calls tool
2. Agent B speaks
3. Agent A's tool result

This order doesn't meet Google API requirements.

### Solution

Using **Plan 3: Differentiate handling based on provider**

Decide whether to send tool call history based on provider type:
- **Google**: Don't send tool call history, only send text messages (avoid message order issues)
- **Anthropic/OpenAI**: Send complete tool call history (preserve full context)

```typescript
// v4.1.45: Differentiate handling based on provider type
const includeToolCallHistory = model.provider !== 'Google' && model.provider !== 'google';

for (const msg of latestMessages) {
  if (msg.toolCalls && msg.toolCalls.length > 0) {
    if (includeToolCallHistory) {
      // Anthropic/OpenAI: Send complete tool call history
      apiMessages.push({ role: 'assistant', tool_calls: ... });
      apiMessages.push({ role: 'tool', content: ... });
    } else {
      // Google: Only send text content after tool call (if any)
      if (msg.content) {
        apiMessages.push({ role: 'assistant', content: msg.content });
      }
    }
  }
}
```

### Advantages

1. **Good compatibility**: Each provider uses the most suitable format
2. **Preserves context**: Anthropic/OpenAI retain complete tool call context
3. **Avoids errors**: Google avoids message order issues
4. **Easy to extend**: Can add special handling for other providers in the future

### Test Cases

| Test Case ID | Scenario | Precondition | Input | Expected Result |
|---|---|---|---|---|
| TC-RT-TOOL-015 | Google model roundtable | Using Google model, with tool call history | User question | No 400 error returned, normal response |
| TC-RT-TOOL-016 | Anthropic model roundtable | Using Anthropic model, with tool call history | User question | Complete tool call history sent, normal response |

### Modified Files

- `src/App.tsx` (lines 1325-1395)
- `src-tauri/src/lib.rs` (lines 8210-8224 - fix Google error message)

## v4.1.43 Supplementary Issues (2026-03-03)

| Test Case ID | Scenario | Precondition | Input | Expected Result |
|---|---|---|---|---|
| TC-RT-TOOL-011 | Newlines in tool parameters passed correctly | Agent calls tool requiring multi-line text parameter (e.g., Xiaohongshu MCP post) | Agent generates tool parameters with newlines | Tool receives parameters with correct newlines, published Xiaohongshu post formatting is correct |

**Root cause**:

Roundtable previously used a non-standard message format: embedding tool call results in system message text. This caused:
1. Model sees tool results containing literal newlines, may incorrectly handle newlines when generating new tool parameters
2. Inconsistent with normal chat's standard API format (normal chat uses `assistant` + `tool` messages)
3. After tool results are embedded in text, model cannot correctly understand tool call context

**Fix plan**:

Completely refactor roundtable's message building logic to use standard OpenAI/Anthropic API format:

1. **Remove text embedding of tool results** (`utils.ts`)
   - No longer embed tool call results in system messages
   - Filter out pure tool call messages (messages with empty content)
   - Only include messages with actual content in context

2. **Use standard API message format** (`App.tsx`)
   - `system` message: Contains role definition and discussion rules
   - History messages: Use standard `assistant`/`tool` format
     - Tool call: `assistant` message (with `tool_calls`)
     - Tool result: `tool` message (with `tool_call_id`)
   - `user` message: Triggers current participant to speak

3. **Consistent with normal chat**
   - Both now use exactly the same tool call format
   - Model can correctly understand tool call context
   - Avoids various issues caused by non-standard format

**Modified files**:
- `src/components/features/AgentOrchestration/utils.ts` (lines 202-221)
- `src/App.tsx` (lines 1345-1405)

## Summary

This fix aims to make roundtable tool call behavior fully consistent with normal chat, providing a better user experience. Main changes:

1. Tool calls create independent messages (instead of updating existing messages)
2. Agent multi-turn conversation appends output (instead of replacing)
3. Add visual feedback for tool call process
4. Fix newline display in tool results

After fix, users can clearly see Agent's complete thinking process, including tool calls and replies based on tool results.

---

<a id="中文"></a>

## 中文

### 版本信息
- 版本：v4.1.40
- 日期：2025-03-01
- 修改人：-

### 修复状态
🚧 修复中（继续对齐普通对话的工具续传时序与上下文构建）

### 问题总结

当前圆桌会议的工具调用实现存在以下问题：

#### 1. 工具调用更新到现有消息而不是创建独立消息
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

#### 2. Agent 多轮对话替换输出而不是追加
**现状**：
- 工具调用循环使用同一个 `messageId`
- 每次循环都会更新同一条消息的 `content`

**问题**：
- Agent 的回复被覆盖，用户只能看到最后一次的输出
- 无法看到 Agent 基于工具结果的思考过程

**期望**：
- 每次工具调用循环应该创建新的消息
- Agent 的回复应该追加到对话中，而不是替换

#### 3. 缺少工具调用过程的视觉反馈
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

#### 4. 工具调用期间发言者状态中断
**现状**：
- `done` 事件后清除监听器，但发言者状态保持
- 工具调用循环的 100ms 等待期间，发言者状态仍然保持

**问题**：
- 实际上这个问题不存在，当前实现是正确的
- 发言者状态在整个 `generateAgentResponse` 函数期间保持

**期望**：
- 保持当前实现（无需修改）

### 修复方案

#### 方案概述

参考普通对话的实现（App.tsx:2632-2827），为圆桌会议实现相同的工具调用逻辑：

1. **使用临时消息显示工具调用状态**
2. **工具执行完成后创建持久化消息**
3. **每次工具调用循环创建新的 Agent 回复消息**
4. **保持发言者状态直到所有工具调用完成**

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
| TC-RT-TOOL-010 | 工具调用阶段不显示思考中占位文案 | 消息 `content` 为空但存在 `toolCalls` | 任意 tool_calls 触发 | 工具卡片正常显示，不出现"(正在思考中...)"占位文案 |

修复要点：

1. 首轮工具调用仅保留独立工具消息（`tool-live` → 持久化），不再把同一次 `toolCalls/toolResults` 同步写回首条文本消息。
2. 圆桌消息气泡在"仅工具调用、无正文"场景优先展示工具卡片，隐藏"(正在思考中...)"占位文案。

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
