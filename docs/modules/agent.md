# Agent Module / Agent 智能代理模块

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Module Overview

The Agent module provides intelligent agent creation, configuration, and management functionality, allowing users to customize their own AI assistants. Inspired by Claude Code's design, it supports fine-grained permission control and automated configuration.

| Property | Value |
|----------|-------|
| Module Path | `src/components/features/Agent` |
| Storage Service | `src/services/storage.ts` |
| Created Date | 2026-01-18 |
| Last Updated | 2026-01-27 |

---

## Feature List

### Core Features

- [x] Agent list display
- [x] Create new Agent
- [x] Edit Agent configuration
- [x] Delete Agent (v2.2.0)
- [x] Agent status management (activate/deactivate) (v2.2.0)
- [x] Model selection configuration
- [x] Skill binding configuration
- [x] System prompt settings
- [x] **Data persistence** (v2.2.0)
  - [x] Tauri file system persistence
  - [x] localStorage fallback support

### Extended Features

- [ ] Agent cloning
- [ ] Agent import/export
- [x] Usage statistics view (v2.2.0)
- [x] **Real usage count statistics** (v2.3.0) - Automatically updates when sending messages
- [x] **Run and navigate feature** (v2.3.0) - Click run to navigate to Chat page and select Agent

### Display Optimization (v2.3.0)

- [x] AgentCard displays model name (instead of ID)
- [x] AgentCard displays skill names (instead of IDs)
- [x] AgentCard displays MCP server names (instead of IDs)

### MCP Integration (v2.1.0)

- [x] MCP server binding configuration
- [x] Tool call enable/disable
- [x] Tool whitelist configuration
- [x] **MCP selection optimization** (v3.0.25) - Shows associated but disabled MCPs when editing Agent, with status labels

### Import Enhancement (v3.0.25)

- [x] **Auto-create missing resources** - Automatically creates missing Skills and MCP dependencies when importing Agent
- [x] **Model missing warning** - Logs warning for missing models to prompt users to configure manually

### Permissions & Security Configuration (v2.4.0)

Inspired by Claude Code's permission model, the following features are added:

- [ ] **File system permission configuration**
  - [ ] Allowed directory list (allowedPaths)
  - [ ] Denied directory list (deniedPaths)
  - [ ] Working directory setting (workingDirectory)

- [ ] **Tool permission refinement**
  - [ ] Tool-level allow/deny rules
  - [ ] Wildcard pattern matching support (e.g., `Bash(npm run *)`)
  - [ ] Permission rule priority

- [ ] **Auto-approval rules**
  - [ ] Auto-approve file reads
  - [ ] Auto-approve file writes
  - [ ] Auto-approved command pattern list
  - [ ] Auto-approved MCP tool list

- [ ] **Context configuration**
  - [ ] Auto-loaded context files (e.g., CLAUDE.md)
  - [ ] Auto-fetched URL list

- [ ] **Execution limits**
  - [ ] Maximum tool calls per conversation
  - [ ] Tool call timeout setting
  - [ ] Maximum operable file size
  - [ ] Sandbox mode toggle

---

## Component Structure

```
Agent/
├── index.tsx              # Module entry (AgentPage)
├── AgentCard.tsx          # Agent card component
└── AgentModal.tsx         # Create/edit modal
```

**Dependencies**:
- `src/components/common/Modal.tsx` - Modal dialog
- `src/components/common/Input.tsx` - Input field
- `src/components/common/Select.tsx` - Dropdown select
- `src/components/common/Button.tsx` - Button

---

## Data Structures

### Agent

```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  skills: string[];          // Bound skill IDs
  systemPrompt: string;      // System prompt
  temperature: number;       // 0-2
  maxTokens: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  lastUsedAt?: Date;

  // MCP Integration (v2.1.0)
  mcpServers?: AgentMCPConfig[];  // Associated MCP servers
  enableToolUse?: boolean;         // Whether to enable tool calls

  // Permissions & Security Configuration (v2.4.0)
  permissions?: AgentPermissions;     // Permission configuration
  context?: AgentContext;             // Context configuration
  limits?: AgentLimits;               // Execution limits
}
```

### AgentCreateInput

```typescript
interface AgentCreateInput {
  name: string;
  description: string;
  model: string;
  skills: string[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // MCP Integration (v2.1.0)
  mcpServers?: AgentMCPConfig[];
  enableToolUse?: boolean;
  // Permissions & Security Configuration (v2.4.0)
  permissions?: AgentPermissions;
  context?: AgentContext;
  limits?: AgentLimits;
}
```

### AgentMCPConfig (v2.1.0)

```typescript
/** MCP server configuration associated with Agent */
interface AgentMCPConfig {
  serverId: string;        // MCP server ID
  serverName: string;      // Display name (for UI)
  enabledTools?: string[]; // Enabled tool list, undefined means all enabled
}
```

### AgentPermissions (v2.4.0)

```typescript
/**
 * Agent permission configuration
 * Inspired by Claude Code's .claude/settings.local.json design
 */
interface AgentPermissions {
  // ===== File System Permissions =====
  /** List of allowed directory/file paths */
  allowedPaths?: string[];
  /** List of denied directory/file paths (higher priority than allowedPaths) */
  deniedPaths?: string[];
  /** Working directory (default directory when Agent executes) */
  workingDirectory?: string;

  // ===== Tool Permission Rules =====
  /**
   * List of allowed tool/operation rules
   * Supports wildcard patterns, e.g.:
   * - "Read" - Allow all read operations
   * - "Bash(npm run *)" - Allow commands starting with npm run
   * - "Bash(git add:*)" - Allow git add commands
   * - "WebFetch(domain:github.com)" - Allow access to github.com
   */
  allow?: string[];
  /**
   * List of denied tool/operation rules (higher priority than allow)
   * Same format as allow
   */
  deny?: string[];
}
```

### AgentAutoApprove (v2.4.0)

```typescript
/**
 * Agent auto-approval rules
 * Matching operations will execute automatically without user confirmation
 */
interface AgentAutoApprove {
  /** Auto-approve file reads */
  readFiles?: boolean;
  /** Auto-approve file writes */
  writeFiles?: boolean;
  /** Auto-approved Bash command pattern list */
  bashCommands?: string[];
  /** Auto-approved MCP tool list (format: serverId:toolName or *:toolName) */
  mcpTools?: string[];
}
```

### AgentContext (v2.4.0)

```typescript
/**
 * Agent context configuration
 * Defines context information auto-loaded when Agent starts
 */
interface AgentContext {
  /**
   * List of auto-loaded file paths
   * Supports relative paths (relative to workingDirectory) and absolute paths
   * Example: ["CLAUDE.md", "docs/README.md", ".cursorrules"]
   */
  files?: string[];
  /**
   * List of auto-fetched URLs
   * Example: ["https://docs.example.com/api"]
   */
  urls?: string[];
  /**
   * Additional system instructions (appended after systemPrompt)
   */
  additionalInstructions?: string;
}
```

### AgentLimits (v2.4.0)

```typescript
/**
 * Agent execution limits
 * For security protection and resource control
 */
interface AgentLimits {
  /** Maximum tool calls per conversation (default 50) */
  maxToolCalls?: number;
  /** Single tool call timeout in seconds (default 30) */
  toolCallTimeout?: number;
  /** Maximum operable file size in bytes (default 10MB) */
  maxFileSize?: number;
  /** Whether to enable sandbox mode (restrict dangerous operations) */
  sandboxMode?: boolean;
  /** Maximum output length in characters (prevent infinite output) */
  maxOutputLength?: number;
}
```

