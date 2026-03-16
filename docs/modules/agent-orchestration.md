# Agent Orchestration Module / Agent 编排模块

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Module Overview

The Agent Orchestration module provides multi-Agent collaborative interaction capabilities, supporting multiple orchestration modes: side-by-side comparison, roundtable discussion, review & correction, workflow pipeline, and debate mode.

| Property | Value |
|----------|-------|
| Module Path | `src/components/features/AgentOrchestration` |
| Type Definitions | `src/types/index.ts` |
| Storage Service | `src/services/storage.ts` |
| Test Files | `src/test/components/AgentOrchestration/` |
| Created Date | 2025-01-30 |
| Last Updated | 2025-02-01 |
| Current Version | v4.1.13 |

---

## Feature List

### Orchestration Modes

- [x] **Roundtable Discussion Mode (Roundtable)** - Multiple Agent roles take turns speaking, cross-referencing each other's points ✅ Implemented
- [ ] **Side-by-side Comparison Mode (Compare)** - Send the same question to multiple models/Agents, display answers side by side
- [ ] **Review & Correction Mode (Review)** - One Agent generates, another Agent reviews and corrects
- [ ] **Workflow Pipeline Mode (Pipeline)** - Multiple Agents process sequentially, upstream output becomes downstream input
- [ ] **Debate Mode (Debate)** - Pro and con Agents debate around a topic for multiple rounds

### General Features

- [x] Select mode when creating orchestration chat ✅ OrchestrationModeSelector
- [x] Orchestration chat persistence ✅ save/load_roundtable_chats
- [ ] Orchestration result export
- [ ] Orchestration template save and reuse

---

## Component Structure

```
AgentOrchestration/
├── index.tsx                      # Module entry, exports all components and utility functions
├── OrchestrationModeSelector.tsx  # Mode selector dialog
├── RoundtableView.tsx             # Roundtable discussion main view
├── RoundtableSetupModal.tsx       # Roundtable discussion setup dialog
├── RoundtableMessageBubble.tsx    # Roundtable message bubble component
└── utils.ts                       # Utility functions (create, validate, context building, etc.)
```

---

## Data Structures

### OrchestrationMode Enum

```typescript
type OrchestrationMode = 'single' | 'compare' | 'roundtable' | 'review' | 'pipeline' | 'debate';
```

### RoundtableChat (extends Chat)

```typescript
interface RoundtableChat extends Chat {
  mode: 'roundtable';

  roundtableConfig: {
    topic: string;                          // Discussion topic
    background?: string;                    // v4.1.13: Content background/context (optional)
    constraints?: string;                   // v4.1.13: Discussion constraints/boundaries (optional)
    participants: RoundtableParticipant[];  // Participant list
    rules: RoundtableRules;                 // Discussion rules
    currentRound: number;                   // Current round
    status: 'setup' | 'discussing' | 'summarizing' | 'completed';
  };
}
```

**Field Descriptions:**

- `background` (optional): Provides background information for the discussion, helping Agents understand the premises and context
- `constraints` (optional): Limits the scope of discussion, preventing Agents from going off-topic or giving impractical suggestions

**Usage Examples:**

```typescript
// Simple scenario: only set topic, guide discussion through speaking
{ topic: 'How to improve user experience?' }

// Complex scenario: preset background and constraints for more focused discussion
{
  topic: 'How to optimize user registration flow?',
  background: 'We are a B2B SaaS product, current registration conversion rate is 15%, target users are enterprise IT administrators',
  constraints: 'Budget not exceeding 50,000 RMB, must be completed within 2 weeks, no full architecture refactoring'
}
```

### RoundtableParticipant

```typescript
interface RoundtableParticipant {
  id: string;                   // Participant ID (unique identifier)
  agentId: string;              // Associated Agent ID
  role: string;                 // Role description (e.g., "Architect", "Product Manager")
  speakOrder: number;           // Speaking order (1-based)
  avatar?: string;              // Avatar emoji (v4.1.9 smart matching)
  color?: string;               // Theme color (for UI differentiation)
  messageCount: number;         // Number of messages sent
  lastSpokeAt?: Date;           // Last speaking time
}
```

### RoundtableRules

```typescript
interface RoundtableRules {
  maxRounds: number;                        // Maximum discussion rounds (1-10 or 999 for unlimited)
  speakMode: 'sequential' | 'free';         // Speaking mode (v4.1.10 removed parallel)
  // sequential: take turns speaking in order
  // free: user @mentions specific Agent to speak

  autoSummarize: boolean;                   // Auto-summarize after discussion ends
  allowCrossReference: boolean;             // Allow cross-referencing (affects context building)
  summarizerAgentId?: string;               // Summarizer Agent ID

  // Advanced options
  turnTimeLimit?: number;                   // Time limit per turn (seconds)
  requireResponse?: boolean;                // Whether all participants must respond
}
```

### RoundtableMessage (extends Message)

```typescript
interface RoundtableMessage extends Message {
  // Roundtable-specific fields
  participantId: string;                    // Speaking participant ID
  round: number;                            // Round number
  isSummary?: boolean;                      // Whether this is a summary message

  // Reference relationships
  replyToMessageId?: string;                // Reply to which message
  mentionedParticipantIds?: string[];       // @mentioned participants

  // Quoted content (for UI highlighting)
  quotedContent?: {
    messageId: string;
    participantId: string;
    excerpt: string;                        // Quoted excerpt
  }[];

  // v3.5.0: Thinking process (extended thinking models)
  reasoningContent?: string;

  // v3.5.0: MCP tool calls (inherited from Message)
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}
```

### RoundtableCreateInput

```typescript
interface RoundtableCreateInput {
  topic: string;                            // Discussion topic (required)
  background?: string;                      // v4.1.13: Content background/context (optional)
  constraints?: string;                     // v4.1.13: Discussion constraints/boundaries (optional)
  participants: {
    agentId: string;
    role: string;
    avatar?: string;
    color?: string;
  }[];
  rules?: Partial<RoundtableRules>;         // Optional rules configuration
}
```

---

## Utility Function API

### createRoundtableChat

Create a roundtable discussion chat.

```typescript
function createRoundtableChat(
  input: RoundtableCreateInput,
  agents: Agent[]
): RoundtableChat
```

**Parameters:**
- `input` - Creation input parameters
- `agents` - Available Agent list (for validation)

**Returns:** The created roundtable chat object

**Exceptions:** Throws error if validation fails

**Example:**
```typescript
const chat = createRoundtableChat({
  topic: 'How to design a high-concurrency system?',
  participants: [
    { agentId: 'agent-1', role: 'Architect' },
    { agentId: 'agent-2', role: 'Backend Expert' },
  ],
  rules: { maxRounds: 5 },
}, agents);
```

### buildRoundtableContext

Build system prompt for a specified participant.

```typescript
function buildRoundtableContext(
  config: RoundtableConfig,
  participantId: string,
  messages: RoundtableMessage[],
  agents: Agent[]
): string
```

