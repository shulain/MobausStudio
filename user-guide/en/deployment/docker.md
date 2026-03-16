# Docker Deployment Guide

Using Docker to deploy MobausStudio Web version is the simplest self-hosting method.

---

## Quick Start

### Single Command

```bash
docker run -d -p 8080:80 --name mobaus-studio ghcr.io/shulain/mobausstudio:latest
```

Visit `http://localhost:8080`

### Stop and Remove

```bash
# Stop
docker stop mobaus-studio

# Remove container
docker rm mobaus-studio

# Remove image (optional)
docker rmi ghcr.io/shulain/mobausstudio:latest
```

---

## Docker Compose (Recommended)

Create `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mobaus-studio:
    image: ghcr.io/shulain/mobausstudio:latest
    container_name: mobaus-studio
    ports:
      - "8080:80"
    restart: unless-stopped
    # Optional: health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Start service:

```bash
docker-compose up -d
```

View logs:

```bash
docker-compose logs -f
```

---

## Using Reverse Proxy

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name mobaus.example.com;

    # Redirect to HTTPS
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

### Traefik Configuration Example

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

## Version Management

### Use Specific Version

```bash
# Use specific version number
docker pull ghcr.io/shulain/mobausstudio:0.3.0

# Use major version (auto-get latest minor)
docker pull ghcr.io/shulain/mobausstudio:0.3
```

### Update to Latest Version

```bash
# Pull latest image
docker pull ghcr.io/shulain/mobausstudio:latest

# Recreate container
docker-compose up -d --force-recreate
```

---

## Available Image Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable version |
| `x.y.z` | Specific version (e.g. `0.3.0`) |
| `x.y` | Major version (e.g. `0.3`) |

---

## Supported Architectures

The image supports the following CPU architectures:

- `linux/amd64` - x86_64 (most servers and PCs)
- `linux/arm64` - ARM64 (Apple Silicon, Raspberry Pi 4, etc.)

Docker will automatically select the matching architecture.

---

## Troubleshooting

### Container won't start

```bash
# View container logs
docker logs mobaus-studio

# Check port usage
netstat -tlnp | grep 8080
```

### Cannot access page

1. Confirm container is running: `docker ps`
2. Check if port mapping is correct
3. Check firewall settings

### Image pull failed

```bash
# Check network connection
ping ghcr.io

# Use mirror acceleration (for users in certain regions)
# Configure Docker daemon.json to add mirror source
```

---

## Related Links

- [Docker Official Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
