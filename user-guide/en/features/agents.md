# Agents

Agents are one of the core features of MobausStudio, allowing you to create personalized AI assistants with specific behaviors and capabilities.

## What is an Agent?

Agent = AI Model + System Prompt + Skills + MCP Tools + Permission Settings

Simply put, an Agent is a "customized AI assistant". You can:
- Give it a name and description
- Choose which AI model to use
- Define its role and behavior rules (system prompt)
- Assign specific skills
- Enable MCP tools (like reading/writing files, querying databases)
- Configure permission restrictions for safety

---

## Creating an Agent

### Step 1: Go to Agents Page

Click the "Agents" icon (workflow icon) in the sidebar.

### Step 2: Click Create

Click the "Create Agent" button in the top right, or click the dashed card with the + icon.

### Step 3: Fill in Basic Information

| Field | Description | Example |
|-------|-------------|---------|
| Name | Give your agent a name | Code Assistant, Translation Expert |
| Description | Brief description of purpose | Helps review and optimize code |
| Model | Select the AI model to use | GPT-4o, Claude 3.5 Sonnet |

### Step 4: Configure System Prompt

The system prompt defines the agent's "persona" and behavior rules. For example:

```
You are a professional code review assistant.
- Carefully analyze the code provided by the user
- Point out potential bugs and security issues
- Provide optimization suggestions
- Reply in English
```

> 💡 **Tip**: A good system prompt helps the agent better understand your needs.

### Step 5: Select Skills (Optional)

Skills are preset prompt templates. When selected, their prompts are automatically injected into the system prompt.

1. View available skills in the "Configure Skills" section
2. Check the skills you need
3. Preview the skill's prompt content

### Step 6: Save

Click the "Create Agent" button to complete creation.

---

## Advanced Settings

### Temperature

Controls the randomness of responses:
- **0**: Most deterministic, suitable for code and factual Q&A
- **0.7**: Balanced (default)
- **1+**: More creative, suitable for creative writing

### Max Tokens

Limits the maximum length of responses:
- Short answers: 500-1000
- Detailed explanations: 2000-4000
- Long-form content: 4000+

---

## MCP Tool Configuration

Enable your agent to use external tools like reading/writing files, executing commands, etc.

### Enable MCP Tools

1. When creating/editing an agent, find the "MCP Tool Calling" section
2. Toggle the switch to enable
3. Select the MCP servers to use

### Prerequisites

- You need to add and connect MCP servers in the MCP page first
- Only connected servers will appear in the list

### Use Cases

| Scenario | Required MCP Server |
|----------|---------------------|
| Read/write project files | filesystem |
| Query database | sqlite |
| Operate GitHub | github |

---

## Permissions & Security Settings

For safety, you can restrict the agent's operational permissions.

### File System Permissions

| Setting | Description |
|---------|-------------|
| Working Directory | Agent's default working directory |
| Allowed Paths | Can only access these directories |
| Denied Paths | Cannot access these directories |

> 💡 **Tip**: Desktop version allows clicking the folder icon to select directories directly.

### Tool Permission Rules

Use rule patterns to control what operations the agent can perform:

**Allowed operations examples:**
- `Read` - Allow reading files
- `Bash(npm run *)` - Allow npm commands
- `Bash(git *)` - Allow git commands
- `WebSearch` - Allow web search

**Denied operations examples:**
- `Bash(rm -rf *)` - Deny delete commands
- `Bash(shutdown *)` - Deny shutdown commands

### Auto Approve

Certain operations can be set to execute automatically without confirmation:

| Option | Description |
|--------|-------------|
| Auto approve read files | No confirmation needed for reading files |
| Auto approve write files | No confirmation needed for writing files |
| Auto approve command patterns | Matching commands execute automatically |

> ⚠️ **Warning**: Auto approve reduces security. Use with caution.

### Execution Limits

| Setting | Description | Default |
|---------|-------------|---------|
| Max Tool Calls | Maximum tool calls per conversation | 50 |
| Tool Call Timeout | Timeout for each tool call (seconds) | 30 |
| Max File Size | Maximum file size to process (MB) | 10 |
| Sandbox Mode | Execute in isolated environment | Off |

---

## Context Configuration

Have the agent automatically load specific context information on startup.

### Auto-load Files

Specify files the agent automatically reads on startup, such as:
- `CLAUDE.md` - Project specification file
- `README.md` - Project documentation

### Auto-fetch URLs

Specify web pages the agent automatically fetches on startup, such as:
- API documentation URLs
- Reference material links

### Additional Instructions

Extra instructions appended after the system prompt.

---

## Managing Agents

### View Agent List

On the Agents page, you can see all created agent cards showing:
- Name and description
- Model used
- Number of bound skills
- Number of MCP tools
- Status (enabled/disabled)

### Search and Filter

- Use the search box to search by name or description
- Use the status filter to view enabled/disabled agents

### Edit Agent

Click the "Edit" button on the agent card, modify settings, and save.

### Delete Agent

Click the "Delete" button on the agent card and confirm deletion.

> ⚠️ Deletion cannot be undone. Please proceed with caution.

### Enable/Disable

Click the toggle switch on the agent card to temporarily disable an agent.

---

## Running an Agent

### Start Conversation

Click the "Run" button on the agent card, which will automatically:
1. Create a new conversation
2. Apply the agent's configuration
3. Navigate to the chat page

### Using in Conversation

After running an agent, the conversation will automatically use:
- The agent's configured model
- The agent's system prompt
- The agent's bound skills
- The agent's MCP tools

---

## Usage Examples

### Example 1: Code Review Assistant

**Configuration:**
- Name: Code Review Assistant
- Model: GPT-4o
- System Prompt:
  ```
  You are a professional code review expert.
  Please carefully analyze the code provided and give suggestions on:
  1. Code quality and readability
  2. Potential bugs and security issues
  3. Performance optimization suggestions
  4. Best practice recommendations
  ```
- Skills: Code Review, Code Optimization

### Example 2: Project Development Assistant

**Configuration:**
- Name: Project Dev Assistant
- Model: Claude 3.5 Sonnet
- MCP Tools: filesystem (project directory)
- Permissions:
  - Working Directory: `/Users/xxx/projects/myapp`
  - Allow reading files
  - Allow executing `npm run *`, `git *`
- Context Files: `CLAUDE.md`, `README.md`

### Example 3: Translation Expert

**Configuration:**
- Name: Translation Expert
- Model: GPT-4o
- System Prompt:
  ```
  You are a professional translation expert, fluent in Chinese-English translation.
  When translating, please note:
  1. Maintain the tone and style of the original text
  2. Use accurate professional terminology
  3. Ensure the translation is natural and fluent
  ```
- Skills: Translation

---

## FAQ

### What's the difference between an Agent and direct chat?

Direct chat uses default settings, while Agents can:
- Preset system prompts to define AI's role
- Bind skills to auto-inject prompt templates
- Use MCP tools to extend AI capabilities
- Configure permissions for safety

### Why is the MCP server list empty?

You need to add and connect MCP servers in the MCP page first. Only connected servers will appear.

### Are permission settings required?

No, they're not required. Permission settings are optional advanced features used to restrict the agent's operational scope and improve security.

---

## Next Steps

- [Skills System](./skills.md) - Learn how to use and create skills
- [MCP Services](./mcp.md) - Learn how to configure MCP tools
- [Chat Features](./chat.md) - Learn more about chat features
