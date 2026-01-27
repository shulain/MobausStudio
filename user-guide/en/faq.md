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

## Usage Issues

### How to configure API keys?

1. Click the "Settings" icon in the sidebar
2. Select "Model Configuration"
3. Enter the API key for the provider

### Which AI models are supported?

MobausStudio supports:

- OpenAI (GPT-4, GPT-3.5, etc.)
- Anthropic (Claude series)
- Other OpenAI-compatible APIs

### Where are chat records saved?

- **Desktop**: Saved in local app data directory
  - macOS: `~/Library/Application Support/MobausStudio/`
  - Windows: `%APPDATA%\MobausStudio\`
  - Linux: `~/.config/MobausStudio/`
- **Web**: Saved in browser localStorage

### How to export chat records?

Currently you can export by copying chat content. Full export feature is under development.

---

## Network Issues

### API request timeout

Possible causes and solutions:

1. **Unstable network**: Check network connection
2. **API provider rate limiting**: Try again later
3. **Proxy settings issue**: Check system proxy configuration

### Cannot connect to API

1. Confirm API key is correct
2. Confirm API endpoint address is correct
3. Check if proxy configuration is needed
4. Confirm API account has sufficient balance

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

MobausStudio uses MIT License.

---

## Didn't find an answer?

If the above content didn't solve your problem:

1. Search [existing Issues](https://github.com/shulain/MobausStudio/issues)
2. Submit a new [Issue](https://github.com/shulain/MobausStudio/issues/new)