---

## MCP Server Configuration (v2.1.0)

Agents can be configured with associated MCP servers, enabling AI to call external tools for extended capabilities.

### Configuration Flow

1. **Add MCP server**: Add and connect the server in the MCP module
2. **Bind to Agent**: Select the server to associate in the Agent edit interface
3. **Configure tool whitelist**: (Optional) Restrict tools the Agent can use
4. **Enable tool calls**: Turn on the `enableToolUse` switch

### Tool Call Flow

```
User sends message
       ↓
Check if Agent has tool calls enabled
       ↓ (yes)
Get available tools from associated MCP servers
       ↓
Send message to AI (with tools parameter)
       ↓
AI returns tool_calls
       ↓
Execute MCP tool (mcp_call_tool)
       ↓
Return results to AI
       ↓
Loop until AI returns final response (max 10 times)
```

### Notes

- Only MCP servers with `status: 'connected'` will be used
- Tool calls have a maximum count limit (10) to prevent infinite loops
- Each tool call has a 30-second timeout limit

---

## Persistence Specification (v2.2.0)

### Storage Location

| Environment | Storage Method | Path |
|-------------|---------------|------|
| Tauri (Production) | File System | `{app_data}/agents.json` |
| Browser (Development) | localStorage | `mobaus_agents` |

### Storage Service

```typescript
// src/services/storage.ts
export const agentsStorage = {
  /** Save Agent list */
  save(agents: Agent[]): Promise<void>;

  /** Load Agent list */
  load(): Promise<Agent[]>;

  /** Add a single Agent */
  add(agent: Agent): Promise<Agent[]>;

  /** Update Agent */
  update(id: string, updates: Partial<Agent>): Promise<Agent[]>;

  /** Delete Agent */
  delete(id: string): Promise<Agent[]>;
}
```

### Persisted Fields

**Fields to persist**:
- All fields defined in the Agent interface

**Date type handling**:
- On save: Automatically serialized to ISO string
- On load: Restored to Date objects using reviver function

---

## Frontend API

### App.tsx Handlers

#### `handleCreateAgent`
Create a new Agent

```typescript
const handleCreateAgent = (data: AgentCreateInput) => void
```

#### `handleUpdateAgent`
Update an existing Agent

```typescript
const handleUpdateAgent = (id: string, data: AgentCreateInput) => void
```

#### `handleDeleteAgent` (v2.2.0)
Delete an Agent

```typescript
const handleDeleteAgent = (id: string) => void
```

#### `handleToggleAgentStatus` (v2.2.0)
Toggle Agent status

```typescript
const handleToggleAgentStatus = (id: string) => void
```

---

## Test Cases

### Basic Functionality Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-01 | **Render Agent list** | agents array | Correctly display all Agent cards | [x] |
| AG-02 | **Empty list display** | agents=[] | Show "Create your first Agent" card | [x] |
| AG-03 | **Search filter** | Enter search keyword | Filter Agents by name/description | [x] |
| AG-04 | **Status filter** | Select "Active" option | Only show active status Agents | [x] |
| AG-05 | **Open create modal** | Click "Create Agent" button | Show blank form modal | [x] |
| AG-06 | **Open edit modal** | Click Agent card edit button | Show pre-filled form modal | [x] |

### Create/Edit Functionality Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-10 | **Create Agent** | Fill form and submit | New Agent added to list | [x] |
| AG-11 | **Edit Agent** | Modify form and save | Agent data updated | [x] |
| AG-12 | **Required field validation** | Submit with empty name | Button disabled or error prompt | [ ] |
| AG-13 | **Model selection** | Select a model | model field saved correctly | [x] |
| AG-14 | **Skill selection** | Check multiple skills | skills array saved correctly | [x] |
| AG-15 | **System prompt** | Enter prompt text | systemPrompt saved correctly | [x] |
| AG-16 | **Temperature setting** | Enter 0.8 | Numeric value saved correctly | [x] |
| AG-17 | **MaxTokens setting** | Enter 8192 | Numeric value saved correctly | [x] |

### Available Model Filter Tests (v3.6.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-18 | **Model selector shows only available models** | models with online/offline/error status | Only show models with status='online' | [ ] |
| AG-19 | **No available models prompt** | All models status!='online' | Show "Please configure available models first" prompt | [ ] |

### Delete Functionality Tests (v2.2.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-20 | **Delete Agent** | Click delete and confirm | Agent removed from list | [x] |
| AG-21 | **Delete confirmation dialog** | Click delete button | Show confirmation dialog | [x] |
| AG-22 | **Cancel delete** | Click cancel | Agent retained | [x] |

### Status Management Tests (v2.2.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-30 | **Activate Agent** | Click activate on inactive Agent | status becomes 'active' | [x] |
| AG-31 | **Deactivate Agent** | Click deactivate on active Agent | status becomes 'inactive' | [x] |
| AG-32 | **Status display** | Agents with different statuses | Correctly display status label colors | [x] |

### Persistence Tests (v2.2.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-40 | **Save Agent** | Create new Agent | Data persisted to storage | [x] |
| AG-41 | **Load Agent** | Refresh page | Agent data restored | [x] |
| AG-42 | **Date type restoration** | Load saved data | createdAt/updatedAt are Date objects | [x] |
| AG-43 | **MCP config persistence** | Save Agent with MCP | mcpServers correctly restored | [x] |

### MCP Integration Tests (v2.1.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-50 | **MCP toggle display** | Open Agent modal | Show MCP tool call toggle | [x] |
| AG-51 | **Enable tool calls** | Turn on MCP toggle | Show server selection list | [x] |
| AG-52 | **Server selection** | Select MCP server | Server added to mcpServers | [x] |
| AG-53 | **Show tool count** | Select server with tools | Display tool count | [x] |
| AG-54 | **No connected servers** | No connected servers | Show prompt message | [x] |

### Display Optimization Tests (v2.3.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-60 | **Display model name** | agent.model='model-1', models contains matching item | Show model name instead of ID | [x] |
| AG-61 | **Model not found fallback** | agent.model='unknown-id', models doesn't contain it | Show original ID | [x] |
| AG-62 | **Display skill names** | agent.skills=['skill-1'], skills contains matching item | Show skill name instead of ID | [x] |
| AG-63 | **Skill not found fallback** | agent.skills=['unknown'], skills doesn't contain it | Show original ID | [x] |
| AG-64 | **Multiple skills display** | agent.skills contains multiple IDs | Show all skill names | [x] |
| AG-65 | **Display MCP server name** | agent.mcpServers contains config | Show MCP server name | [x] |
| AG-66 | **No MCP servers** | agent.mcpServers empty or disabled | Show "No bound MCP" | [x] |

### Usage Statistics Tests (v2.3.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-70 | **Usage count initial value** | Newly created Agent | usageCount=0 | [x] |
| AG-71 | **Usage count increment** | Send message using Agent | usageCount +1 | [x] |
| AG-72 | **Last used time update** | Send message using Agent | lastUsedAt updated to current time | [x] |
| AG-73 | **Usage count persistence** | Restart app after use | usageCount remains unchanged | [x] |