**Parameters:**
- `config` - Roundtable configuration
- `participantId` - Current speaking participant ID
- `messages` - Previous message list
- `agents` - Agent list (for retrieving Agent names and system prompts)

**Returns:** The constructed system prompt

**Features (v4.1.9):** Includes Agent's original system prompt, ensuring the Agent maintains its professional capabilities

### buildSummaryContext

Build system prompt for the summarizer.

```typescript
function buildSummaryContext(
  config: RoundtableConfig,
  messages: RoundtableMessage[],
  agents: Agent[]
): string
```

### parseMentions

Parse @mentions in messages.

```typescript
function parseMentions(
  content: string,
  participants: RoundtableParticipant[],
  agents: Agent[]
): string[]
```

**Supported Formats:**
- `@RoleName` (e.g., `@Architect`)
- `@AgentName` (e.g., `@Claude`)

**Returns:** List of mentioned participant IDs

### validateRoundtableConfig

Validate roundtable discussion configuration.

```typescript
function validateRoundtableConfig(
  input: RoundtableCreateInput,
  agents: Agent[]
): string | null
```

**Returns:** Error message, or `null` if validation passes

### canContinueDiscussion

Check whether the discussion can continue.

```typescript
function canContinueDiscussion(config: RoundtableConfig): boolean
```

**Features (v4.1.6):** Supports unlimited rounds mode (maxRounds = 999)

### getNextSpeaker

Get the next speaker.

```typescript
function getNextSpeaker(
  config: RoundtableConfig,
  lastSpeakerId?: string
): string | null
```

**Returns:** Next speaker ID, or `null` if none

---

## Component API

### RoundtableView

Roundtable discussion main view component.

```typescript
interface RoundtableViewProps {
  chat: RoundtableChat;                                    // Roundtable chat data
  agents: Agent[];                                         // Available Agent list
  onSendMessage?: (content: string, targetParticipantIds?: string[]) => void;
  onStartDiscussion?: (chatId: string, userQuestion: string) => Promise<void>;
  onSummarize?: (chatId: string) => Promise<void>;
  onNextRound?: (chatId: string) => void;
  onStopGenerating?: () => void;
  isGenerating?: boolean;
  currentSpeakerId?: string;                               // Current speaker participant ID
}
```

**Features:**
- v4.1.3: Speaking status displayed in input area
- v4.1.4: All modes support @mentions
- v4.1.5: Summary label display
- v4.1.6: Supports unlimited rounds display
- v4.1.7: Fixed highlight ring being clipped
- v4.1.9: Different speaking status display for parallel/sequential modes

### RoundtableSetupModal

Roundtable discussion setup dialog component.

```typescript
interface RoundtableSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: RoundtableCreateInput) => void;
  agents: Agent[];
}
```

**Features:**
- Set discussion topic
- Add/remove participants (2-6 Agents)
- Set role description for each participant
- Configure speaking rules (sequential/free)
- v4.1.6: Support unlimited rounds mode
- v4.1.9: Smart avatar matching (based on role keywords)
- v4.1.10: Removed parallel speaking mode

### RoundtableMessageBubble

Roundtable message bubble component.

```typescript
interface RoundtableMessageBubbleProps {
  message: RoundtableMessage;
  participants: RoundtableParticipant[];
  isUserMessage?: boolean;
  onQuoteClick?: (messageId: string) => void;
}
```

**Features:**
- Display speaker role and avatar
- Display round label or summary label
- Highlight quoted Agent viewpoints
- Support @mention display
- v4.1.3: Enhanced code block, table, blockquote styles
- v3.5.0: Uses shared Markdown component (code highlighting, image zoom, etc.)
- v3.5.0: Supports thinking process collapse (ThinkingBlock)
- v3.5.0: Supports MCP tool call display (ToolCallList)

**Dependent Components:**
- `src/components/common/markdown/` - Shared Markdown rendering components
- `src/components/features/Chat/ToolCallDisplay.tsx` - Tool call display component

### OrchestrationModeSelector

Orchestration mode selector component.

```typescript
interface OrchestrationModeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: OrchestrationMode) => void;
}
```

---

## Test Cases

### Utility Function Test Cases

| Case ID | Scenario | Input | Expected Result | Status |
|---------|----------|-------|-----------------|--------|
| TC-RT-001 | Create roundtable discussion | Valid topic and 2 participants | Created successfully, mode='roundtable', status='setup' | [x] |
| TC-RT-002 | Insufficient participants | Only 1 participant | Return error RT-001 | [x] |
| TC-RT-003 | Participant count exceeds limit | 7 participants | Return error RT-002 | [x] |
| TC-RT-004 | Empty topic validation | topic='' | Return error RT-003 | [x] |
| TC-RT-005 | Agent does not exist | Invalid agentId | Return error RT-004 | [x] |
| TC-RT-006 | Default rules filling | rules={} | maxRounds=3, speakMode='sequential' | [x] |
| TC-RT-007 | Auto-set summarizer | summarizerAgentId not specified | Uses first participant's agentId | [x] |
| TC-RT-008 | @role name parsing | '@Architect what do you think?' | Return Architect's participant ID | [x] |
| TC-RT-009 | @Agent name parsing | '@Claude please analyze' | Return Claude's participant ID | [x] |
| TC-RT-010 | Multiple @mentions parsing | '@Architect and @Backend Expert' | Return two participant IDs | [x] |
| TC-RT-011 | Invalid @mention | '@NonexistentRole' | Return empty array | [x] |
| TC-RT-012 | Duplicate @mention dedup | '@Architect @Architect' | Return only one ID | [x] |
| TC-RT-013 | Context contains role info | buildRoundtableContext | Contains role name and topic | [x] |
| TC-RT-014 | Context contains participant list | buildRoundtableContext | Contains all participant avatars and roles | [x] |
| TC-RT-015 | Context contains message history | allowCrossReference=true | Contains previous discussion content | [x] |
| TC-RT-016 | Context excludes message history | allowCrossReference=false | Does not contain previous discussion content | [x] |
| TC-RT-017 | Context contains round info | currentRound=2, maxRounds=3 | Contains "Round 2 / Total 3 rounds" | [x] |
| TC-RT-018 | Unlimited rounds context | maxRounds=999 | Only shows "Round N", no total rounds | [ ] |
| TC-RT-019 | Context contains Agent system prompt | Agent has systemPrompt | Contains "Your core capabilities and knowledge" section | [ ] |
| TC-RT-020 | Can continue - below max rounds | currentRound=2, maxRounds=3 | Return true | [x] |
| TC-RT-021 | Cannot continue - max rounds reached | currentRound=4, maxRounds=3 | Return false | [x] |
| TC-RT-022 | Cannot continue - completed status | status='completed' | Return false | [x] |
| TC-RT-023 | Cannot continue - summarizing status | status='summarizing' | Return false | [x] |
| TC-RT-024 | Unlimited mode always continues | maxRounds=999 | Return true | [ ] |
| TC-RT-025 | Sequential mode - get first speaker | speakMode='sequential', no lastSpeakerId | Return first participant ID | [x] |
| TC-RT-026 | Sequential mode - get next speaker | lastSpeakerId='p1' | Return 'p2' | [x] |
| TC-RT-027 | Sequential mode - after last speaker | lastSpeakerId='p3' (last one) | Return null | [x] |
| TC-RT-028 | Free mode - return null | speakMode='free' | Return null | [x] |
| TC-RT-029 | Summary context building | buildSummaryContext | Contains all participant messages and summary requirements | [ ] |
| TC-RT-030 | Round validation - valid range | maxRounds=5 | Validation passes | [ ] |
| TC-RT-031 | Round validation - unlimited | maxRounds=999 | Validation passes | [ ] |
| TC-RT-032 | Round validation - out of range | maxRounds=15 | Return error | [ ] |
| TC-RT-033 | Context contains background info | background='xxx' | Contains "Background" section | [ ] |
| TC-RT-034 | Context contains constraints info | constraints='xxx' | Contains "Constraints" section | [ ] |
| TC-RT-035 | Context without background (not set) | background=undefined | Does not contain background section | [ ] |
| TC-RT-036 | Context without constraints (not set) | constraints=undefined | Does not contain constraints section | [ ] |
| TC-RT-037 | Summary context contains background | background='xxx' | Summary prompt contains background info | [ ] |
| TC-RT-038 | Summary context contains constraints | constraints='xxx' | Summary prompt contains constraints info | [ ] |

