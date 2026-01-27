# Docker Deployment Guide | Docker 部署指南

Using Docker to deploy MobausStudio Web version is the simplest self-hosting method.

使用 Docker 部署 MobausStudio Web 版本是最简单的自托管方式。

---

## Quick Start | 快速开始

### Single Command | 单命令启动

```bash
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
```

Visit | 访问 `http://localhost:8080`

### Stop and Remove | 停止和删除

```bash
# Stop | 停止
docker stop mobaus-studio

# Remove container | 删除容器
docker rm mobaus-studio

# Remove image (optional) | 删除镜像（可选）
docker rmi ghcr.io/shulain/mobausstudio:latest
```

---

## Docker Compose (Recommended) | Docker Compose（推荐）

Create `docker-compose.yml` file | 创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    container_name: mobaus-studio
    ports:
      - "8080:80"
    restart: unless-stopped
    # Optional: health check | 可选：健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Start service | 启动服务：

```bash
docker-compose up -d
```

View logs | 查看日志：

```bash
docker-compose logs -f
```

---

## Using Reverse Proxy | 使用反向代理

### Nginx Configuration Example | Nginx 配置示例

```nginx
server {
    listen 80;
    server_name mobaus.example.com;

    # Redirect to HTTPS | 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mobaus.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik Configuration Example | Traefik 配置示例

```yaml
version: '3.8'

services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mobaus.rule=Host(`mobaus.example.com`)"
      - "traefik.http.routers.mobaus.entrypoints=websecure"
      - "traefik.http.routers.mobaus.tls.certresolver=letsencrypt"
    restart: unless-stopped
```

---

## Version Management | 版本管理

### Use Specific Version | 使用特定版本

```bash
# Use specific version number | 使用特定版本号
docker pull ghcr.io/shulain/mobausstudio:0.3.0

# Use major version (auto-get latest minor) | 使用主版本号（自动获取最新小版本）
docker pull ghcr.io/shulain/mobausstudio:0.3
```

### Update to Latest Version | 更新到最新版本

```bash
# Pull latest image | 拉取最新镜像
docker pull ghcr.io/shulain/mobausstudio:latest

# Recreate container | 重新创建容器
docker-compose up -d --force-recreate
```

---

## Available Image Tags | 可用镜像标签

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable version / 最新稳定版 |
| `x.y.z` | Specific version (e.g. `0.3.0`) / 特定版本 |
| `x.y` | Major version (e.g. `0.3`) / 主版本 |

---

## Supported Architectures | 支持的架构

The image supports the following CPU architectures:

镜像支持以下 CPU 架构：

- `linux/amd64` - x86_64 (most servers and PCs / 大多数服务器和 PC)
- `linux/arm64` - ARM64 (Apple Silicon, Raspberry Pi 4, etc. / Apple Silicon、树莓派 4 等)

Docker will automatically select the matching architecture.

Docker 会自动选择匹配的架构。

---

## Troubleshooting | 故障排除

### Container won't start | 容器无法启动

```bash
# View container logs | 查看容器日志
docker logs mobaus-studio

# Check port usage | 检查端口占用
netstat -tlnp | grep 8080
```

### Cannot access page | 无法访问页面

1. Confirm container is running | 确认容器正在运行：`docker ps`
2. Check if port mapping is correct | 检查端口映射是否正确
3. Check firewall settings | 检查防火墙设置

### Image pull failed | 镜像拉取失败

```bash
# Check network connection | 检查网络连接
ping ghcr.io

# Use mirror acceleration (for China users) | 使用镜像加速（中国大陆用户）
# Configure Docker daemon.json to add mirror source
# 配置 Docker daemon.json 添加镜像源
```

---

## Related Links | 相关链接

- [Docker Official Documentation | Docker 官方文档](https://docs.docker.com/)
- [Docker Compose Documentation | Docker Compose 文档](https://docs.docker.com/compose/)
