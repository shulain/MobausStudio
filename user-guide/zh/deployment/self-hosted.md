# 自托管部署指南

除了 Docker，你也可以直接部署 MobausStudio Web 版本的静态文件。

## 下载静态文件

从 [Releases](https://github.com/shulain/MobausStudio/releases) 页面下载 `MobausStudio-web.zip`。

```bash
# 下载最新版本
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio-web.zip

# 解压
unzip MobausStudio-web.zip -d /var/www/mobaus-studio
```

---

## Nginx 部署

### 配置文件

创建 `/etc/nginx/sites-available/mobaus-studio`：

```nginx
server {
    listen 80;
    server_name mobaus.example.com;

    root /var/www/mobaus-studio;
    index index.html;

    # 启用 gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 启用站点

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/mobaus-studio /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## Apache 部署

### 配置文件

创建 `/etc/apache2/sites-available/mobaus-studio.conf`：

```apache
<VirtualHost *:80>
    ServerName mobaus.example.com
    DocumentRoot /var/www/mobaus-studio

    <Directory /var/www/mobaus-studio>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # SPA 路由支持
    <IfModule mod_rewrite.c>
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </IfModule>

    # 启用压缩
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json
    </IfModule>
</VirtualHost>
```

### 启用站点

```bash
# 启用必要模块
sudo a2enmod rewrite deflate

# 启用站点
sudo a2ensite mobaus-studio

# 重载 Apache
sudo systemctl reload apache2
```

---

## Caddy 部署

Caddy 是一个现代化的 Web 服务器，自动处理 HTTPS。

### Caddyfile

```caddyfile
mobaus.example.com {
    root * /var/www/mobaus-studio
    file_server

    # SPA 路由支持
    try_files {path} /index.html

    # 静态资源缓存
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    # 启用压缩
    encode gzip
}
```

### 启动 Caddy

```bash
caddy run --config /etc/caddy/Caddyfile
```

---

## 云服务部署

### Vercel

1. Fork 或下载静态文件
2. 在 Vercel 创建新项目
3. 上传 `dist` 目录内容
4. 自动部署完成

### Netlify

1. 下载 `MobausStudio-web.zip`
2. 解压后拖拽到 Netlify 部署页面
3. 或使用 CLI：

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=./dist
```

### GitHub Pages

1. 创建新仓库或使用现有仓库
2. 上传静态文件到 `gh-pages` 分支
3. 在仓库设置中启用 GitHub Pages

---

## HTTPS 配置

### Let's Encrypt (Certbot)

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书（Nginx）
sudo certbot --nginx -d mobaus.example.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 性能优化建议

1. **启用 HTTP/2**: 提升并发加载性能
2. **启用 Gzip/Brotli 压缩**: 减少传输大小
3. **配置 CDN**: 加速全球访问
4. **设置合理的缓存策略**: 静态资源长期缓存

---

## 安全建议

1. **使用 HTTPS**: 加密传输数据
2. **配置安全头**:
   ```nginx
   add_header X-Frame-Options "SAMEORIGIN";
   add_header X-Content-Type-Options "nosniff";
   add_header X-XSS-Protection "1; mode=block";
   ```
3. **限制访问**: 如需要，配置 IP 白名单或基本认证