### Component Test Cases

| Case ID | Component | Scenario | Expected Result | Status |
|---------|-----------|----------|-----------------|--------|
| TC-RSM-001 | RoundtableSetupModal | Open dialog | Display configuration form | [ ] |
| TC-RSM-002 | RoundtableSetupModal | Add participant | Participant list increases by one | [ ] |
| TC-RSM-003 | RoundtableSetupModal | Remove participant | Participant list decreases by one | [ ] |
| TC-RSM-004 | RoundtableSetupModal | Adjust participant order | Order correctly updated | [ ] |
| TC-RSM-005 | RoundtableSetupModal | Select speaking mode | Mode correctly switched | [ ] |
| TC-RSM-006 | RoundtableSetupModal | Set unlimited rounds | maxRounds=999 | [ ] |
| TC-RSM-007 | RoundtableSetupModal | Set fixed rounds | maxRounds=1-10 | [ ] |
| TC-RSM-008 | RoundtableSetupModal | Smart avatar matching | Assign avatar based on role keywords | [ ] |
| TC-RSM-009 | RoundtableSetupModal | Creation validation fails | Display error message | [ ] |
| TC-RSM-010 | RoundtableSetupModal | Creation succeeds | Call onCreate and close dialog | [ ] |
| TC-RSM-011 | RoundtableSetupModal | Expand/collapse background input | Show/hide background input box on click | [ ] |
| TC-RSM-012 | RoundtableSetupModal | Expand/collapse constraints input | Show/hide constraints input box on click | [ ] |
| TC-RSM-013 | RoundtableSetupModal | Enter background info | background field correctly passed | [ ] |
| TC-RSM-014 | RoundtableSetupModal | Enter constraints info | constraints field correctly passed | [ ] |
| TC-RV-001 | RoundtableView | Display discussion topic | Title bar shows topic | [ ] |
| TC-RV-002 | RoundtableView | Display participant list | Avatars and roles correctly displayed | [ ] |
| TC-RV-003 | RoundtableView | Display round info | Show current round / total rounds | [ ] |
| TC-RV-004 | RoundtableView | Unlimited rounds display | Only show "Round N" | [ ] |
| TC-RV-005 | RoundtableView | Start discussion button | Shown when status='setup' | [ ] |
| TC-RV-006 | RoundtableView | Generate summary button | Shown when status='discussing' | [ ] |
| TC-RV-007 | RoundtableView | Next round button | Shown in unlimited mode | [ ] |
| TC-RV-008 | RoundtableView | Speaking status display | Show current speaker info | [ ] |
| TC-RV-009 | RoundtableView | @mention menu | Show participant list after typing @ | [ ] |
| TC-RV-010 | RoundtableView | Select @mention | Insert @role name into input box | [ ] |
| TC-RV-011 | RoundtableView | Send message | Call onSendMessage | [ ] |
| TC-RV-012 | RoundtableView | Stop generating | Call onStopGenerating | [ ] |
| TC-RMB-001 | RoundtableMessageBubble | Display user message | Right-aligned, purple gradient background | [ ] |
| TC-RMB-002 | RoundtableMessageBubble | Display Agent message | Left-aligned, show avatar and role | [ ] |
| TC-RMB-003 | RoundtableMessageBubble | Display round label | Show "Round N" | [ ] |
| TC-RMB-004 | RoundtableMessageBubble | Display summary label | Show "Summary" when isSummary=true | [ ] |
| TC-RMB-005 | RoundtableMessageBubble | @mention highlighting | @role name displayed in bold | [ ] |
| TC-RMB-006 | RoundtableMessageBubble | Quoted content display | Show quote block, clickable to jump | [ ] |
| TC-RMB-007 | RoundtableMessageBubble | Markdown rendering | Correctly render tables, code blocks, etc. | [ ] |
| TC-RMB-008 | RoundtableMessageBubble | Tool-call-only message no thinking placeholder | When content is empty and toolCalls exist, don't show "(Thinking...)" | [x] |
| TC-RMB-009 | RoundtableMessageBubble | Tool call standalone message no duplication with text | When text message + tool message coexist, same tool call shown only once in tool message | [x] |
| TC-RMB-010 | RoundtableMessageBubble | No content no tools shows thinking placeholder | When content is empty with no toolCalls or reasoning, show "(Thinking...)" | [x] |
| TC-OMS-001 | OrchestrationModeSelector | Display all modes | Show 5 orchestration modes | [ ] |
| TC-OMS-002 | OrchestrationModeSelector | Roundtable mode selectable | available=true | [ ] |
| TC-OMS-003 | OrchestrationModeSelector | Other modes not selectable | Show "Coming Soon" | [ ] |
| TC-OMS-004 | OrchestrationModeSelector | Select mode | Call onSelectMode and close | [ ] |

---

## Error Code Definitions

| Error Code | Description |
|------------|-------------|
| RT-001 | Insufficient participants (at least 2 required) |
| RT-002 | Participant count exceeds limit (maximum 6) |
| RT-003 | Discussion topic not set |
| RT-004 | Agent does not exist or has been deleted |
| RT-005 | Summarizer Agent not configured |
| RT-006 | Maximum discussion rounds reached |
| RT-007 | @mentioned participant does not exist |

---

## Tauri Storage Commands

