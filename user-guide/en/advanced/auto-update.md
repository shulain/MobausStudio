# Auto Update

MobausStudio desktop app has built-in auto-update functionality to ensure you always use the latest version.

## Update Mechanism

### Automatic Check

The app automatically checks for new versions on startup.

### Update Process

1. **Detect update**: App connects to update server to check version
2. **Download update**: Downloads update package in background
3. **Prompt to install**: Prompts user to install after download completes
4. **Install and restart**: Installs and restarts app after user confirms

---

## Manual Check

To check for updates immediately:

1. Click "Settings" → "About"
2. Click "Check for Updates" button
3. If a new version is available, follow the prompts

---

## Update Notifications

### When New Version Available

The app will show an update prompt including:

- New version number
- Update content summary
- "Update Now" and "Remind Later" options

### Downloading Update

Status bar will show download progress.

### Ready to Install

After download completes, prompts to restart app to complete installation.

---

## Platform-Specific Updates

### macOS

- Downloads new version DMG
- Automatically replaces application
- Takes effect after restart

### Windows

- Downloads update installer
- Automatically runs installer
- Takes effect after restart

### Linux

- Downloads new version AppImage/deb/rpm
- Prompts user to install manually
- Or auto-replaces (AppImage)

---

## Update Server

Update information is hosted on GitHub Releases:

```
https://github.com/shulain/MobausStudio/releases
```

The app checks `latest.json` file to get latest version info.

---

## Offline Update

If auto-update is not available, you can manually download and install:

1. Visit [Releases page](https://github.com/shulain/MobausStudio/releases)
2. Download installer for your platform
3. Close current app
4. Run installer to overwrite install

---

## Disable Auto Update

To disable auto-update checking:

> ⚠️ Not recommended, you may miss important security updates.

Currently not supported in the interface. Contact us if you have special needs.

---

## Update Failure Handling

### Download Failed

- Check network connection
- Try again later
- Manually download and install

### Installation Failed

- Ensure sufficient disk space
- Ensure installation permissions
- Try manually downloading and installing

### Cannot Start After Update

1. Try reinstalling the latest version
2. If still having issues, install previous stable version
3. Submit an Issue to report the problem

---

## Version Rollback

If the new version has issues and you need to rollback:

1. Download old version from [Releases page](https://github.com/shulain/MobausStudio/releases)
2. Uninstall current version
3. Install old version

> Note: Rolling back may cause some new feature data to be incompatible.

---

## Web Version Updates

Web version does not support auto-update, manual update required:

### Docker Deployment

```bash
docker pull ghcr.io/shulain/mobausstudio:latest
docker-compose up -d --force-recreate
```

### Static File Deployment

1. Download latest `MobausStudio-web.zip`
2. Extract and replace original files
3. Clear browser cache

---

## Next Steps

- [FAQ](../faq.md) - View FAQ
- [Data Management](./data-management.md) - Backup your data
