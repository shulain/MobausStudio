# Self-Hosted Deployment Guide

Besides Docker, you can also directly deploy MobausStudio Web version static files.

## Download Static Files

Download `MobausStudio-web.zip` from the [Releases](https://github.com/shulain/MobausStudio/releases) page.

```bash
# Download latest version
wget https://github.com/shulain/MobausStudio/releases/latest/download/MobausStudio-web.zip

# Extract
unzip MobausStudio-web.zip -d /var/www/mobaus-studio
```

---

## Nginx Deployment

### Configuration File

Create `/etc/nginx/sites-available/mobaus-studio`:

```nginx
server {
    listen 80;
    server_name mobaus.example.com;

    root /var/www/mobaus-studio;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # SPA routing support
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static resource caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Enable Site

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/mobaus-studio /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Apache Deployment

### Configuration File

Create `/etc/apache2/sites-available/mobaus-studio.conf`:

```apache
<VirtualHost *:80>
    ServerName mobaus.example.com
    DocumentRoot /var/www/mobaus-studio

    <Directory /var/www/mobaus-studio>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # SPA routing support
    <IfModule mod_rewrite.c>
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </IfModule>

    # Enable compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json
    </IfModule>
</VirtualHost>
```

### Enable Site

```bash
# Enable required modules
sudo a2enmod rewrite deflate

# Enable site
sudo a2ensite mobaus-studio

# Reload Apache
sudo systemctl reload apache2
```

---

## Caddy Deployment

Caddy is a modern web server that automatically handles HTTPS.

### Caddyfile

```caddyfile
mobaus.example.com {
    root * /var/www/mobaus-studio
    file_server

    # SPA routing support
    try_files {path} /index.html

    # Static resource caching
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    # Enable compression
    encode gzip
}
```

### Start Caddy

```bash
caddy run --config /etc/caddy/Caddyfile
```

---

## Cloud Service Deployment

### Vercel

1. Fork or download static files
2. Create new project in Vercel
3. Upload `dist` directory contents
4. Deployment completes automatically

### Netlify

1. Download `MobausStudio-web.zip`
2. Extract and drag to Netlify deploy page
3. Or use CLI:

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=./dist
```

### GitHub Pages

1. Create new repository or use existing one
2. Upload static files to `gh-pages` branch
3. Enable GitHub Pages in repository settings

---

## HTTPS Configuration

### Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (Nginx)
sudo certbot --nginx -d mobaus.example.com

# Auto renewal
sudo certbot renew --dry-run
```

---

## Performance Optimization Tips

1. **Enable HTTP/2**: Improve concurrent loading performance
2. **Enable Gzip/Brotli compression**: Reduce transfer size
3. **Configure CDN**: Accelerate global access
4. **Set reasonable caching strategy**: Long-term cache for static resources

---

## Security Recommendations

1. **Use HTTPS**: Encrypt data transmission
2. **Configure security headers**:
   ```nginx
   add_header X-Frame-Options "SAMEORIGIN";
   add_header X-Content-Type-Options "nosniff";
   add_header X-XSS-Protection "1; mode=block";
   ```
3. **Restrict access**: Configure IP whitelist or basic authentication if needed