### save_roundtable_chats

Save roundtable chat list to local file system.

```rust
#[tauri::command]
async fn save_roundtable_chats(
    app_handle: tauri::AppHandle,
    chats: Vec<serde_json::Value>
) -> Result<(), String>
```

**Storage Path:** `{app_data_dir}/roundtable_chats.json`

### load_roundtable_chats

Load roundtable chat list from local file system.

```rust
#[tauri::command]
async fn load_roundtable_chats(
    app_handle: tauri::AppHandle
) -> Result<Vec<serde_json::Value>, String>
```

---

## Change History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-01-30 | v1.0.0 | - | Initial version, defined five orchestration modes |
| 2025-01-30 | v1.1.0 | - | Improved roundtable discussion detailed design, added interface definitions and test cases |
| 2025-01-31 | v1.2.0 | - | Added Tauri storage command interface definitions |
| 2025-02-01 | v4.1.10 | - | Synced code implementation status, improved test case docs, updated component API |
| 2025-02-01 | v4.1.13 | - | Added optional background and constraints fields for setting discussion background and boundaries |
| 2025-02-05 | v3.5.0 | - | Unified message rendering: shared Markdown components, thinking process collapse, MCP tool call display |
| 2025-03-01 | v4.1.40 | - | Fixed tool call loop mechanism, auto-return results after tool execution to continue generation |

### v4.x Version Feature Notes

- **v4.1.3**: Speaking status display optimization, enhanced Markdown rendering styles
- **v4.1.4**: All modes support @mention functionality
- **v4.1.5**: Added summary message label display
- **v4.1.6**: Support unlimited rounds mode (maxRounds=999)
- **v4.1.7**: Fixed participant highlight ring clipping, default rounds changed to unlimited
- **v4.1.9**: Smart avatar matching (based on role keywords), context includes Agent system prompt
- **v4.1.10**: Removed parallel speaking mode (streaming response cannot correctly distinguish sources)
- **v4.1.13**: Added optional `background` (background info) and `constraints` (discussion constraints) fields
- **v4.1.40**: Fixed tool call loop mechanism, auto-return results after tool execution to continue generation (consistent with regular chat)

### v3.5.0 Unified Message Rendering

This version unified the message rendering experience between Chat and Roundtable:

**Shared Components:**
- `ThinkingBlock` - Thinking process collapse/expand (supports reasoningContent field and `<think>` tags)
- `CodeBlock` - Code syntax highlighting, copy, lazy loading
- `ImageRenderer` - Image lazy loading, click to zoom, error handling
- `LinkRenderer` - Link rendering, file download detection
- `createMarkdownComponents` - Unified Markdown configuration factory

**MCP Tool Call Support:**
- Agents in roundtable can use MCP tools
- `tool_calls` event handling (App.tsx)
- `ToolCallList` component displays tool call details
- Tool execution results displayed in real-time
- **v4.1.40**: Tool call loop mechanism - auto-return results to model after tool execution to continue generation

**Tool Call Loop Mechanism (v4.1.40):**

Roundtable now supports the complete tool call loop, consistent with regular chat:

1. **Tool Call Detection**: When Agent reply contains tool calls, frontend executes tools and gets results
2. **Result Return**: Add tool calls and results to message history, build new API request
3. **Continue Generation**: Model continues generating reply based on tool results, may call tools again
4. **Loop Protection**: Maximum 20 rounds of tool calls (configurable via Agent.limits.maxToolCalls)
5. **State Preservation**: Speaker state maintained during tool calls (currentSpeakerId), consistent UI display

**Event Handling (App.tsx):**
```typescript
// Roundtable streaming response events
type ChatEventPayload = {
  id: string;
  event: 'chunk' | 'reasoning_chunk' | 'tool_calls' | 'done' | 'error';
  content?: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};
```

---

## Known Issues & Fixes

### [P1] Roundtable summary stream listener not filtered by messageId (v4.2.5)

**Problem Description:**

During the roundtable summary phase (`generateRoundtableSummary` function), listening to `chat-event` does not filter by `payload.id !== messageId` like the main flow does. In concurrent scenarios, chunks/done/error events from other sessions/messages may incorrectly update the current summary message and status.

**Impact Scope:**

- In concurrent scenarios, when multiple roundtable sessions generate summaries simultaneously, stream pollution may occur
- Events from other sessions may incorrectly trigger status updates for the current summary
- May lead to confused summary content or abnormal states

**Root Cause:**

The event listener at App.tsx line 2090 lacks messageId filtering:

```typescript
// Wrong: no messageId filtering
unlisten = await listen('chat-event', (event: { payload: { id: string; event: string; content?: string; error?: string } }) => {
  const payload = event.payload;

  if (payload.event === 'chunk' && payload.content) {
    // Directly accumulate content without checking payload.id
    accumulatedContent += payload.content;
    // ...
  }
});
```

**Fix:**

Add messageId filtering at the beginning of the event listener, consistent with the main flow:

```typescript
// Correct: add messageId filtering
unlisten = await listen('chat-event', (event: { payload: { id: string; event: string; content?: string; error?: string } }) => {
  const payload = event.payload;

  // Filter: only process events for the current message
  if (payload.id !== messageId) return;

  if (payload.event === 'chunk' && payload.content) {
    accumulatedContent += payload.content;
    // ...
  }
});
```

**Test Cases:**

| Case ID | Scenario | Input | Expected Result | Status |
|---------|----------|-------|-----------------|--------|
| TC-RT-STREAM-001 | Single summary generation | Generate one summary | Correctly receive chunks and update content | [ ] |
| TC-RT-STREAM-002 | Concurrent summary generation | Generate 2 summaries simultaneously | Each summary only receives its own chunks, no stream pollution | [ ] |
| TC-RT-STREAM-003 | Summary and regular chat concurrent | Summary + regular chat generating simultaneously | No interference, each updates correctly | [ ] |
| TC-RT-STREAM-004 | Error event filtering | Error event from other message | Does not trigger current summary's error handling | [ ] |
| TC-RT-STREAM-005 | Done event filtering | Done event from other message | Does not trigger current summary's completion status | [ ] |

**Fix Version:** v4.2.5

**Related Files:**

- `src/App.tsx` (line 2090-2140)
- `docs/modules/agent-orchestration.md` (this document)

---

<a id="中文"></a>

## 模块概述

