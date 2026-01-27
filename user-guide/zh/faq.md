# 常见问题 (FAQ)

## 安装问题

### macOS 提示"无法打开，因为无法验证开发者"

这是 macOS 的安全机制（Gatekeeper）。解决方法：

1. 打开「系统偏好设置」→「安全性与隐私」→「通用」
2. 点击「仍要打开」按钮
3. 或者在终端执行：
   ```bash
   xattr -cr /Applications/MobausStudio.app
   ```

### Windows 提示"Windows 已保护你的电脑"

这是 Windows SmartScreen 的保护机制：

1. 点击「更多信息」
2. 点击「仍要运行」

### Linux AppImage 无法运行

确保已添加执行权限：

```bash
chmod +x MobausStudio_*.AppImage
```

如果仍然无法运行，可能缺少 FUSE：

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```

---

## 使用问题

### 如何配置 API 密钥？

1. 点击左侧边栏的「设置」图标
2. 选择「模型配置」
3. 输入对应服务商的 API 密钥

### 支持哪些 AI 模型？

MobausStudio 支持：

- OpenAI (GPT-4, GPT-3.5 等)
- Anthropic (Claude 系列)
- 其他 OpenAI 兼容 API

### 对话记录保存在哪里？

- **桌面版**: 保存在本地应用数据目录
  - macOS: `~/Library/Application Support/MobausStudio/`
  - Windows: `%APPDATA%\MobausStudio\`
  - Linux: `~/.config/MobausStudio/`
- **Web 版**: 保存在浏览器 localStorage

### 如何导出对话记录？

目前可以通过复制对话内容的方式导出。完整的导出功能正在开发中。

---

## 网络问题

### API 请求超时

可能的原因和解决方法：

1. **网络不稳定**: 检查网络连接
2. **API 服务商限流**: 稍后重试
3. **代理设置问题**: 检查系统代理配置

### 无法连接到 API

1. 确认 API 密钥正确
2. 确认 API 端点地址正确
3. 检查是否需要配置代理
4. 确认 API 账户余额充足

---

## 更新问题

### 如何检查更新？

- **桌面版**: 应用启动时自动检查，也可在「设置」→「关于」中手动检查
- **Web 版/Docker**: 需要手动更新部署

### 自动更新失败

1. 检查网络连接
2. 尝试手动下载最新版本安装
3. 查看应用日志获取详细错误信息

---

## Docker 问题

### 容器启动后无法访问

1. 确认容器正在运行：`docker ps`
2. 确认端口映射正确：`docker port mobaus-studio`
3. 检查防火墙设置
4. 查看容器日志：`docker logs mobaus-studio`

### 如何更新 Docker 镜像？

```bash
# 拉取最新镜像
docker pull ghcr.io/shulain/mobausstudio:latest

# 停止并删除旧容器
docker stop mobaus-studio
docker rm mobaus-studio

# 启动新容器
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
```

---

## 其他问题

### 如何反馈 Bug 或建议？

请在 GitHub 提交 Issue：[https://github.com/shulain/MobausStudio/issues](https://github.com/shulain/MobausStudio/issues)

提交时请包含：

- 操作系统和版本
- MobausStudio 版本
- 问题描述和复现步骤
- 相关截图或日志

### 是否开源？

MobausStudio 采用 MIT 许可证。

---

## 没有找到答案？

如果以上内容没有解决你的问题，请：

1. 搜索 [已有 Issues](https://github.com/shulain/MobausStudio/issues)
2. 提交新的 [Issue](https://github.com/shulain/MobausStudio/issues/new)
