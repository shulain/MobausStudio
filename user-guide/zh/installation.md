# 安装指南

MobausStudio 支持多种平台和部署方式，请根据你的需求选择合适的安装方法。

---

## 桌面应用

### macOS

#### Apple Silicon (M1/M2/M3/M4)

1. 下载 `MobausStudio_x.x.x_aarch64.dmg`
2. 双击打开 DMG 文件
3. 将 MobausStudio 拖入「应用程序」文件夹
4. 首次打开时，如遇到安全提示：
   - 打开「系统偏好设置」→「安全性与隐私」
   - 点击「仍要打开」

#### Intel 芯片

1. 下载 `MobausStudio_x.x.x_x64.dmg`
2. 安装步骤同上

### Windows

#### 安装版（推荐）

1. 下载 `MobausStudio_x.x.x_x64-setup.exe` 或 `MobausStudio_x.x.x_x64.msi`
2. 双击运行安装程序
3. 按照向导完成安装
4. 从开始菜单或桌面快捷方式启动

#### 便携版

下载 `.exe` 便携版，无需安装，直接运行即可。

### Linux

#### Debian / Ubuntu

```bash
# 下载 .deb 包
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.deb

# 安装
sudo dpkg -i MobausStudio_x.x.x_amd64.deb

# 如有依赖问题
sudo apt-get install -f
```

#### Fedora / RHEL / CentOS

```bash
# 下载 .rpm 包
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.rpm

# 安装
sudo rpm -i MobausStudio_x.x.x_amd64.rpm
# 或
sudo dnf install MobausStudio_x.x.x_amd64.rpm
```

#### AppImage（通用）

```bash
# 下载 AppImage
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio_x.x.x_amd64.AppImage

# 添加执行权限
chmod +x MobausStudio_x.x.x_amd64.AppImage

# 运行
./MobausStudio_x.x.x_amd64.AppImage
```

---

## Web 版本

### 方式一：直接使用静态文件

```bash
# 下载并解压
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio-web.zip
unzip MobausStudio-web.zip -d mobaus-web

# 使用任意 HTTP 服务器托管
cd mobaus-web
npx serve .
# 或
python -m http.server 8080
```

访问 `http://localhost:8080`

### 方式二：Docker（推荐）

详见 [Docker 部署指南](./deployment/docker.md)

---

## 系统要求

| 平台 | 最低要求 |
|------|----------|
| macOS | 10.15 (Catalina) 或更高 |
| Windows | Windows 10 (1803) 或更高 |
| Linux | glibc 2.31+ (Ubuntu 20.04+) |

### 硬件要求

- **CPU**: 64 位处理器
- **内存**: 4GB RAM（推荐 8GB+）
- **存储**: 200MB 可用空间

---

## 验证安装

安装完成后，启动 MobausStudio，你应该能看到主界面。

如果遇到问题，请查看 [常见问题](./faq.md) 或 [提交 Issue](https://github.com/shulain/MobausStudio/issues)。

---

## 下一步

- [快速入门](./quick-start.md) - 开始使用 MobausStudio
