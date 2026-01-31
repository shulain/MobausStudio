# FAQ

## Installation Issues

### macOS: "Cannot be opened because the developer cannot be verified"

This is macOS's security mechanism (Gatekeeper). Solution:

1. Open "System Preferences" → "Security & Privacy" → "General"
2. Click "Open Anyway"
3. Or run in terminal:
   ```bash
   xattr -cr /Applications/MobausStudio.app
   ```

### Windows: "Windows protected your PC"

This is Windows SmartScreen protection:

1. Click "More info"
2. Click "Run anyway"

### Linux: AppImage won't run

Make sure execute permission is added:

```bash
chmod +x MobausStudio_*.AppImage
```

If it still won't run, FUSE might be missing:

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```

---

## Provider & Authentication Issues

### How to connect AI services?

MobausStudio supports two connection methods:

**Method 1: OAuth Login (Recommended)**

1. Click the "Providers" icon in the sidebar
2. Find providers that support OAuth (OpenAI, Anthropic, Google, GitHub Copilot)
3. Click "Connect", select "OAuth Login"
4. Complete authorization in browser

**Method 2: API Key**

1. Click the "Providers" icon in the sidebar
2. Find the provider you want to connect, click "Connect"
3. Select "API Key" method
4. Enter your API Key

### What are the requirements for OAuth login?

| Provider | Required Subscription |
|----------|----------------------|
| OpenAI | ChatGPT Plus or Pro subscription |
| Anthropic | Claude Pro or Max subscription |
| Google AI | Google account (free) |
| GitHub Copilot | GitHub Copilot subscription |

### What to do if OAuth authorization fails?

1. **Check browser**: Make sure browser isn't blocking popups
2. **Check network**: Ensure network connection is stable
3. **Manual copy link**: If auto-redirect fails, try manually copying the authorization link to browser
4. **Check subscription status**: Confirm your subscription is still active

### What to do if API Key is invalid?

1. **Check copy**: Confirm Key is copied completely without extra spaces
2. **Check validity**: Confirm Key hasn't expired or been revoked
3. **Check balance**: Confirm account has sufficient balance
4. **Check permissions**: Some Keys may have usage restrictions

### How to get an API Key?

On the provider connection page, click "Get API Key" link to go to the provider's website:

| Provider | Website |
|----------|---------|
| OpenAI | platform.openai.com |
| Anthropic | console.anthropic.com |
| Google AI | aistudio.google.com |
| DeepSeek | platform.deepseek.com |

### Why do I need to add models after connecting a provider?

Providers and models are managed separately:

- **Provider**: Manages authentication credentials (API Key or OAuth Token)
- **Model**: Configures which specific model to use and its parameters

After connecting a provider, you need to add specific model configurations in the "Models" page to use them.

---

## Usage Issues

### Which AI models are supported?

MobausStudio supports 15+ AI service providers:

**Popular Providers:**

- OpenAI (GPT-4o, GPT-4, GPT-3.5, o1, etc.)
- Anthropic (Claude 3.5, Claude 3 series)
- Google AI (Gemini 2.0, Gemini 1.5 series)
- DeepSeek (DeepSeek Chat, Reasoner)
- GitHub Copilot
- OpenRouter

**Other Providers:**

- Groq, xAI, Mistral, Cohere, Together AI, Fireworks AI, Perplexity, Cerebras

**Local Services:**

- Ollama, LM Studio

### Where are chat records saved?

- **Desktop**: Saved in local app data directory
  - macOS: `~/Library/Application Support/MobausStudio/`
  - Windows: `%APPDATA%\MobausStudio\`
  - Linux: `~/.config/MobausStudio/`
- **Web**: Saved in browser localStorage

### How to export chat records?

1. Click the "Settings" icon in the sidebar
2. Select "Data Management"
3. Click "Export Configuration"
4. Check "Chat Records"
5. Click "Export"

### How to backup all data?

1. Click "Settings" → "Data Management" → "Export Configuration"
2. Check all options (Model configs, Agents, Skills, MCP servers, Chat records)
3. Click "Export" to save the file

### How to migrate to a new computer?

1. Export configuration file on the old computer
2. Install MobausStudio on the new computer
3. Click "Settings" → "Data Management" → "Import Configuration"
4. Select the previously exported file

---

## Agent Issues

### What's the difference between an Agent and direct chat?

| Feature | Direct Chat | Agent |
|---------|-------------|-------|
| System Prompt | None | Customizable |
| Skill Binding | None | Supported |
| MCP Tools | None | Supported |
| Permission Control | None | Supported |

### Why is the MCP server list empty?

You need to add and connect MCP servers in the MCP page first. Only connected servers will appear in the Agent configuration.

### Are Agent permission settings required?

No, they're not required. Permission settings are optional advanced features used to restrict the agent's operational scope and improve security.

---

## Network Issues

### API request timeout

Possible causes and solutions:

1. **Unstable network**: Check network connection
2. **API provider rate limiting**: Try again later
3. **Proxy settings issue**: Check system proxy configuration
4. **Request too long**: Reduce input content or lower Max Tokens

### Cannot connect to API

1. Confirm provider is connected (shows green "Connected" status)
2. Confirm model configuration is correct
3. Check if proxy configuration is needed
4. Confirm API account has sufficient balance

---

## MCP Issues

### MCP server won't start

1. Confirm Node.js is installed (run `node -v` to check)
2. Confirm npx command is available
3. Check if server configuration is correct
4. Check error logs

### MCP tool call failed

1. Confirm server is running (shows green status)
2. Confirm permission configuration is correct
3. Check if path exists
4. Check detailed error message

---

## Update Issues

### How to check for updates?

- **Desktop**: Auto-checks on startup, or manually in Settings → About
- **Web/Docker**: Manual update required

### Auto-update failed

1. Check network connection
2. Try manually downloading and installing the latest version
3. Check app logs for detailed error info

---

## Docker Issues

### Cannot access after container starts

1. Confirm container is running: `docker ps`
2. Confirm port mapping is correct: `docker port mobaus-studio`
3. Check firewall settings
4. Check container logs: `docker logs mobaus-studio`

### How to update Docker image?

```bash
# Pull latest image
docker pull ghcr.io/shulain/mobausstudio:latest

# Stop and remove old container
docker stop mobaus-studio
docker rm mobaus-studio

# Start new container
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
```

---

## Other Issues

### How to report bugs or suggestions?

Please submit an Issue on GitHub: [https://github.com/shulain/MobausStudio/issues](https://github.com/shulain/MobausStudio/issues)

Please include:

- OS and version
- MobausStudio version
- Problem description and steps to reproduce
- Related screenshots or logs

### Is it open source?

Yes, MobausStudio uses MIT License.

### Is my data secure?

- All data is stored locally and never uploaded to any server
- Only API requests are sent to the corresponding AI service providers
- API Keys and OAuth Tokens are stored in local configuration files

---

## Didn't find an answer?

If the above content didn't solve your problem:

1. Search [existing Issues](https://github.com/shulain/MobausStudio/issues)
2. Submit a new [Issue](https://github.com/shulain/MobausStudio/issues/new)