### Run Navigation Tests (v2.3.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-80 | **Click run button** | Click Agent card run button | onRunAgent callback invoked | [x] |
| AG-81 | **Navigate to Chat page** | Run Agent | Current page switches to chat | [x] |
| AG-82 | **Create new conversation** | Run Agent | New conversation created and selected | [x] |
| AG-83 | **Set conversation Agent** | Run Agent | New conversation's agentId set to current Agent | [x] |

### Permission Configuration Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-90 | **Permission config area display** | Open Agent modal | Show "Permissions & Security" config area | [ ] |
| AG-91 | **Add allowed path** | Enter path and add | New path added to allowedPaths array | [ ] |
| AG-92 | **Delete allowed path** | Click path delete button | Path removed from allowedPaths | [ ] |
| AG-93 | **Add denied path** | Enter path and add | New path added to deniedPaths array | [ ] |
| AG-94 | **Set working directory** | Enter working directory path | workingDirectory saved correctly | [ ] |
| AG-95 | **Select directory (Tauri)** | Click select directory button | Open system directory picker | [ ] |

### Tool Permission Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-100 | **Add allow rule** | Enter "Bash(npm run *)" | Rule added to allow array | [ ] |
| AG-101 | **Add deny rule** | Enter "Bash(rm -rf *)" | Rule added to deny array | [ ] |
| AG-102 | **Rule pattern hint** | Focus on rule input | Show rule format hint | [ ] |
| AG-103 | **Preset rule quick add** | Click preset rule button | Auto-fill common rules | [ ] |
| AG-104 | **Rule validation** | Enter invalid rule format | Show format error prompt | [ ] |

### Auto-Approval Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-110 | **Auto-approve toggle** | Toggle auto-approve read files | autoApprove.readFiles updated | [ ] |
| AG-111 | **Approve command pattern** | Add "npm run *" | bashCommands array updated | [ ] |
| AG-112 | **Approve MCP tool** | Select MCP tool | mcpTools array updated | [ ] |

### Context Configuration Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-120 | **Add context file** | Enter "CLAUDE.md" | context.files array updated | [ ] |
| AG-121 | **Add context URL** | Enter URL | context.urls array updated | [ ] |
| AG-122 | **Additional instructions input** | Enter additional instructions | additionalInstructions saved | [ ] |
| AG-123 | **File path autocomplete** | Enter partial path | Show matching file suggestions | [ ] |

### Execution Limit Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-130 | **Set max tool calls** | Enter 100 | limits.maxToolCalls = 100 | [ ] |
| AG-131 | **Set timeout** | Enter 60 | limits.toolCallTimeout = 60 | [ ] |
| AG-132 | **Set max file size** | Enter 20MB | limits.maxFileSize = 20971520 | [ ] |
| AG-133 | **Sandbox mode toggle** | Enable sandbox mode | limits.sandboxMode = true | [ ] |
| AG-134 | **Limit value validation** | Enter negative number | Show error, disallow saving | [ ] |

### Permission Persistence Tests (v2.4.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AG-140 | **Save permission config** | Create Agent with permissions | permissions persisted | [ ] |
| AG-141 | **Load permission config** | Refresh page | permissions correctly restored | [ ] |
| AG-142 | **Save context config** | Create Agent with context | context persisted | [ ] |
| AG-143 | **Save limit config** | Create Agent with limits | limits persisted | [ ] |

### Permission Check Utility Function Tests (v2.4.0)

> Test file: `src/test/utils/permissionUtils.test.ts`

#### Glob Pattern Matching Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| PC-01 | **Single-level wildcard match** | pattern=`*.md`, path=`README.md` | true | [ ] |
| PC-02 | **Single-level wildcard no subdirectory match** | pattern=`/tmp/*`, path=`/tmp/sub/file.txt` | false | [ ] |
| PC-03 | **Multi-level wildcard match** | pattern=`/Users/**`, path=`/Users/xxx/a/b/c.ts` | true | [ ] |
| PC-04 | **Question mark wildcard match** | pattern=`file?.txt`, path=`file1.txt` | true | [ ] |
| PC-05 | **Exact path match** | pattern=`/tmp/test.txt`, path=`/tmp/test.txt` | true | [ ] |
| PC-06 | **Exact path no match** | pattern=`/tmp/test.txt`, path=`/tmp/other.txt` | false | [ ] |

#### Tool Rule Parsing Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| PR-01 | **Parse simple tool name** | `Read` | `{ toolName: 'Read' }` | [ ] |
| PR-02 | **Parse wildcard** | `*` | `{ toolName: '*' }` | [ ] |
| PR-03 | **Parse command condition** | `Bash(npm run *)` | `{ toolName: 'Bash', condition: 'npm run *', conditionType: 'command' }` | [ ] |
| PR-04 | **Parse domain condition** | `WebFetch(domain:github.com)` | `{ toolName: 'WebFetch', condition: 'github.com', conditionType: 'domain' }` | [ ] |
| PR-05 | **Parse path condition** | `Read(path:/tmp/*)` | `{ toolName: 'Read', condition: '/tmp/*', conditionType: 'path' }` | [ ] |

#### Tool Rule Matching Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| TM-01 | **Simple tool name match** | rule=`Read`, toolName=`Read`, args=`{}` | true | [ ] |
| TM-02 | **Simple tool name no match** | rule=`Read`, toolName=`Write`, args=`{}` | false | [ ] |
| TM-03 | **Wildcard matches all** | rule=`*`, toolName=`AnyTool`, args=`{}` | true | [ ] |
| TM-04 | **Command condition match** | rule=`Bash(npm run *)`, toolName=`Bash`, args=`{command:'npm run build'}` | true | [ ] |
| TM-05 | **Command condition no match** | rule=`Bash(npm run *)`, toolName=`Bash`, args=`{command:'rm -rf /'}` | false | [ ] |
| TM-06 | **Domain condition match** | rule=`WebFetch(domain:github.com)`, toolName=`WebFetch`, args=`{url:'https://github.com/xxx'}` | true | [ ] |
| TM-07 | **Domain condition no match** | rule=`WebFetch(domain:github.com)`, toolName=`WebFetch`, args=`{url:'https://gitlab.com/xxx'}` | false | [ ] |

#### Path Permission Check Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| PP-01 | **No config default allow** | path=`/any/path`, permissions=`{}` | allowed=true | [ ] |
| PP-02 | **allowedPaths match allows** | path=`/project/file.ts`, allowedPaths=`['/project/**']` | allowed=true | [ ] |
| PP-03 | **allowedPaths no match denies** | path=`/other/file.ts`, allowedPaths=`['/project/**']` | allowed=false | [ ] |
| PP-04 | **deniedPaths priority deny** | path=`/project/secrets/key.txt`, allowedPaths=`['/project/**']`, deniedPaths=`['/project/secrets/**']` | allowed=false | [ ] |
| PP-05 | **deniedPaths no match allows** | path=`/project/src/app.ts`, allowedPaths=`['/project/**']`, deniedPaths=`['/project/secrets/**']` | allowed=true | [ ] |

