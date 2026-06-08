# MobausStudio Web 静态预览 Docker 镜像
# 使用 nginx 作为静态文件服务器
# 不包含 Tauri/Rust 后端；完整 AI 对话、OAuth、MCP 等功能请使用桌面版
#
# 构建: docker build -t mobaus-studio .
# 运行: docker run -d -p 8080:80 mobaus-studio
# 访问: http://localhost:8080

# 阶段1: 构建前端
FROM node:20-alpine AS builder

WORKDIR /app

ARG APP_VERSION=0.0.0-dev
ENV VITE_APP_VERSION=$APP_VERSION

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 阶段2: 生产镜像
FROM nginx:alpine

ARG APP_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="MobausStudio Web"
LABEL org.opencontainers.image.version=$APP_VERSION

# 复制自定义 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制静态文件
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