Agent 编排模块提供多 Agent 协作交互能力，支持多种编排模式：并排对比、圆桌讨论、审核纠错、工作流编排、辩论模式。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/AgentOrchestration` |
| 类型定义 | `src/types/index.ts` |
| 存储服务 | `src/services/storage.ts` |
| 测试文件 | `src/test/components/AgentOrchestration/` |
| 创建日期 | 2025-01-30 |
| 最后更新 | 2025-02-01 |
| 当前版本 | v4.1.13 |

---

## 功能列表

### 编排模式

- [x] **圆桌讨论模式 (Roundtable)** - 多个 Agent 角色轮流发言，互相引用讨论 ✅ 已实现
- [ ] **并排对比模式 (Compare)** - 同一问题发送给多个模型/Agent，并排显示回答
- [ ] **审核纠错模式 (Review)** - 一个 Agent 生成，另一个 Agent 审核纠错
- [ ] **工作流编排模式 (Pipeline)** - 多个 Agent 串行处理，上游输出作为下游输入
- [ ] **辩论模式 (Debate)** - 正反方 Agent 围绕议题进行多轮辩论

### 通用功能

- [x] 创建编排对话时选择模式 ✅ OrchestrationModeSelector
- [x] 编排对话持久化 ✅ save/load_roundtable_chats
- [ ] 编排结果导出
- [ ] 编排模板保存与复用

---

## 组件结构

```
AgentOrchestration/
├── index.tsx                      # 模块入口，导出所有组件和工具函数
├── OrchestrationModeSelector.tsx  # 模式选择器弹窗
├── RoundtableView.tsx             # 圆桌讨论主视图
├── RoundtableSetupModal.tsx       # 圆桌讨论配置弹窗
├── RoundtableMessageBubble.tsx    # 圆桌消息气泡组件
└── utils.ts                       # 工具函数（创建、验证、上下文构建等）
```

---

## 数据结构

### OrchestrationMode 编排模式枚举

```typescript
type OrchestrationMode = 'single' | 'compare' | 'roundtable' | 'review' | 'pipeline' | 'debate';
```

### RoundtableChat 圆桌对话（扩展 Chat）

```typescript
interface RoundtableChat extends Chat {
  mode: 'roundtable';

  roundtableConfig: {
    topic: string;                          // 讨论主题
    background?: string;                    // v4.1.13: 内容背景/上下文（可选）
    constraints?: string;                   // v4.1.13: 讨论约束/边界（可选）
    participants: RoundtableParticipant[];  // 参与者列表
    rules: RoundtableRules;                 // 讨论规则
    currentRound: number;                   // 当前轮次
    status: 'setup' | 'discussing' | 'summarizing' | 'completed';
  };
}
```

**字段说明：**

- `background`（可选）：为讨论提供背景信息，帮助 Agent 理解讨论的前提和语境
- `constraints`（可选）：限定讨论范围，避免 Agent 跑题或给出不切实际的建议

**使用场景示例：**

```typescript
// 简单场景：只设置主题，通过发言引导讨论
{ topic: '如何提升用户体验？' }

// 复杂场景：预设背景和约束，让讨论更聚焦
{
  topic: '如何优化用户注册流程？',
  background: '我们是 B2B SaaS 产品，当前注册转化率 15%，目标用户是企业 IT 管理员',
  constraints: '预算不超过 5 万元，需要在 2 周内完成，不考虑重构整个架构'
}
```

### RoundtableParticipant 圆桌参与者

```typescript
interface RoundtableParticipant {
  id: string;                   // 参与者 ID（唯一标识）
  agentId: string;              // 关联的 Agent ID
  role: string;                 // 角色描述（如"架构师"、"产品经理"）
  speakOrder: number;           // 发言顺序（1-based）
  avatar?: string;              // 头像 emoji（v4.1.9 智能匹配）
  color?: string;               // 主题色（用于 UI 区分）
  messageCount: number;         // 已发言次数
  lastSpokeAt?: Date;           // 最后发言时间
}
```

### RoundtableRules 圆桌规则

```typescript
interface RoundtableRules {
  maxRounds: number;                        // 最大讨论轮数（1-10 或 999 表示无限制）
  speakMode: 'sequential' | 'free';         // 发言模式（v4.1.10 移除 parallel）
  // sequential: 按顺序轮流发言
  // free: 用户 @指定 Agent 发言

  autoSummarize: boolean;                   // 讨论结束后是否自动总结
  allowCrossReference: boolean;             // 是否允许互相引用（影响上下文构建）
  summarizerAgentId?: string;               // 总结者 Agent ID

  // 高级选项
  turnTimeLimit?: number;                   // 单次发言时间限制（秒）
  requireResponse?: boolean;                // 是否要求所有参与者必须发言
}
```

### RoundtableMessage 圆桌消息（扩展 Message）

```typescript
interface RoundtableMessage extends Message {
  // 圆桌特有字段
  participantId: string;                    // 发言参与者 ID
  round: number;                            // 所属轮次
  isSummary?: boolean;                      // 是否为总结消息

  // 引用关系
  replyToMessageId?: string;                // 回复哪条消息
  mentionedParticipantIds?: string[];       // @提及的参与者

  // 引用内容（用于 UI 高亮）
  quotedContent?: {
    messageId: string;
    participantId: string;
    excerpt: string;                        // 引用片段
  }[];

  // v3.5.0: 思考过程（extended thinking 模型）
  reasoningContent?: string;