#### Tool Permission Check Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| TP-01 | **No config default allow** | toolName=`Bash`, args=`{command:'ls'}`, permissions=`{}` | allowed=true | [ ] |
| TP-02 | **allow rule match allows** | toolName=`Bash`, args=`{command:'npm run build'}`, allow=`['Bash(npm *)']` | allowed=true | [ ] |
| TP-03 | **allow rule no match denies** | toolName=`Bash`, args=`{command:'rm -rf /'}`, allow=`['Bash(npm *)']` | allowed=false | [ ] |
| TP-04 | **deny rule priority deny** | toolName=`Bash`, args=`{command:'rm -rf /'}`, allow=`['*']`, deny=`['Bash(rm *)']` | allowed=false | [ ] |
| TP-05 | **deny rule no match allows** | toolName=`Bash`, args=`{command:'npm run build'}`, allow=`['*']`, deny=`['Bash(rm *)']` | allowed=true | [ ] |

#### Auto-Approval Check Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| AA-01 | **readFiles auto-approve** | toolName=`Read`, autoApprove=`{readFiles:true}` | true | [ ] |
| AA-02 | **writeFiles auto-approve** | toolName=`Write`, autoApprove=`{writeFiles:true}` | true | [ ] |
| AA-03 | **bashCommands pattern match** | toolName=`Bash`, args=`{command:'npm run build'}`, autoApprove=`{bashCommands:['npm *']}` | true | [ ] |
| AA-04 | **bashCommands pattern no match** | toolName=`Bash`, args=`{command:'rm -rf /'}`, autoApprove=`{bashCommands:['npm *']}` | false | [ ] |
| AA-05 | **mcpTools match** | toolName=`read_file`, serverId=`fs-server`, autoApprove=`{mcpTools:['fs-server:read_file']}` | true | [ ] |
| AA-06 | **mcpTools wildcard match** | toolName=`any_tool`, serverId=`fs-server`, autoApprove=`{mcpTools:['fs-server:*']}` | true | [ ] |

#### Call Count Limit Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| CL-01 | **Under limit allows** | currentCount=`4`, maxToolCalls=`5` | exceedsCallLimit=false | [ ] |
| CL-02 | **At limit denies** | currentCount=`5`, maxToolCalls=`5` | exceedsCallLimit=true | [ ] |
| CL-03 | **No limit config allows** | currentCount=`100`, maxToolCalls=`undefined` | exceedsCallLimit=false | [ ] |

### Service Layer Pure Function Tests (agentState)

> Test file: `src/test/services/agents/agentState.test.ts`

| ID | Test Scenario | Input | Expected Output | Status |
|----|--------------|-------|----------------|--------|
| TC-AGENT-STATE-001 | createAgent - Create Agent | AgentCreateInput | New Agent added to list, default status='active' | [x] |
| TC-AGENT-STATE-002 | updateAgent - Update Agent | id + AgentCreateInput | Specified Agent fields updated | [x] |
| TC-AGENT-STATE-003 | updateAgent - MCP config preserved | No new mcpServers | Old mcpServers retained | [x] |
| TC-AGENT-STATE-004 | deleteAgent - Delete Agent | id | Specified Agent removed from list | [x] |
| TC-AGENT-STATE-005 | toggleAgentStatus - Toggle status | active Agent | status becomes inactive | [x] |
| TC-AGENT-STATE-006 | findAgent - Find existing | id | Returns corresponding Agent | [x] |
| TC-AGENT-STATE-007 | findAgent - Find non-existing | non-existing id | Returns undefined | [x] |
| TC-AGENT-STATE-008 | deleteAgent - id not found | non-existing id | List unchanged | [x] |

### Test Files

- `src/test/components/Agent/Agent.test.tsx`
- `src/test/services/agents/agentState.test.ts`

---

## Change History

| Date | Version | Change Description |
|------|---------|-------------------|
| 2026-01-18 | 1.0.0 | Initial version |
| 2026-01-20 | 2.1.0 | MCP server binding UI |
| 2026-01-20 | 2.2.0 | Delete feature + status toggle + Tauri persistence + remove mock data |
| 2026-01-23 | 2.3.0 | AgentCard display model/skill names, real usage count statistics, run navigation feature |
| 2026-01-27 | 2.4.0 | Permissions & security config: file system permissions, tool permission rules, auto-approval, context config, execution limits |
| 2026-01-27 | 3.6.0 | Available model filter: Agent edit modal model selector only shows models with status='online' |
| 2026-01-28 | 3.0.25 | 1) MCP selection optimization: show associated but disabled MCPs when editing Agent with status labels; 2) Import enhancement: auto-create missing Skills and MCP dependency resources |
| 2026-01-29 | 2.4.1 | Permission check implementation: add permissionUtils utility functions, usePermissionCheck Hook, integrate into useMCPTools |
| 2026-03-05 | 4.2.0 | Extract agentState pure functions: createAgent, updateAgent, deleteAgent, toggleAgentStatus, findAgent |

---

## Implementation Details

### AgentPage Component

```tsx
// src/components/features/Agent/index.tsx
interface AgentPageProps {
  agents: Agent[];
  models: AIModel[];
  skills: Skill[];
  mcpServers: MCPServer[];
  onCreateAgent: (data: AgentCreateInput) => void;
  onUpdateAgent: (id: string, data: AgentCreateInput) => void;
  onDeleteAgent: (id: string) => void;           // v2.2.0
  onToggleStatus: (id: string) => void;          // v2.2.0
  onRunAgent: (id: string) => void;
}
```

### AgentCard Component (v2.3.0)

```tsx
// src/components/features/Agent/AgentCard.tsx
interface AgentCardProps {
  agent: Agent;
  models: AIModel[];              // v2.3.0: For displaying model name
  skills: Skill[];                // v2.3.0: For displaying skill names
  onEdit: () => void;
  onDelete: () => void;           // v2.2.0
  onToggleStatus: () => void;     // v2.2.0
  onRun: () => void;
}
```

**v2.3.0 Display optimization notes**:
- `models` list is used to look up and display model name by `agent.model` (ID)
- `skills` list is used to look up and display skill names by `agent.skills` (ID array)
- If corresponding model/skill is not found, falls back to displaying the original ID

### Delete Confirmation Dialog (v2.2.0)

```tsx
<Modal
  isOpen={!!deleteConfirmAgent}
  onClose={() => setDeleteConfirmAgent(null)}
  title="Delete Agent"
>
  <p>Are you sure you want to delete Agent "{deleteConfirmAgent?.name}"? This action cannot be undone.</p>
  <div className="flex justify-end gap-3">
    <Button variant="secondary" onClick={() => setDeleteConfirmAgent(null)}>
      Cancel
    </Button>
    <Button variant="danger" onClick={handleConfirmDelete}>
      Delete
    </Button>
  </div>
</Modal>
```

---

<a id="中文"></a>

## 模块概述

