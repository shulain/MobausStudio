# Data Management

Learn how MobausStudio stores data and how to backup and manage your data.

## Data Storage Location

### Desktop App

MobausStudio stores data in the system app data directory:

| System | Path |
|--------|------|
| macOS | `~/Library/Application Support/MobausStudio/` |
| Windows | `%APPDATA%\MobausStudio\` |
| Linux | `~/.config/MobausStudio/` |

### Web Version

Web version data is stored in browser localStorage.

---

## Data Contents

### Stored Data

| Data Type | Description |
|-----------|-------------|
| Chat records | Message history of all conversations |
| Settings | Model config (including API keys), MCP config, etc. |
| Skills data | Custom skills |
| App state | Window size, theme, etc. |

> ⚠️ **Security Note**: API keys are stored in local config files. Keep your device secure and don't share config files with others.

---

## Backup Data

### Manual Backup

1. Close MobausStudio
2. Copy entire data directory to safe location

```bash
# macOS
cp -r ~/Library/Application\ Support/MobausStudio ~/Backup/

# Windows (PowerShell)
Copy-Item -Recurse $env:APPDATA\MobausStudio C:\Backup\

# Linux
cp -r ~/.config/MobausStudio ~/Backup/
```

### Restore Backup

1. Close MobausStudio
2. Copy backup directory back to original location
3. Restart app

---

## Import/Export Configuration

MobausStudio supports importing and exporting app configuration for easy backup and migration.

### Export Configuration

1. Click the "⚙️ Settings" icon in the sidebar
2. Select "Data Management"
3. Click "Export Configuration"
4. Select content to export:
   - **Model Configuration**: AI model settings (including API Keys)
   - **Agents**: Custom AI assistants
   - **Skills**: Custom skills
   - **MCP Servers**: MCP configuration
   - **Chat Records**: All conversation history
5. Click "Export", choose save location

> ⚠️ **Security Note**: Export files contain sensitive information like API keys. Keep them safe.

### Import Configuration

1. Click the "⚙️ Settings" icon in the sidebar
2. Select "Data Management"
3. Click "Import Configuration"
4. Select previously exported configuration file
5. Choose import options:
   - **Merge**: Merge with existing data
   - **Overwrite**: Replace existing data
6. Click "Import"

---

## Export Conversations

### Single Conversation

1. Open conversation to export
2. Click "Export" in menu
3. Choose export format (Markdown / JSON)

### Batch Export

Batch export is not currently supported. This feature is under development.

---

## Clear Data

### Clear Single Conversation

Right-click conversation, select "Delete".

### Clear All Data

> ⚠️ This operation is irreversible, please backup important data first!

1. Close MobausStudio
2. Delete data directory
3. Restart app

```bash
# macOS
rm -rf ~/Library/Application\ Support/MobausStudio

# Windows (PowerShell)
Remove-Item -Recurse $env:APPDATA\MobausStudio

# Linux
rm -rf ~/.config/MobausStudio
```

---

## Data Security

### API Key Storage

API keys are stored in local config files (saved with model configuration):

- **macOS**: `~/Library/Application Support/MobausStudio/models.json`
- **Windows**: `%APPDATA%\MobausStudio\models.json`
- **Linux**: `~/.config/MobausStudio/models.json`

> ⚠️ **Security Tip**: Don't share config files with others to avoid API key leakage.

### Local Data

- Chat data is stored locally, not uploaded to any server
- Only API requests are sent to corresponding AI providers

### Recommendations

1. Regularly backup important conversations
2. Don't enter sensitive info (like passwords) in conversations
3. Use strong password to protect your system account
4. Don't share data directory with others

---

## Data Migration

### Migrate to New Computer

1. Backup data directory on old computer
2. Install MobausStudio on new computer
3. Close app, copy backup to new computer's data directory
4. Restart app
5. API keys will migrate with configuration

### Cross-Platform Migration

Data format is cross-platform compatible, can be copied directly.

---

## Next Steps

- [Auto Update](./auto-update.md) - Learn about update mechanism
- [FAQ](../faq.md) - View FAQ
