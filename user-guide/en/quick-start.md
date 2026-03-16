# Quick Start

This guide will help you get started with MobausStudio in 5 minutes.

---

## Step 1: Connect AI Provider

After launching MobausStudio for the first time, you need to connect an AI service provider.

### Method 1: OAuth Login (Recommended)

If you have a ChatGPT Plus/Pro, Claude Pro/Max, or GitHub Copilot subscription:

1. Click the **🔗 Providers** icon in the sidebar
2. Find the corresponding provider (e.g., OpenAI, Anthropic, GitHub Copilot)
3. Click "Connect", select "OAuth Login"
4. Complete authorization in the browser
5. After successful authorization, you'll be returned to the app automatically

### Method 2: API Key

If you have an API Key:

1. Click the **🔗 Providers** icon in the sidebar
2. Find the corresponding provider, click "Connect"
3. Select "API Key" method
4. Enter your API Key, click "Connect"

> 💡 **Tip**: If you don't have an API key yet, click the "Get API Key" link to visit the provider's website.

---

## Step 2: Add Model

After connecting a provider, add the model you want to use:

1. Click the **🖥️ Models** icon in the sidebar
2. Click "Add Model"
3. Select the connected provider
4. Select a specific model (e.g., GPT-4o, Claude 3.5 Sonnet)
5. Click "Save"

---

## Step 3: Start Chatting

1. Click the **💬 Chat** icon in the sidebar
2. Enter your question in the input box at the bottom
3. Press `Enter` or click the send button
4. Wait for AI response

### Chat Tips

- **Multi-turn conversation**: AI remembers context, you can have continuous conversations
- **New chat**: Click `+` button to start a new conversation
- **Switch models**: You can switch different AI models at the top of the chat interface

---

## Step 4: Explore More Features

### Agents (Optional)

Create your own AI assistants:

1. Click the **🤖 Agents** icon
2. Create a new agent, configure system prompts
3. Bind skills and MCP tools

### MCP Services (Optional)

MCP (Model Context Protocol) allows AI to connect to external tools and services:

1. Click the **🔌 MCP** icon
2. Add MCP server configuration
3. In conversations, AI will be able to use these tools

### Skills System (Optional)

Skills are predefined prompt templates that help you quickly complete specific tasks:

1. Click the **🧩 Skills** icon
2. Browse available skills
3. Click to use, automatically fill in prompts

---

## Interface Overview

```text
┌─────────────────────────────────────────────────────┐
│  MobausStudio                              [─][□][×]│
├─────┬───────────────────────────────────────────────┤
│     │                                               │
│ 💬  │   Chat Content Area                           │
│ 🤖  │                                               │
│ 🧩  │   Displays AI replies and your messages       │
│ 🔌  │                                               │
│ 🔗  │                                               │
│ 🖥️  │                                               │
│     ├───────────────────────────────────────────────┤
│ 📊  │  [Enter message...]                   [Send]  │
│ ⚙️  │                                               │
└─────┴───────────────────────────────────────────────┘
  Sidebar                  Main Content Area

Sidebar icons:
💬 Chat  🤖 Agents  🧩 Skills  🔌 MCP  🔗 Providers  🖥️ Models  📊 Stats  ⚙️ Settings
```

---

## Common Shortcuts

| Shortcut | Function |
|----------|----------|
| `Enter` | Send message |
| `Shift + Enter` | New line (don't send) |

See more at [Keyboard Shortcuts](./advanced/shortcuts.md)

---

## Having Issues?

- Check [FAQ](./faq.md)
- [Submit an Issue](https://github.com/shulain/MobausStudio/issues)

---

## Next Steps

- [Provider Management](./features/providers.md) - Learn more connection methods
- [UI Overview](./features/ui-overview.md) - Learn more about the interface
- [Model Configuration](./features/models.md) - Configure more AI models
- [MCP Services](./features/mcp.md) - Connect external tools