Agent模块提供智能代理的创建、配置和管理功能，允许用户定制专属AI助手。参考 Claude Code 的设计，支持细粒度的权限控制和自动化配置。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Agent` |
| 存储服务 | `src/services/storage.ts` |
| 创建日期 | 2026-01-18 |
| 最后更新 | 2026-01-27 |

---

## 功能列表

### 核心功能

- [x] Agent列表展示
- [x] 创建新Agent
- [x] 编辑Agent配置
- [x] 删除Agent (v2.2.0)
- [x] Agent状态管理（激活/停用）(v2.2.0)
- [x] 模型选择配置
- [x] 技能绑定配置
- [x] 系统提示词设置
- [x] **数据持久化** (v2.2.0)
  - [x] Tauri 文件系统持久化
  - [x] localStorage 回退支持

### 扩展功能

- [ ] Agent克隆
- [ ] Agent导入/导出
- [x] 使用统计查看 (v2.2.0)
- [x] **真实使用次数统计** (v2.3.0) - 发送消息时自动更新
- [x] **运行跳转功能** (v2.3.0) - 点击运行跳转到 Chat 页面并选择 Agent

### 显示优化 (v2.3.0)

- [x] AgentCard 显示模型名字（而非ID）
- [x] AgentCard 显示技能名字（而非ID）
- [x] AgentCard 显示 MCP 服务器名字（而非ID）

### MCP 集成 (v2.1.0)

- [x] MCP 服务器绑定配置
- [x] 工具调用启用/禁用
- [x] 工具白名单配置
- [x] **MCP 选择优化** (v3.0.25) - 编辑 Agent 时显示已关联但未启用的 MCP，并标记状态

### 导入增强 (v3.0.25)

- [x] **自动创建缺失资源** - 导入 Agent 时自动创建缺失的 Skills 和 MCP 依赖
- [x] **模型缺失警告** - 对于缺失的模型，记录警告日志提示用户手动配置

### 权限与安全配置 (v2.4.0)

参考 Claude Code 的权限模型，新增以下功能：

- [ ] **文件系统权限配置**
  - [ ] 允许访问的目录列表 (allowedPaths)
  - [ ] 禁止访问的目录列表 (deniedPaths)
  - [ ] 工作目录设置 (workingDirectory)

- [ ] **工具权限细化**
  - [ ] 工具级别的允许/禁止规则
  - [ ] 支持通配符模式匹配 (如 `Bash(npm run *)`)
  - [ ] 权限规则优先级

- [ ] **自动批准规则**
  - [ ] 自动批准读取文件
  - [ ] 自动批准写入文件
  - [ ] 自动批准的命令模式列表
  - [ ] 自动批准的 MCP 工具列表

- [ ] **上下文配置**
  - [ ] 自动加载的上下文文件 (如 CLAUDE.md)
  - [ ] 自动获取的 URL 列表

- [ ] **执行限制**
  - [ ] 单次对话最大工具调用次数
  - [ ] 工具调用超时设置
  - [ ] 最大可操作文件大小
  - [ ] 沙箱模式开关

---

## 组件结构

```
Agent/
├── index.tsx              # 模块入口 (AgentPage)
├── AgentCard.tsx          # Agent卡片组件
└── AgentModal.tsx         # 创建/编辑弹窗
```

**依赖组件**:
- `src/components/common/Modal.tsx` - 模态框
- `src/components/common/Input.tsx` - 输入框
- `src/components/common/Select.tsx` - 下拉选择
- `src/components/common/Button.tsx` - 按钮

---

## 数据结构

### Agent

```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  skills: string[];          // 绑定的技能ID
  systemPrompt: string;      // 系统提示词
  temperature: number;       // 0-2
  maxTokens: number;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  lastUsedAt?: Date;

  // MCP 集成 (v2.1.0)
  mcpServers?: AgentMCPConfig[];  // 关联的 MCP 服务器
  enableToolUse?: boolean;         // 是否启用工具调用

  // 权限与安全配置 (v2.4.0)
  permissions?: AgentPermissions;     // 权限配置
  context?: AgentContext;             // 上下文配置
  limits?: AgentLimits;               // 执行限制
}
```

### AgentCreateInput

```typescript
interface AgentCreateInput {
  name: string;
  description: string;
  model: string;
  skills: string[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // MCP 集成 (v2.1.0)
  mcpServers?: AgentMCPConfig[];
  enableToolUse?: boolean;
  // 权限与安全配置 (v2.4.0)
  permissions?: AgentPermissions;
  context?: AgentContext;
  limits?: AgentLimits;
}
```

### AgentMCPConfig (v2.1.0)

```typescript
/** Agent 关联的 MCP 服务器配置 */
interface AgentMCPConfig {
  serverId: string;        // MCP 服务器 ID
  serverName: string;      // 显示名称 (用于 UI)
  enabledTools?: string[]; // 启用的工具列表，undefined 表示全部启用
}
```

### AgentPermissions (v2.4.0)

```typescript
/**
 * Agent 权限配置
 * 参考 Claude Code 的 .claude/settings.local.json 设计
 */
interface AgentPermissions {
  // ===== 文件系统权限 =====
  /** 允许访问的目录/文件路径列表 */
  allowedPaths?: string[];
  /** 禁止访问的目录/文件路径列表（优先级高于 allowedPaths） */
  deniedPaths?: string[];
  /** 工作目录（Agent 执行时的默认目录） */
  workingDirectory?: string;