  // v3.5.0: MCP 工具调用（继承自 Message）
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}
```

### RoundtableCreateInput 创建输入

```typescript
interface RoundtableCreateInput {
  topic: string;                            // 讨论主题（必填）
  background?: string;                      // v4.1.13: 内容背景/上下文（可选）
  constraints?: string;                     // v4.1.13: 讨论约束/边界（可选）
  participants: {
    agentId: string;
    role: string;
    avatar?: string;
    color?: string;
  }[];
  rules?: Partial<RoundtableRules>;         // 可选规则配置
}
```

---

## 工具函数 API

### createRoundtableChat

创建圆桌讨论对话。

```typescript
function createRoundtableChat(
  input: RoundtableCreateInput,
  agents: Agent[]
): RoundtableChat
```

**参数：**
- `input` - 创建输入参数
- `agents` - 可用的 Agent 列表（用于验证）

**返回：** 创建的圆桌对话对象

**异常：** 如果验证失败则抛出错误

**示例：**
```typescript
const chat = createRoundtableChat({
  topic: '如何设计高并发系统？',
  participants: [
    { agentId: 'agent-1', role: '架构师' },
    { agentId: 'agent-2', role: '后端专家' },
  ],
  rules: { maxRounds: 5 },
}, agents);
```

### buildRoundtableContext

为指定参与者构建系统提示词。

```typescript
function buildRoundtableContext(
  config: RoundtableConfig,
  participantId: string,
  messages: RoundtableMessage[],
  agents: Agent[]
): string
```

**参数：**
- `config` - 圆桌配置
- `participantId` - 当前发言参与者 ID
- `messages` - 之前的消息列表
- `agents` - Agent 列表（用于获取 Agent 名称和系统提示词）

**返回：** 构建的系统提示词

**特性（v4.1.9）：** 包含 Agent 原始系统提示词，确保 Agent 保持其专业能力

### buildSummaryContext

为总结者构建系统提示词。

```typescript
function buildSummaryContext(
  config: RoundtableConfig,
  messages: RoundtableMessage[],
  agents: Agent[]
): string
```

### parseMentions

解析消息中的 @提及。

```typescript
function parseMentions(
  content: string,
  participants: RoundtableParticipant[],
  agents: Agent[]
): string[]
```

**支持格式：**
- `@角色名`（如 `@架构师`）
- `@Agent名称`（如 `@Claude`）

**返回：** 被提及的参与者 ID 列表

### validateRoundtableConfig

验证圆桌讨论配置。

```typescript
function validateRoundtableConfig(
  input: RoundtableCreateInput,
  agents: Agent[]
): string | null
```

**返回：** 错误信息，如果验证通过则返回 `null`

### canContinueDiscussion

检查是否可以继续讨论。

```typescript
function canContinueDiscussion(config: RoundtableConfig): boolean
```

**特性（v4.1.6）：** 支持无限制轮数模式（maxRounds = 999）

### getNextSpeaker

获取下一个发言者。

```typescript
function getNextSpeaker(
  config: RoundtableConfig,
  lastSpeakerId?: string
): string | null
```

**返回：** 下一个发言者 ID，如果没有则返回 `null`

---

## 组件 API

### RoundtableView

圆桌讨论主视图组件。

```typescript
interface RoundtableViewProps {
  chat: RoundtableChat;                                    // 圆桌对话数据
  agents: Agent[];                                         // 可用 Agent 列表
  onSendMessage?: (content: string, targetParticipantIds?: string[]) => void;
  onStartDiscussion?: (chatId: string, userQuestion: string) => Promise<void>;
  onSummarize?: (chatId: string) => Promise<void>;
  onNextRound?: (chatId: string) => void;
  onStopGenerating?: () => void;
  isGenerating?: boolean;
  currentSpeakerId?: string;                               // 当前发言者参与者 ID
}
```

**功能特性：**
- v4.1.3: 发言状态显示在输入框区域
- v4.1.4: 所有模式都支持 @提及
- v4.1.5: 总结标识显示
- v4.1.6: 支持无限制轮数显示
- v4.1.7: 修复高亮环被截断的问题
- v4.1.9: 并行/顺序模式不同的发言状态显示

### RoundtableSetupModal

圆桌讨论配置弹窗组件。

```typescript
interface RoundtableSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: RoundtableCreateInput) => void;
  agents: Agent[];
}
```

**功能特性：**
- 设置讨论主题
- 添加/移除参与者（2-6 个 Agent）
- 为每个参与者设置角色描述
- 配置发言规则（顺序/自由）
- v4.1.6: 支持无限制轮数模式
- v4.1.9: 智能头像匹配（根据角色关键词）
- v4.1.10: 移除并行发言模式

### RoundtableMessageBubble

圆桌消息气泡组件。

```typescript
interface RoundtableMessageBubbleProps {
  message: RoundtableMessage;
  participants: RoundtableParticipant[];
  isUserMessage?: boolean;
  onQuoteClick?: (messageId: string) => void;
}
```

**功能特性：**
- 显示发言者角色和头像
- 显示轮次标识或总结标识
- 高亮引用的其他 Agent 观点
- 支持 @提及 显示
- v4.1.3: 增强代码块、表格、引用块样式
- v3.5.0: 使用共享 Markdown 组件（代码高亮、图片放大等）
- v3.5.0: 支持思考过程折叠（ThinkingBlock）
- v3.5.0: 支持 MCP 工具调用显示（ToolCallList）

**依赖组件：**
- `src/components/common/markdown/` - 共享 Markdown 渲染组件
- `src/components/features/Chat/ToolCallDisplay.tsx` - 工具调用显示组件

### OrchestrationModeSelector

编排模式选择器组件。

```typescript
interface OrchestrationModeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: OrchestrationMode) => void;
}
```

---

## 测试用例

### 工具函数测试用例

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-RT-001 | 创建圆桌讨论 | 有效的 topic 和 2 个参与者 | 成功创建，mode='roundtable'，status='setup' | [x] |
| TC-RT-002 | 参与者数量不足 | 只有 1 个参与者 | 返回错误 RT-001 | [x] |
| TC-RT-003 | 参与者数量超限 | 7 个参与者 | 返回错误 RT-002 | [x] |
| TC-RT-004 | 空主题验证 | topic='' | 返回错误 RT-003 | [x] |
| TC-RT-005 | Agent 不存在 | 无效的 agentId | 返回错误 RT-004 | [x] |
| TC-RT-006 | 默认规则填充 | rules={} | maxRounds=3, speakMode='sequential' | [x] |
| TC-RT-007 | 自动设置总结者 | 未指定 summarizerAgentId | 使用第一个参与者的 agentId | [x] |
| TC-RT-008 | @角色名解析 | '@架构师 你怎么看？' | 返回架构师的参与者 ID | [x] |
| TC-RT-009 | @Agent名称解析 | '@Claude 请分析' | 返回 Claude 对应的参与者 ID | [x] |
| TC-RT-010 | 多个@提及解析 | '@架构师 和 @后端专家' | 返回两个参与者 ID | [x] |
| TC-RT-011 | 无效@提及 | '@不存在的角色' | 返回空数组 | [x] |
| TC-RT-012 | 重复@提及去重 | '@架构师 @架构师' | 只返回一个 ID | [x] |
| TC-RT-013 | 上下文包含角色信息 | buildRoundtableContext | 包含角色名和主题 | [x] |
| TC-RT-014 | 上下文包含参与者列表 | buildRoundtableContext | 包含所有参与者头像和角色 | [x] |
| TC-RT-015 | 上下文包含历史消息 | allowCrossReference=true | 包含之前的讨论内容 | [x] |
| TC-RT-016 | 上下文不包含历史消息 | allowCrossReference=false | 不包含之前的讨论内容 | [x] |
| TC-RT-017 | 上下文包含轮次信息 | currentRound=2, maxRounds=3 | 包含"第 2 轮 / 共 3 轮" | [x] |
| TC-RT-018 | 无限制轮数上下文 | maxRounds=999 | 只显示"第 N 轮"，不显示总轮数 | [ ] |
| TC-RT-019 | 上下文包含 Agent 系统提示词 | Agent 有 systemPrompt | 包含"你的核心能力和知识"部分 | [ ] |
| TC-RT-020 | 可继续讨论-未达最大轮数 | currentRound=2, maxRounds=3 | 返回 true | [x] |
| TC-RT-021 | 不可继续-达到最大轮数 | currentRound=4, maxRounds=3 | 返回 false | [x] |
| TC-RT-022 | 不可继续-状态为 completed | status='completed' | 返回 false | [x] |
| TC-RT-023 | 不可继续-状态为 summarizing | status='summarizing' | 返回 false | [x] |
| TC-RT-024 | 无限制模式始终可继续 | maxRounds=999 | 返回 true | [ ] |
| TC-RT-025 | 顺序模式-获取第一个发言者 | speakMode='sequential', 无 lastSpeakerId | 返回第一个参与者 ID | [x] |
| TC-RT-026 | 顺序模式-获取下一个发言者 | lastSpeakerId='p1' | 返回 'p2' | [x] |
| TC-RT-027 | 顺序模式-最后一个发言者后 | lastSpeakerId='p3'（最后一个） | 返回 null | [x] |
| TC-RT-028 | 自由模式-返回 null | speakMode='free' | 返回 null | [x] |
| TC-RT-029 | 总结上下文构建 | buildSummaryContext | 包含所有参与者发言和总结要求 | [ ] |
| TC-RT-030 | 轮数验证-有效范围 | maxRounds=5 | 验证通过 | [ ] |
| TC-RT-031 | 轮数验证-无限制 | maxRounds=999 | 验证通过 | [ ] |
| TC-RT-032 | 轮数验证-超出范围 | maxRounds=15 | 返回错误 | [ ] |
| TC-RT-033 | 上下文包含背景信息 | background='xxx' | 包含"Background / 背景信息"部分 | [ ] |
| TC-RT-034 | 上下文包含约束信息 | constraints='xxx' | 包含"Constraints / 讨论约束"部分 | [ ] |
| TC-RT-035 | 上下文不含背景（未设置） | background=undefined | 不包含背景部分 | [ ] |
| TC-RT-036 | 上下文不含约束（未设置） | constraints=undefined | 不包含约束部分 | [ ] |
| TC-RT-037 | 总结上下文包含背景 | background='xxx' | 总结提示词包含背景信息 | [ ] |
| TC-RT-038 | 总结上下文包含约束 | constraints='xxx' | 总结提示词包含约束信息 | [ ] |

### 组件测试用例

| 用例ID | 组件 | 场景 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-RSM-001 | RoundtableSetupModal | 打开弹窗 | 显示配置表单 | [ ] |
| TC-RSM-002 | RoundtableSetupModal | 添加参与者 | 参与者列表增加一项 | [ ] |
| TC-RSM-003 | RoundtableSetupModal | 移除参与者 | 参与者列表减少一项 | [ ] |
| TC-RSM-004 | RoundtableSetupModal | 调整参与者顺序 | 顺序正确更新 | [ ] |
| TC-RSM-005 | RoundtableSetupModal | 选择发言模式 | 模式正确切换 | [ ] |
| TC-RSM-006 | RoundtableSetupModal | 设置无限制轮数 | maxRounds=999 | [ ] |
| TC-RSM-007 | RoundtableSetupModal | 设置固定轮数 | maxRounds=1-10 | [ ] |
| TC-RSM-008 | RoundtableSetupModal | 智能头像匹配 | 根据角色关键词分配头像 | [ ] |
| TC-RSM-009 | RoundtableSetupModal | 创建验证失败 | 显示错误提示 | [ ] |
| TC-RSM-010 | RoundtableSetupModal | 创建成功 | 调用 onCreate 并关闭弹窗 | [ ] |
| TC-RSM-011 | RoundtableSetupModal | 展开/折叠背景输入 | 点击后显示/隐藏背景输入框 | [ ] |
| TC-RSM-012 | RoundtableSetupModal | 展开/折叠约束输入 | 点击后显示/隐藏约束输入框 | [ ] |
| TC-RSM-013 | RoundtableSetupModal | 输入背景信息 | background 字段正确传递 | [ ] |
| TC-RSM-014 | RoundtableSetupModal | 输入约束信息 | constraints 字段正确传递 | [ ] |
| TC-RV-001 | RoundtableView | 显示讨论主题 | 标题栏显示 topic | [ ] |
| TC-RV-002 | RoundtableView | 显示参与者列表 | 头像和角色正确显示 | [ ] |
| TC-RV-003 | RoundtableView | 显示轮次信息 | 显示当前轮/总轮数 | [ ] |
| TC-RV-004 | RoundtableView | 无限制轮数显示 | 只显示"第 N 轮" | [ ] |
| TC-RV-005 | RoundtableView | 开始讨论按钮 | status='setup' 时显示 | [ ] |
| TC-RV-006 | RoundtableView | 生成总结按钮 | status='discussing' 时显示 | [ ] |
| TC-RV-007 | RoundtableView | 下一轮按钮 | 无限制模式时显示 | [ ] |
| TC-RV-008 | RoundtableView | 发言状态显示 | 显示当前发言者信息 | [ ] |
| TC-RV-009 | RoundtableView | @提及菜单 | 输入@后显示参与者列表 | [ ] |
| TC-RV-010 | RoundtableView | 选择@提及 | 插入@角色名到输入框 | [ ] |
| TC-RV-011 | RoundtableView | 发送消息 | 调用 onSendMessage | [ ] |
| TC-RV-012 | RoundtableView | 停止生成 | 调用 onStopGenerating | [ ] |
| TC-RMB-001 | RoundtableMessageBubble | 显示用户消息 | 右对齐，紫色渐变背景 | [ ] |
| TC-RMB-002 | RoundtableMessageBubble | 显示 Agent 消息 | 左对齐，显示头像和角色 | [ ] |
| TC-RMB-003 | RoundtableMessageBubble | 显示轮次标识 | 显示"第 N 轮" | [ ] |
| TC-RMB-004 | RoundtableMessageBubble | 显示总结标识 | isSummary=true 时显示"总结" | [ ] |
| TC-RMB-005 | RoundtableMessageBubble | @提及高亮 | @角色名 加粗显示 | [ ] |
| TC-RMB-006 | RoundtableMessageBubble | 引用内容显示 | 显示引用块，可点击跳转 | [ ] |
| TC-RMB-007 | RoundtableMessageBubble | Markdown 渲染 | 正确渲染表格、代码块等 | [ ] |
| TC-RMB-008 | RoundtableMessageBubble | 仅工具调用消息不显示思考中占位 | content 为空且 toolCalls 存在时，不显示"(正在思考中...)" | [x] |
| TC-RMB-009 | RoundtableMessageBubble | 工具调用独立消息不与文本消息重复 | 文本消息 + 工具消息同时存在时，同一工具调用仅在工具消息展示一次 | [x] |
| TC-RMB-010 | RoundtableMessageBubble | 无内容无工具时显示思考中占位 | content 为空且无 toolCalls、无 reasoning 时显示"(正在思考中...)" | [x] |
| TC-OMS-001 | OrchestrationModeSelector | 显示所有模式 | 显示 5 种编排模式 | [ ] |
| TC-OMS-002 | OrchestrationModeSelector | 圆桌模式可选 | available=true | [ ] |
| TC-OMS-003 | OrchestrationModeSelector | 其他模式不可选 | 显示"即将推出" | [ ] |
| TC-OMS-004 | OrchestrationModeSelector | 选择模式 | 调用 onSelectMode 并关闭 | [ ] |

---

## 错误码定义

| 错误码 | 说明 |
|--------|------|
| RT-001 | 参与者数量不足（至少需要 2 个） |
| RT-002 | 参与者数量超限（最多 6 个） |
| RT-003 | 未设置讨论主题 |
| RT-004 | Agent 不存在或已被删除 |
| RT-005 | 总结者 Agent 未配置 |
| RT-006 | 已达到最大讨论轮数 |
| RT-007 | @提及的参与者不存在 |

---

## Tauri 存储命令

### save_roundtable_chats

保存圆桌对话列表到本地文件系统。

```rust
#[tauri::command]
async fn save_roundtable_chats(
    app_handle: tauri::AppHandle,
    chats: Vec<serde_json::Value>
) -> Result<(), String>
```

**存储路径：** `{app_data_dir}/roundtable_chats.json`

### load_roundtable_chats

从本地文件系统加载圆桌对话列表。

```rust
#[tauri::command]
async fn load_roundtable_chats(
    app_handle: tauri::AppHandle
) -> Result<Vec<serde_json::Value>, String>
```

---

## 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|----------|
| 2025-01-30 | v1.0.0 | - | 初始版本，定义五种编排模式 |
| 2025-01-30 | v1.1.0 | - | 完善圆桌讨论模式详细设计，添加接口定义和测试用例 |
| 2025-01-31 | v1.2.0 | - | 添加 Tauri 存储命令接口定义 |
| 2025-02-01 | v4.1.10 | - | 同步代码实现状态，完善测试用例文档，更新组件 API |
| 2025-02-01 | v4.1.13 | - | 新增 background 和 constraints 可选字段，支持设置讨论背景和约束 |
| 2025-02-05 | v3.5.0 | - | 统一消息渲染：共享 Markdown 组件、思考过程折叠、MCP 工具调用显示 |
| 2025-03-01 | v4.1.40 | - | 修复工具调用循环机制，工具执行后自动回传结果继续生成 |

### v4.x 版本特性说明

- **v4.1.3**: 发言状态显示优化，增强 Markdown 渲染样式
- **v4.1.4**: 所有模式都支持 @提及功能
- **v4.1.5**: 添加总结消息标识显示
- **v4.1.6**: 支持无限制轮数模式（maxRounds=999）
- **v4.1.7**: 修复参与者高亮环被截断问题，默认轮数改为不限制
- **v4.1.9**: 智能头像匹配（根据角色关键词），上下文包含 Agent 系统提示词
- **v4.1.10**: 移除并行发言模式（流式响应无法正确区分来源）
- **v4.1.13**: 新增 `background`（背景信息）和 `constraints`（讨论约束）可选字段
- **v4.1.40**: 修复工具调用循环机制，工具执行后自动回传结果继续生成（与普通对话保持一致）

### v3.5.0 统一消息渲染

本版本统一了 Chat 和圆桌会议的消息渲染体验：

**共享组件：**
- `ThinkingBlock` - 思考过程折叠/展开（支持 reasoningContent 字段和 `<think>` 标签）
- `CodeBlock` - 代码语法高亮、复制、懒加载
- `ImageRenderer` - 图片懒加载、点击放大、错误处理
- `LinkRenderer` - 链接渲染、文件下载检测
- `createMarkdownComponents` - 统一 Markdown 配置工厂

**MCP 工具调用支持：**
- 圆桌会议中 Agent 可使用 MCP 工具
- `tool_calls` 事件处理（App.tsx）
- `ToolCallList` 组件显示工具调用详情
- 工具执行结果实时显示
- **v4.1.40**: 工具调用循环机制 - 工具执行后自动将结果回传给模型继续生成

**工具调用循环机制（v4.1.40）：**

圆桌会议现在支持完整的工具调用循环，与普通对话保持一致：

1. **工具调用检测**：Agent 回复中包含工具调用时，前端执行工具并获取结果
2. **结果回传**：将工具调用和结果添加到消息历史，构建新的 API 请求
3. **继续生成**：模型基于工具结果继续生成回复，可能再次调用工具
4. **循环保护**：最多支持 20 轮工具调用（可通过 Agent.limits.maxToolCalls 配置）
5. **状态保持**：工具调用期间保持发言者状态（currentSpeakerId），UI 显示一致

**事件处理（App.tsx）：**
```typescript
// 圆桌会议流式响应事件
type ChatEventPayload = {
  id: string;
  event: 'chunk' | 'reasoning_chunk' | 'tool_calls' | 'done' | 'error';
  content?: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};
