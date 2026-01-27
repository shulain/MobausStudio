# Quick Start

This guide will help you get started with MobausStudio in 5 minutes.

---

## Step 1: Configure AI Model

After launching MobausStudio for the first time, you need to configure at least one AI model to start chatting.

1. Click the **🖥️ Models** icon in the sidebar
2. Click **Add Model**
3. Add your API key:
   - **OpenAI**: Enter your OpenAI API Key
   - **Anthropic**: Enter your Claude API Key
   - **Other compatible models**: Configure custom API endpoint

> 💡 **Tip**: If you don't have an API key yet, visit the respective provider's website to apply.

---

## Step 2: Start Chatting

1. Click the **💬 Chat** icon in the sidebar
2. Enter your question in the input box at the bottom
3. Press `Enter` or click the send button
4. Wait for AI response

### Chat Tips

- **Multi-turn conversation**: AI remembers context, you can have continuous conversations
- **New chat**: Click `+` button to start a new conversation
- **Switch models**: You can switch different AI models at the top of the chat interface

---

## Step 3: Explore More Features

### MCP Services (Optional)

MCP (Model Context Protocol) allows AI to connect to external tools and services:

1. Go to **Settings** → **MCP Configuration**
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
│ 🖥️  │                                               │
│     ├───────────────────────────────────────────────┤
│ 📊  │  [Enter message...]                   [Send]  │
│ ⚙️  │                                               │
└─────┴───────────────────────────────────────────────┘
  Sidebar                  Main Content Area

Sidebar icons:
💬 Chat  🤖 Agents  🧩 Skills  🔌 MCP  🖥️ Models  📊 Stats  ⚙️ Settings
```

---

## Common Shortcuts

| Shortcut | Function |
|----------|----------|
| `Enter` | Send message |
| `Shift + Enter` | New line (don't send) |
| `Ctrl/Cmd + N` | New chat |
| `Ctrl/Cmd + ,` | Open settings |

See more at [Keyboard Shortcuts](./advanced/shortcuts.md)

---

## Having Issues?

- Check [FAQ](./faq.md)
- [Submit an Issue](https://github.com/shulain/MobausStudio/issues)

---

## Next Steps

- [UI Overview](./features/ui-overview.md) - Learn more about the interface
- [Model Configuration](./features/models.md) - Configure more AI models
- [MCP Services](./features/mcp.md) - Connect external tools
