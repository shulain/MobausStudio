# Chat

Chat is the core feature of MobausStudio. This article introduces how to efficiently chat with AI.

## Basic Chat

### Send Message

1. Enter your question or instruction in the input box at the bottom
2. Press `Enter` or click the send button
3. Wait for AI response

### Upload Attachments & Multimodal

You can upload images or videos during a chat. MobausStudio fully supports multimodal image processing (requires a model that supports vision capabilities):

1. Click the 📎 button next to the input box
2. Select the image (common formats supported) or video file to upload
3. The file will appear in the preview area above the input box
4. Click the × on the top-right corner of the preview to remove it

> 💡 **Tip**: Maximum file size is 10MB. Vision-capable models can "see" and analyze the content of your uploaded images.

### Multi-turn Conversation

AI remembers the context of the current conversation, you can:

- Ask follow-up questions
- Request modifications or additions
- Continue discussion based on previous replies

### New Chat

Click the `+` button in the sidebar to start a new chat. New chats don't carry previous context.

---

## Using Agent Chat

### Start from Agent

1. Go to the "Agents" page
2. Click the "Run" button on the agent card
3. A new chat is automatically created with the agent's configuration applied

### Agent Info in Chat

When chatting with an agent, the top bar shows:

- Current agent name
- Model configured for the agent
- MCP tool connection status (if enabled)

### MCP Tool Status

If the agent has MCP tools enabled, the chat header shows connection status:

| Status | Description |
|--------|-------------|
| 🟢 All Connected | All MCP servers are connected |
| 🟡 Partially Connected | Some MCP servers are not connected |
| 🔴 Connection Error | MCP server connection failed |

> 💡 **Tip**: Click the status badge to view detailed status of each MCP server.

---

## Roundtable Meeting

Roundtable Meeting is a special chat mode that allows multiple agents to collaborate on discussing the same topic.

### Start a Roundtable Meeting

1. Click the "Roundtable Meeting" button on the chat page
2. Select agents to participate in the discussion
3. Set the discussion topic
4. Start the meeting

For detailed instructions, see [Roundtable Meeting](./roundtable.md).

---

## Chat Management

### Chat List

All chats are displayed in the left list:

- Latest chats at the top
- Click to switch between chats
- Chats are auto-saved

### Rename Chat

1. Right-click on chat
2. Select "Rename"
3. Enter new name

### Delete Chat

1. Right-click on chat
2. Select "Delete"
3. Confirm deletion

> ⚠️ Cannot be recovered after deletion, please be careful.

---

## Message Operations

### Stop Generation

When AI is generating a long response, you can click the "⏹️ Stop" button in the input area at any time to interrupt the generation process.

### View Thinking Process

Some models that support deep reasoning (such as DeepSeek Reasoner, o1/o3 series, certain Google models) will think before giving a formal answer. The interface clearly shows this internal "thinking" content, and you can click to expand and view the AI's reasoning process.

### Copy Message

Click the copy icon next to the message, or select text and copy.

---

## Markdown Support

AI replies support Markdown format rendering:

### Text Formatting

- **Bold**, *italic*, ~~strikethrough~~
- Headings, lists, quotes

### Code

- Inline code: `code`
- Code blocks: with syntax highlighting

### Others

- Tables
- Links
- Images (if AI returns image links)

---

## Code Block Features

When AI returns code:

1. **Syntax highlighting**: Auto-detects language and highlights
2. **One-click copy**: Click copy button at top-right of code block
3. **Language label**: Shows code language type

---

## Model Switching

### Switch During Chat

You can select different AI models at the top of the chat interface:

- After switching, new messages will use the new model
- Historical messages are not affected

### Different Model Characteristics

| Model | Characteristics |
|-------|-----------------|
| GPT-4 | Powerful, suitable for complex tasks |
| GPT-3.5 | Fast, suitable for simple conversations |
| Claude | Strong long text processing capability |

---

## Usage Tips

### 1. Clear Questions

Provide enough context and specific requirements for better AI answers.

**Bad question**:
> Help me write code

**Good question**:
> Please write a Python function that takes a list and returns the even numbers, using list comprehension

### 2. Step-by-Step Questions

Complex tasks can be broken down into multiple steps:

1. First describe overall requirements
2. Gradually refine each part
3. Finally integrate

### 3. Request Specific Format

If you need specific output format, tell AI clearly:

- "Please show in table format"
- "Please use Markdown format"
- "Please list in bullet points"

### 4. Iterative Optimization

If the answer is not satisfactory:

- Point out specific issues
- Request modifications to specific parts
- Provide more context

---

## Next Steps

- [Provider Management](./providers.md) - Connect more AI services
- [Model Configuration](./models.md) - Configure more AI models
- [MCP Services](./mcp.md) - Let AI use external tools
