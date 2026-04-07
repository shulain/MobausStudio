# Config Sync (Config Switcher)

MobausStudio is not only a standalone AI client but can also sync your AI provider and MCP configurations to other supported third-party tools (such as CLI tools), enabling centralized configuration management.

## What is Config Sync?

When using third-party command-line tools (such as Claude Code, Gemini CLI, OpenCode, etc.), you typically need to manually enter API Keys or configure MCP services in each tool's configuration file.

With MobausStudio's **Config Sync** feature, you can directly export your already-connected and verified AI provider credentials to these third-party tools with one click, eliminating the hassle of repeated configuration.

---

## Supported Tools

Currently, MobausStudio supports exporting configurations to the following tools:

- **Claude Code**: Anthropic's official CLI tool
- **OpenCode**: Powerful open-source AI coding assistant
- **OpenClaw**: CLI AI agent
- **Gemini CLI**: Google's Gemini command-line tool
- **Codex**: Related AI tools

---

## How to Use Config Sync

### 1. Open the Config Sync Page

Click the "**Config Sync**" icon in the sidebar (the icon may be located near settings depending on your current theme and version) or navigate to the Config Sync page from the relevant entry point.

### 2. Select the Tool to Configure

On the left side (or top), select the third-party tool you want to sync configurations to (e.g., `claude-code`).

### 3. Select Provider

The interface will list all currently connected **AI providers** that are compatible with the selected tool:
1. Click the provider you want to sync (e.g., Anthropic, or a custom provider compatible with OpenAI protocol)
2. Click "**Sync to this tool**" or "**Enable**"

### 4. Confirm Sync

The system will automatically generate a configuration file compatible with the selected tool (such as `.claude.json` or corresponding environment variable configuration) and write it to the tool's designated configuration directory. The interface will display the export path and status.

---

## Syncing MCP Configuration

When the target tool supports MCP (Model Context Protocol), MobausStudio will also write your enabled MCP server list to the tool's configuration.

This means you only need to configure MCP servers once in MobausStudio, and all supported command-line tools can automatically reuse these powerful capabilities.

---

## FAQ

### Why doesn't the tool work after syncing?
Some command-line tools cache their configuration at runtime. After syncing, it's recommended to restart the tool or open a new terminal window.

### What if I exported the wrong configuration?
Simply go back to the Config Sync page, select the correct provider, and sync again. The new configuration will overwrite the old one.

---

## Next Steps

- [Provider Management](./providers.md) - Configure more AI providers
- [MCP Services](./mcp.md) - Expand AI tool capabilities
