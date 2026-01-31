# UI Overview

MobausStudio uses a clean and intuitive interface design. This article introduces each functional area.

## Overall Layout

```
┌──────────────────────────────────────────────────────────────┐
│  MobausStudio                                    [─] [□] [×] │
├────────┬─────────────────────────────────────────────────────┤
│        │  ┌─────────────────────────────────────────────┐    │
│  Side  │  │                                             │    │
│  bar   │  │              Main Content Area              │    │
│        │  │                                             │    │
│  Nav   │  │         Displays chat, settings, etc.       │    │
│        │  │                                             │    │
│        │  │                                             │    │
│        │  └─────────────────────────────────────────────┘    │
│        ├─────────────────────────────────────────────────────┤
│        │  [Input area]                              [Send]   │
└────────┴─────────────────────────────────────────────────────┘
```

---

## Sidebar

The sidebar is on the left side of the interface, providing quick access to main features:

### Main Navigation

| Icon | Function | Description |
|------|----------|-------------|
| 💬 | Chat | AI chat interface |
| 🤖 | Agents | Agent management, create and configure AI assistants |
| 🧩 | Skills | Preset prompt templates |
| 🔌 | MCP | MCP service management |
| 🔗 | Providers | AI service provider connection management |
| 🖥️ | Models | AI model configuration and management |

### Bottom Actions

| Icon | Function | Description |
|------|----------|-------------|
| 📊 | Stats | Usage statistics |
| ⚙️ | Settings | App configuration |

Click an icon to switch to the corresponding feature page.

---

## Chat Interface

### Chat List

The left side shows historical chat list:

- Click a chat to switch
- Click `+` to create new chat
- Right-click to delete or rename

### Message Area

The middle area displays chat content:

- **User messages**: Displayed on the right
- **AI replies**: Displayed on the left, supports Markdown rendering
- **Code blocks**: Syntax highlighting, one-click copy

### Input Area

Bottom input box:

- Enter message and press `Enter` to send
- `Shift + Enter` for new line
- Supports pasting images (some models support)

### Model Selection

You can select different AI models at the top.

---

## Feature Pages

### Providers Page (Standalone)

Click "🔗 Providers" in the sidebar to connect AI service providers:

- View all supported providers (15+)
- One-click OAuth login (OpenAI, Anthropic, Google, GitHub)
- API Key connection method
- View connection status and available model count
- Search and filter providers

### Models Page (Standalone)

Click "🖥️ Models" in the sidebar to configure AI models:

- Add/edit/delete model configurations
- Select models from connected providers
- Set model parameters (temperature, max tokens, etc.)
- Test model connection status

### Agents Page (Standalone)

Click "🤖 Agents" in the sidebar to manage AI assistants:

- Create custom Agents
- Configure system prompts
- Bind skills and MCP tools
- Run Agent to start conversation

### MCP Page (Standalone)

Click "🔌 MCP" in the sidebar to manage MCP server connections:

- Add/remove servers
- View connection status and tool list
- Configure stdio/HTTP transport
- Set auto-start

### Settings Page

Click "⚙️ Settings" in the sidebar:

- General: Theme switch (light/dark), language settings
- Data Management: Import/export configuration
- About: Version info, check for updates, open source license

---

## Quick Operations

### Message Operations

Hovering over a message shows action buttons:

- 📋 Copy content

### Code Block Operations

Top-right of code blocks provides:

- 📋 Copy code
- Language type display

---

## Themes

MobausStudio supports light and dark themes:

- **Light theme**: Suitable for daytime use
- **Dark theme**: Suitable for nighttime use, reduces eye strain

Switch themes in "Settings" → "General".

---

## Next Steps

- [Provider Management](./providers.md) - Connect AI service providers
- [Chat](./chat.md) - Learn more about chat features
- [Model Configuration](./models.md) - Configure AI models
