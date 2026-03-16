# Settings

Customize the app's appearance, language, and manage data backups in the Settings page.

## Open Settings

Click the "⚙️ Settings" icon at the bottom of the sidebar.

---

## General Settings

### Appearance

Three display modes are supported:

| Mode | Description |
|------|-------------|
| Light Mode | White background, suitable for daytime use |
| Dark Mode | Dark background, suitable for nighttime or low-light environments |
| Follow System | Automatically follows the operating system's theme settings |

### Language

Supported interface languages:

- 简体中文 (Simplified Chinese)
- English (US)

The system language is automatically detected on first launch. The interface takes effect immediately after switching languages.

---

## Data Management

### Backup & Restore

You can export or import all configuration data, including:

- Conversation history
- Roundtable meeting records
- Agent configurations
- Skill configurations
- MCP server configurations
- Model configurations
- Application settings

#### Export Configuration

1. Click "Export Configuration"
2. Check the items you want to export
3. Click "Export", the file will be saved locally

#### Import Configuration

1. Click "Import Configuration"
2. Drag and drop or select a previously exported configuration file (.json)
3. Choose whether to "Merge with existing configuration" (keep current settings, only add new content)
4. Optionally "Backup before import" (recommended)
5. Click "Start Import"

> 💡 It's recommended to export configurations regularly as backups to prevent data loss.

### Storage Space

Displays the current local storage usage, including all conversation history and cache files.

To free up space, click "Clear All Data".

> ⚠️ Clearing data will permanently delete all local data and cannot be recovered. Please ensure you have backed up important data.

---

## About

View the current version number, check for updates, developer information, and license.

### Check for Updates

Click the "Check for Updates" button. If a new version is available, you'll be prompted to download and install it. The desktop version supports automatic updates.

---

## Related Features

- [Data Management](../advanced/data-management.md) - More detailed data storage information
- [Auto Update](../advanced/auto-update.md) - Application update mechanism
