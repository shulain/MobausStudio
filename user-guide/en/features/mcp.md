# MCP Services

MCP (Model Context Protocol) is a protocol that allows AI models to connect to external tools and services. Through MCP, AI can access file systems, databases, APIs, and more.

## What is MCP?

MCP allows AI models to:

- 📁 Read and write files
- 🗄️ Query databases
- 🌐 Call external APIs
- 🔧 Execute specific tools

This greatly extends AI's capabilities, enabling it to complete more complex tasks.

---

## Configure MCP Server

### 1. Open MCP Page

Click the "MCP" icon in the sidebar to enter the MCP management page.

### 2. Add Server

Click "Add Server", fill in configuration:

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/folder"]
}
```

### 3. Enable Server

After adding, click the toggle to enable the server.

---

## Common MCP Servers

### File System

Allows AI to read and write files in specified directory:

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/you/projects"]
}
```

### SQLite Database

Allows AI to query SQLite database:

```json
{
  "name": "sqlite",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/path/to/database.db"]
}
```

### GitHub

Allows AI to operate GitHub repositories:

```json
{
  "name": "github",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "your-github-token"
  }
}
```

### More Servers

Visit [MCP Servers](https://github.com/modelcontextprotocol/servers) to see more official and community servers.

---

## Using MCP Tools

### In Conversation

After configuring MCP servers, AI will automatically recognize available tools. You can directly request in conversation:

> "Please read the contents of /projects/readme.md file"

> "Query the number of all users in the database"

> "Create a new Issue in my GitHub repository"

### Tool Confirmation

When AI needs to use a tool, it will display tool call information. Some sensitive operations may require your confirmation.

---

## Security Considerations

### Permission Control

- Only grant AI necessary permissions
- File system server only opens needed directories
- Database only grants read-only permission (if write not needed)

### Sensitive Information

- Don't hardcode sensitive info in MCP configuration
- Use environment variables to store API keys
- Regularly rotate access tokens

### Audit Logs

Recommend enabling logging to track AI's tool usage.

---

## Troubleshooting

### Server Won't Start

1. Confirm Node.js is installed
2. Confirm npx command is available
3. Check if server configuration is correct
4. View error logs

### Tool Call Failed

1. Confirm server is running
2. Confirm permissions are configured correctly
3. Check if path exists
4. View detailed error message

### Connection Timeout

1. Check network connection
2. Increase timeout configuration
3. Confirm server is responding normally

---

## Next Steps

- [Skills System](./skills.md) - Use preset prompt templates
- [Keyboard Shortcuts](../advanced/shortcuts.md) - Improve efficiency