```

---

## 已知问题与修复

### [P1] 圆桌总结流监听未按 messageId 过滤（v4.2.5）

**问题描述：**

在圆桌会议总结阶段（`generateRoundtableSummary` 函数），监听 `chat-event` 时没有像主流程那样做 `payload.id !== messageId` 过滤。并发消息时，其他会话/消息的 chunk/done/error 可能误更新当前总结消息与状态。

**影响范围：**

- 并发场景下，多个圆桌会议同时生成总结时，可能出现串流污染
- 其他会话的事件可能误触发当前总结的状态更新
- 可能导致总结内容混乱或状态异常

**根本原因：**

App.tsx line 2090 的事件监听器缺少 messageId 过滤：

```typescript
// 错误：没有过滤 messageId
unlisten = await listen('chat-event', (event: { payload: { id: string; event: string; content?: string; error?: string } }) => {
  const payload = event.payload;

  if (payload.event === 'chunk' && payload.content) {
    // 直接累积内容，没有检查 payload.id
    accumulatedContent += payload.content;
    // ...
  }
});
```

**修复方案：**

在事件监听器开头添加 messageId 过滤，与主流程保持一致：

```typescript
// 正确：添加 messageId 过滤
unlisten = await listen('chat-event', (event: { payload: { id: string; event: string; content?: string; error?: string } }) => {
  const payload = event.payload;

  // 过滤：只处理当前消息的事件
  if (payload.id !== messageId) return;

  if (payload.event === 'chunk' && payload.content) {
    accumulatedContent += payload.content;
    // ...
  }
});
```

**测试用例：**

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-RT-STREAM-001 | 单个总结生成 | 生成一个总结 | 正常接收 chunk 并更新内容 | [ ] |
| TC-RT-STREAM-002 | 并发总结生成 | 同时生成 2 个总结 | 每个总结只接收自己的 chunk，不串流 | [ ] |
| TC-RT-STREAM-003 | 总结与普通对话并发 | 总结 + 普通对话同时生成 | 互不干扰，各自更新正确 | [ ] |
| TC-RT-STREAM-004 | 错误事件过滤 | 其他消息的 error 事件 | 不触发当前总结的错误处理 | [ ] |
| TC-RT-STREAM-005 | done 事件过滤 | 其他消息的 done 事件 | 不触发当前总结的完成状态 | [ ] |

**修复版本：** v4.2.5

**相关文件：**

- `src/App.tsx` (line 2090-2140)
- `docs/modules/agent-orchestration.md` (本文档)