  // ===== 工具权限规则 =====
  /**
   * 允许的工具/操作规则列表
   * 支持通配符模式，如：
   * - "Read" - 允许所有读取操作
   * - "Bash(npm run *)" - 允许 npm run 开头的命令
   * - "Bash(git add:*)" - 允许 git add 命令
   * - "WebFetch(domain:github.com)" - 允许访问 github.com
   */
  allow?: string[];
  /**
   * 禁止的工具/操作规则列表（优先级高于 allow）
   * 格式同 allow
   */
  deny?: string[];
}
```

### AgentAutoApprove (v2.4.0)

```typescript
/**
 * Agent 自动批准规则
 * 匹配的操作将自动执行，无需用户确认
 */
interface AgentAutoApprove {
  /** 自动批准读取文件 */
  readFiles?: boolean;
  /** 自动批准写入文件 */
  writeFiles?: boolean;
  /** 自动批准的 Bash 命令模式列表 */
  bashCommands?: string[];
  /** 自动批准的 MCP 工具列表（格式：serverId:toolName 或 *:toolName） */
  mcpTools?: string[];
}
```

### AgentContext (v2.4.0)

```typescript
/**
 * Agent 上下文配置
 * 定义 Agent 启动时自动加载的上下文信息
 */
interface AgentContext {
  /**
   * 自动加载的文件路径列表
   * 支持相对路径（相对于 workingDirectory）和绝对路径
   * 示例：["CLAUDE.md", "docs/README.md", ".cursorrules"]
   */
  files?: string[];
  /**
   * 自动获取的 URL 列表
   * 示例：["https://docs.example.com/api"]
   */
  urls?: string[];
  /**
   * 额外的系统指令（追加到 systemPrompt 之后）
   */
  additionalInstructions?: string;
}
```

### AgentLimits (v2.4.0)

```typescript
/**
 * Agent 执行限制
 * 用于安全防护和资源控制
 */
interface AgentLimits {
  /** 单次对话最大工具调用次数（默认 50） */
  maxToolCalls?: number;
  /** 单次工具调用超时时间（秒，默认 30） */
  toolCallTimeout?: number;
  /** 最大可操作文件大小（字节，默认 10MB） */
  maxFileSize?: number;
  /** 是否启用沙箱模式（限制危险操作） */
  sandboxMode?: boolean;
  /** 最大输出长度（字符数，防止无限输出） */
  maxOutputLength?: number;
}
```

---

## MCP 服务器配置 (v2.1.0)

Agent 可以配置关联的 MCP 服务器，使 AI 能够调用外部工具扩展能力。

### 配置流程

1. **添加 MCP 服务器**: 在 MCP 模块中添加并连接服务器
2. **绑定到 Agent**: 在 Agent 编辑界面选择要关联的服务器
3. **配置工具白名单**: (可选) 限制 Agent 可使用的工具
4. **启用工具调用**: 开启 `enableToolUse` 开关

### 工具调用流程

```
用户发送消息
       ↓
检查 Agent 是否启用工具调用
       ↓ (是)
获取关联 MCP 服务器的可用工具
       ↓
发送消息给 AI (附带 tools 参数)
       ↓
AI 返回 tool_calls
       ↓
执行 MCP 工具 (mcp_call_tool)
       ↓
将结果返回给 AI
       ↓
循环直到 AI 返回最终回复 (最多 10 次)
```

### 注意事项

- 只有 `status: 'connected'` 的 MCP 服务器才会被使用
- 工具调用有最大次数限制 (10次) 防止无限循环
- 每次工具调用有 30 秒超时限制

---

## 持久化规范 (v2.2.0)

### 存储位置

| 环境 | 存储方式 | 路径 |
|------|---------|------|
| Tauri (生产) | 文件系统 | `{app_data}/agents.json` |
| 浏览器 (开发) | localStorage | `mobaus_agents` |

### 存储服务

```typescript
// src/services/storage.ts
export const agentsStorage = {
  /** 保存 Agent 列表 */
  save(agents: Agent[]): Promise<void>;

  /** 加载 Agent 列表 */
  load(): Promise<Agent[]>;

  /** 添加单个 Agent */
  add(agent: Agent): Promise<Agent[]>;

  /** 更新 Agent */
  update(id: string, updates: Partial<Agent>): Promise<Agent[]>;

  /** 删除 Agent */
  delete(id: string): Promise<Agent[]>;
}
```

### 持久化字段

**需要持久化的字段**：
- 所有 Agent 接口定义的字段

**Date 类型处理**：
- 保存时：自动序列化为 ISO 字符串
- 加载时：使用 reviver 函数还原为 Date 对象

---

## 前端接口

### App.tsx Handlers

#### `handleCreateAgent`
创建新 Agent

```typescript
const handleCreateAgent = (data: AgentCreateInput) => void
```

#### `handleUpdateAgent`
更新现有 Agent

```typescript
const handleUpdateAgent = (id: string, data: AgentCreateInput) => void
```

#### `handleDeleteAgent` (v2.2.0)
删除 Agent

```typescript
const handleDeleteAgent = (id: string) => void
```

#### `handleToggleAgentStatus` (v2.2.0)
切换 Agent 状态

```typescript
const handleToggleAgentStatus = (id: string) => void
```

---

## 测试用例

### 基础功能测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-01 | **渲染 Agent 列表** | agents 数组 | 正确显示所有 Agent 卡片 | [x] |
| AG-02 | **空列表显示** | agents=[] | 显示"创建第一个 Agent"卡片 | [x] |
| AG-03 | **搜索过滤** | 输入搜索关键词 | 按名称/描述过滤 Agent | [x] |
| AG-04 | **状态筛选** | 选择"活跃"选项 | 只显示 active 状态的 Agent | [x] |
| AG-05 | **打开创建弹窗** | 点击"创建 Agent"按钮 | 显示空白表单弹窗 | [x] |
| AG-06 | **打开编辑弹窗** | 点击 Agent 卡片编辑按钮 | 显示预填充表单弹窗 | [x] |

### 创建/编辑功能测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-10 | **创建 Agent** | 填写表单并提交 | 列表新增 Agent | [x] |
| AG-11 | **编辑 Agent** | 修改表单并保存 | Agent 数据更新 | [x] |
| AG-12 | **必填字段验证** | 名称为空提交 | 按钮禁用或提示错误 | [ ] |
| AG-13 | **模型选择** | 选择模型 | 正确保存 model 字段 | [x] |
| AG-14 | **技能选择** | 勾选多个技能 | 正确保存 skills 数组 | [x] |
| AG-15 | **系统提示词** | 输入提示词 | 正确保存 systemPrompt | [x] |
| AG-16 | **Temperature 设置** | 输入 0.8 | 正确保存数值 | [x] |
| AG-17 | **MaxTokens 设置** | 输入 8192 | 正确保存数值 | [x] |

### 可用模型筛选测试 (v3.6.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-18 | **模型选择器仅显示可用模型** | models 包含 online/offline/error 状态 | 仅显示 status='online' 的模型 | [ ] |
| AG-19 | **无可用模型提示** | 所有模型 status!='online' | 显示"请先配置可用模型"提示 | [ ] |

### 删除功能测试 (v2.2.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-20 | **删除 Agent** | 点击删除并确认 | Agent 从列表移除 | [x] |
| AG-21 | **删除确认对话框** | 点击删除按钮 | 显示确认对话框 | [x] |
| AG-22 | **取消删除** | 点击取消 | Agent 保留 | [x] |

### 状态管理测试 (v2.2.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-30 | **激活 Agent** | inactive Agent 点击激活 | status 变为 'active' | [x] |
| AG-31 | **停用 Agent** | active Agent 点击停用 | status 变为 'inactive' | [x] |
| AG-32 | **状态显示** | 不同状态 Agent | 正确显示状态标签颜色 | [x] |

### 持久化测试 (v2.2.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-40 | **保存 Agent** | 创建新 Agent | 数据持久化到存储 | [x] |
| AG-41 | **加载 Agent** | 刷新页面 | Agent 数据恢复 | [x] |
| AG-42 | **Date 类型恢复** | 加载保存的数据 | createdAt/updatedAt 为 Date 对象 | [x] |
| AG-43 | **MCP 配置持久化** | 保存带 MCP 的 Agent | mcpServers 正确恢复 | [x] |

### MCP 集成测试 (v2.1.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-50 | **MCP 开关显示** | 打开 Agent 弹窗 | 显示 MCP 工具调用开关 | [x] |
| AG-51 | **启用工具调用** | 开启 MCP 开关 | 显示服务器选择列表 | [x] |
| AG-52 | **服务器选择** | 选择 MCP 服务器 | 服务器加入 mcpServers | [x] |
| AG-53 | **显示工具数量** | 选择有工具的服务器 | 显示工具数量 | [x] |
| AG-54 | **无已连接服务器** | 无 connected 服务器 | 显示提示信息 | [x] |

### 显示优化测试 (v2.3.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-60 | **显示模型名字** | agent.model='model-1', models包含对应项 | 显示模型名字而非ID | [x] |
| AG-61 | **模型未找到回退** | agent.model='unknown-id', models不包含 | 显示原始ID | [x] |
| AG-62 | **显示技能名字** | agent.skills=['skill-1'], skills包含对应项 | 显示技能名字而非ID | [x] |
| AG-63 | **技能未找到回退** | agent.skills=['unknown'], skills不包含 | 显示原始ID | [x] |
| AG-64 | **多技能显示** | agent.skills包含多个ID | 显示所有技能名字 | [x] |
| AG-65 | **显示 MCP 服务器名字** | agent.mcpServers包含配置 | 显示 MCP 服务器名字 | [x] |
| AG-66 | **无 MCP 服务器** | agent.mcpServers为空或未启用 | 显示"无绑定 MCP" | [x] |

### 使用统计测试 (v2.3.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-70 | **使用次数初始值** | 新创建的 Agent | usageCount=0 | [x] |
| AG-71 | **使用次数递增** | 使用 Agent 发送消息 | usageCount +1 | [x] |
| AG-72 | **最后使用时间更新** | 使用 Agent 发送消息 | lastUsedAt 更新为当前时间 | [x] |
| AG-73 | **使用次数持久化** | 使用后重启应用 | usageCount 保持不变 | [x] |

### 运行跳转测试 (v2.3.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-80 | **点击运行按钮** | 点击 Agent 卡片运行按钮 | 调用 onRunAgent 回调 | [x] |
| AG-81 | **跳转到 Chat 页面** | 运行 Agent | 当前页面切换到 chat | [x] |
| AG-82 | **创建新对话** | 运行 Agent | 创建新对话并选中 | [x] |
| AG-83 | **设置对话 Agent** | 运行 Agent | 新对话的 agentId 设为当前 Agent | [x] |

### 权限配置测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-90 | **权限配置区域显示** | 打开 Agent 弹窗 | 显示"权限与安全"配置区域 | [ ] |
| AG-91 | **添加允许路径** | 输入路径并添加 | allowedPaths 数组新增路径 | [ ] |
| AG-92 | **删除允许路径** | 点击路径删除按钮 | 路径从 allowedPaths 移除 | [ ] |
| AG-93 | **添加禁止路径** | 输入路径并添加 | deniedPaths 数组新增路径 | [ ] |
| AG-94 | **设置工作目录** | 输入工作目录路径 | workingDirectory 正确保存 | [ ] |
| AG-95 | **选择目录（Tauri）** | 点击选择目录按钮 | 打开系统目录选择器 | [ ] |

### 工具权限测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-100 | **添加允许规则** | 输入 "Bash(npm run *)" | allow 数组新增规则 | [ ] |
| AG-101 | **添加禁止规则** | 输入 "Bash(rm -rf *)" | deny 数组新增规则 | [ ] |
| AG-102 | **规则模式提示** | 聚焦规则输入框 | 显示规则格式提示 | [ ] |
| AG-103 | **预设规则快捷添加** | 点击预设规则按钮 | 自动填充常用规则 | [ ] |
| AG-104 | **规则验证** | 输入无效规则格式 | 显示格式错误提示 | [ ] |

### 自动批准测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-110 | **自动批准开关** | 切换自动批准读取文件 | autoApprove.readFiles 更新 | [ ] |
| AG-111 | **批准命令模式** | 添加 "npm run *" | bashCommands 数组新增 | [ ] |
| AG-112 | **批准 MCP 工具** | 选择 MCP 工具 | mcpTools 数组新增 | [ ] |

### 上下文配置测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-120 | **添加上下文文件** | 输入 "CLAUDE.md" | context.files 数组新增 | [ ] |
| AG-121 | **添加上下文 URL** | 输入 URL | context.urls 数组新增 | [ ] |
| AG-122 | **额外指令输入** | 输入额外指令 | additionalInstructions 保存 | [ ] |
| AG-123 | **文件路径自动补全** | 输入部分路径 | 显示匹配的文件建议 | [ ] |

### 执行限制测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-130 | **设置最大工具调用** | 输入 100 | limits.maxToolCalls = 100 | [ ] |
| AG-131 | **设置超时时间** | 输入 60 | limits.toolCallTimeout = 60 | [ ] |
| AG-132 | **设置最大文件大小** | 输入 20MB | limits.maxFileSize = 20971520 | [ ] |
| AG-133 | **沙箱模式开关** | 开启沙箱模式 | limits.sandboxMode = true | [ ] |
| AG-134 | **限制值验证** | 输入负数 | 显示错误，不允许保存 | [ ] |

### 权限持久化测试 (v2.4.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AG-140 | **保存权限配置** | 创建带权限的 Agent | permissions 持久化 | [ ] |
| AG-141 | **加载权限配置** | 刷新页面 | permissions 正确恢复 | [ ] |
| AG-142 | **保存上下文配置** | 创建带上下文的 Agent | context 持久化 | [ ] |
| AG-143 | **保存限制配置** | 创建带限制的 Agent | limits 持久化 | [ ] |

### 权限检查工具函数测试 (v2.4.0)

> 测试文件: `src/test/utils/permissionUtils.test.ts`

#### Glob 模式匹配测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| PC-01 | **单层通配符匹配** | pattern=`*.md`, path=`README.md` | true | [ ] |
| PC-02 | **单层通配符不匹配子目录** | pattern=`/tmp/*`, path=`/tmp/sub/file.txt` | false | [ ] |
| PC-03 | **多层通配符匹配** | pattern=`/Users/**`, path=`/Users/xxx/a/b/c.ts` | true | [ ] |
| PC-04 | **问号通配符匹配** | pattern=`file?.txt`, path=`file1.txt` | true | [ ] |
| PC-05 | **精确路径匹配** | pattern=`/tmp/test.txt`, path=`/tmp/test.txt` | true | [ ] |
| PC-06 | **精确路径不匹配** | pattern=`/tmp/test.txt`, path=`/tmp/other.txt` | false | [ ] |

#### 工具规则解析测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| PR-01 | **解析简单工具名** | `Read` | `{ toolName: 'Read' }` | [ ] |
| PR-02 | **解析通配符** | `*` | `{ toolName: '*' }` | [ ] |
| PR-03 | **解析命令条件** | `Bash(npm run *)` | `{ toolName: 'Bash', condition: 'npm run *', conditionType: 'command' }` | [ ] |
| PR-04 | **解析域名条件** | `WebFetch(domain:github.com)` | `{ toolName: 'WebFetch', condition: 'github.com', conditionType: 'domain' }` | [ ] |
| PR-05 | **解析路径条件** | `Read(path:/tmp/*)` | `{ toolName: 'Read', condition: '/tmp/*', conditionType: 'path' }` | [ ] |

#### 工具规则匹配测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| TM-01 | **简单工具名匹配** | rule=`Read`, toolName=`Read`, args=`{}` | true | [ ] |
| TM-02 | **简单工具名不匹配** | rule=`Read`, toolName=`Write`, args=`{}` | false | [ ] |
| TM-03 | **通配符匹配所有** | rule=`*`, toolName=`AnyTool`, args=`{}` | true | [ ] |
| TM-04 | **命令条件匹配** | rule=`Bash(npm run *)`, toolName=`Bash`, args=`{command:'npm run build'}` | true | [ ] |
| TM-05 | **命令条件不匹配** | rule=`Bash(npm run *)`, toolName=`Bash`, args=`{command:'rm -rf /'}` | false | [ ] |
| TM-06 | **域名条件匹配** | rule=`WebFetch(domain:github.com)`, toolName=`WebFetch`, args=`{url:'https://github.com/xxx'}` | true | [ ] |
| TM-07 | **域名条件不匹配** | rule=`WebFetch(domain:github.com)`, toolName=`WebFetch`, args=`{url:'https://gitlab.com/xxx'}` | false | [ ] |

#### 路径权限检查测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| PP-01 | **无配置默认允许** | path=`/any/path`, permissions=`{}` | allowed=true | [ ] |
| PP-02 | **allowedPaths 匹配允许** | path=`/project/file.ts`, allowedPaths=`['/project/**']` | allowed=true | [ ] |
| PP-03 | **allowedPaths 不匹配拒绝** | path=`/other/file.ts`, allowedPaths=`['/project/**']` | allowed=false | [ ] |
| PP-04 | **deniedPaths 优先拒绝** | path=`/project/secrets/key.txt`, allowedPaths=`['/project/**']`, deniedPaths=`['/project/secrets/**']` | allowed=false | [ ] |
| PP-05 | **deniedPaths 不匹配允许** | path=`/project/src/app.ts`, allowedPaths=`['/project/**']`, deniedPaths=`['/project/secrets/**']` | allowed=true | [ ] |

#### 工具权限检查测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| TP-01 | **无配置默认允许** | toolName=`Bash`, args=`{command:'ls'}`, permissions=`{}` | allowed=true | [ ] |
| TP-02 | **allow 规则匹配允许** | toolName=`Bash`, args=`{command:'npm run build'}`, allow=`['Bash(npm *)']` | allowed=true | [ ] |
| TP-03 | **allow 规则不匹配拒绝** | toolName=`Bash`, args=`{command:'rm -rf /'}`, allow=`['Bash(npm *)']` | allowed=false | [ ] |
| TP-04 | **deny 规则优先拒绝** | toolName=`Bash`, args=`{command:'rm -rf /'}`, allow=`['*']`, deny=`['Bash(rm *)']` | allowed=false | [ ] |
| TP-05 | **deny 规则不匹配允许** | toolName=`Bash`, args=`{command:'npm run build'}`, allow=`['*']`, deny=`['Bash(rm *)']` | allowed=true | [ ] |

#### 自动批准检查测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| AA-01 | **readFiles 自动批准** | toolName=`Read`, autoApprove=`{readFiles:true}` | true | [ ] |
| AA-02 | **writeFiles 自动批准** | toolName=`Write`, autoApprove=`{writeFiles:true}` | true | [ ] |
| AA-03 | **bashCommands 模式匹配** | toolName=`Bash`, args=`{command:'npm run build'}`, autoApprove=`{bashCommands:['npm *']}` | true | [ ] |
| AA-04 | **bashCommands 模式不匹配** | toolName=`Bash`, args=`{command:'rm -rf /'}`, autoApprove=`{bashCommands:['npm *']}` | false | [ ] |
| AA-05 | **mcpTools 匹配** | toolName=`read_file`, serverId=`fs-server`, autoApprove=`{mcpTools:['fs-server:read_file']}` | true | [ ] |
| AA-06 | **mcpTools 通配符匹配** | toolName=`any_tool`, serverId=`fs-server`, autoApprove=`{mcpTools:['fs-server:*']}` | true | [ ] |

#### 调用次数限制测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| CL-01 | **未超限允许** | currentCount=`4`, maxToolCalls=`5` | exceedsCallLimit=false | [ ] |
| CL-02 | **达到上限拒绝** | currentCount=`5`, maxToolCalls=`5` | exceedsCallLimit=true | [ ] |
| CL-03 | **无限制配置允许** | currentCount=`100`, maxToolCalls=`undefined` | exceedsCallLimit=false | [ ] |

### 服务层纯函数测试 (agentState)

> 测试文件: `src/test/services/agents/agentState.test.ts`

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| TC-AGENT-STATE-001 | createAgent - 创建 Agent | AgentCreateInput | 列表新增 Agent，默认 status='active' | [x] |
| TC-AGENT-STATE-002 | updateAgent - 更新 Agent | id + AgentCreateInput | 指定 Agent 字段更新 | [x] |
| TC-AGENT-STATE-003 | updateAgent - MCP 配置保留 | 无新 mcpServers | 保留旧 mcpServers | [x] |
| TC-AGENT-STATE-004 | deleteAgent - 删除 Agent | id | 指定 Agent 从列表移除 | [x] |
| TC-AGENT-STATE-005 | toggleAgentStatus - 切换状态 | active 的 Agent | status 变为 inactive | [x] |
| TC-AGENT-STATE-006 | findAgent - 查找存在 | id | 返回对应 Agent | [x] |
| TC-AGENT-STATE-007 | findAgent - 查找不存在 | 不存在的 id | 返回 undefined | [x] |
| TC-AGENT-STATE-008 | deleteAgent - id 不存在 | 不存在的 id | 列表不变 | [x] |

### 测试文件

- `src/test/components/Agent/Agent.test.tsx`
- `src/test/services/agents/agentState.test.ts`

---

## 修改历史

| 日期 | 版本 | 修改内容 |
|------|------|---------|
| 2026-01-18 | 1.0.0 | 初始版本 |
| 2026-01-20 | 2.1.0 | MCP 服务器绑定 UI |
| 2026-01-20 | 2.2.0 | 删除功能 + 状态切换 + Tauri 持久化 + 移除 Mock 数据 |
| 2026-01-23 | 2.3.0 | AgentCard 显示模型/技能名字、真实使用次数统计、运行跳转功能 |
| 2026-01-27 | 2.4.0 | 权限与安全配置：文件系统权限、工具权限规则、自动批准、上下文配置、执行限制 |
| 2026-01-27 | 3.6.0 | 可用模型筛选：Agent 编辑弹窗的模型选择器仅显示 status='online' 的可用模型 |
| 2026-01-28 | 3.0.25 | 1) MCP 选择优化：编辑 Agent 时显示已关联但未启用的 MCP，并标记状态；2) 导入增强：自动创建缺失的 Skills 和 MCP 依赖资源 |
| 2026-01-29 | 2.4.1 | 权限检查实现：添加 permissionUtils 工具函数、usePermissionCheck Hook，集成到 useMCPTools |
| 2026-03-05 | 4.2.0 | 抽取 agentState 纯函数：createAgent、updateAgent、deleteAgent、toggleAgentStatus、findAgent |

---

## 实现细节

### AgentPage 组件

```tsx
// src/components/features/Agent/index.tsx
interface AgentPageProps {
  agents: Agent[];
  models: AIModel[];
  skills: Skill[];
  mcpServers: MCPServer[];
  onCreateAgent: (data: AgentCreateInput) => void;
  onUpdateAgent: (id: string, data: AgentCreateInput) => void;
  onDeleteAgent: (id: string) => void;           // v2.2.0
  onToggleStatus: (id: string) => void;          // v2.2.0
  onRunAgent: (id: string) => void;
}
```

### AgentCard 组件 (v2.3.0)

```tsx
// src/components/features/Agent/AgentCard.tsx
interface AgentCardProps {
  agent: Agent;
  models: AIModel[];              // v2.3.0: 用于显示模型名字
  skills: Skill[];                // v2.3.0: 用于显示技能名字
  onEdit: () => void;
  onDelete: () => void;           // v2.2.0
  onToggleStatus: () => void;     // v2.2.0
  onRun: () => void;
}
```

**v2.3.0 显示优化说明**:
- `models` 列表用于根据 `agent.model` (ID) 查找并显示模型名字
- `skills` 列表用于根据 `agent.skills` (ID数组) 查找并显示技能名字
- 如果未找到对应的 model/skill，则回退显示原始 ID

### 删除确认对话框 (v2.2.0)

```tsx
<Modal
  isOpen={!!deleteConfirmAgent}
  onClose={() => setDeleteConfirmAgent(null)}
  title="删除 Agent"
>
  <p>确定要删除 Agent「{deleteConfirmAgent?.name}」吗？此操作不可撤销。</p>
  <div className="flex justify-end gap-3">
    <Button variant="secondary" onClick={() => setDeleteConfirmAgent(null)}>
      取消
    </Button>
    <Button variant="danger" onClick={handleConfirmDelete}>
      删除
    </Button>
  </div>
</Modal>
```
