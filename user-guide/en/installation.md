# Installation Guide

MobausStudio supports multiple platforms and deployment methods. Choose the installation method that suits your needs.

---

## Desktop Application

### macOS

#### Apple Silicon (M1/M2/M3/M4)

1. Download `MobausStudio_x.x.x_aarch64.dmg`
2. Double-click to open the DMG file
3. Drag MobausStudio to the "Applications" folder
4. If you see a security prompt on first launch:
   - Open "System Preferences" → "Security & Privacy"
   - Click "Open Anyway"

#### Intel Chip

1. Download `MobausStudio_x.x.x_x64.dmg`
2. Follow the same steps as above

### Windows

#### Installer (Recommended)

1. Download `MobausStudio_x.x.x_x64-setup.exe` or `MobausStudio_x.x.x_x64.msi`
2. Double-click to run the installer
3. Follow the wizard to complete installation
4. Launch from Start Menu or desktop shortcut

#### Portable Version

Download the portable `.exe` version, no installation required, run directly.

### Linux

#### Debian / Ubuntu

```bash
# Download .deb package
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.deb

# Install
sudo dpkg -i MobausStudio_x.x.x_amd64.deb

# If there are dependency issues
sudo apt-get install -f
```

#### Fedora / RHEL / CentOS

```bash
# Download .rpm package
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.rpm

# Install
sudo rpm -i MobausStudio_x.x.x_amd64.rpm
# Or
sudo dnf install MobausStudio_x.x.x_amd64.rpm
```

#### AppImage (Universal)

```bash
# Download AppImage
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.AppImage

# Add execute permission
chmod +x MobausStudio_x.x.x_amd64.AppImage

# Run
./MobausStudio_x.x.x_amd64.AppImage
```

---

## Web Version

### Method 1: Static Files

```bash
# Download and extract
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio-web.zip
unzip MobausStudio-web.zip -d mobaus-web

# Host with any HTTP server
cd mobaus-web
npx serve .
# Or
python -m http.server 8080
```

Visit `http://localhost:8080`

### Method 2: Docker (Recommended)

See [Docker Deployment Guide](./deployment/docker.md)

---

## System Requirements

| Platform | Minimum Requirements |
|----------|---------------------|
| macOS | 10.15 (Catalina) or higher |
| Windows | Windows 10 (1803) or higher |
| Linux | glibc 2.31+ (Ubuntu 20.04+) |

### Hardware Requirements

- **CPU**: 64-bit processor
- **RAM**: 4GB (8GB+ recommended)
- **Storage**: 200MB available space

---

## Verify Installation

After installation, launch MobausStudio. You should see the main interface.

If you encounter issues, check [FAQ](./faq.md) or [Submit an Issue](https://github.com/shulain/MobausStudio/issues).

---

## Next Steps

- [Quick Start](./quick-start.md) - Start using MobausStudio
