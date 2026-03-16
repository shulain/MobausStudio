/**
 * Mixpanel Cloudflare Worker 代理
 *
 * 用于解决国内网络无法直接访问 Mixpanel API 的问题
 *
 * 部署步骤：
 * 1. 登录 Cloudflare Dashboard (https://dash.cloudflare.com)
 * 2. 进入 Workers & Pages
 * 3. 创建新 Worker
 * 4. 粘贴此代码
 * 5. 部署并绑定自定义域名（可选）
 *
 * 使用方法：
 * 在 .env 中配置：
 * VITE_MIXPANEL_PROXY=https://your-worker.workers.dev
 *
 * @version 1.0.0
 */

// Mixpanel API 端点
const MIXPANEL_API = 'https://api.mixpanel.com';

// 允许的路径
const ALLOWED_PATHS = ['/track', '/engage', '/groups', '/decide'];

// CORS 头
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
};

/**
 * 处理请求
 */
async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: CORS_HEADERS,
        });
    }

    // 检查路径是否允许
    if (!ALLOWED_PATHS.some(p => path.startsWith(p))) {
        return new Response(JSON.stringify({ error: 'Path not allowed' }), {
            status: 403,
            headers: {
                'Content-Type': 'application/json',
                ...CORS_HEADERS,
            },
        });
    }

    // 构建目标 URL
    const targetUrl = `${MIXPANEL_API}${path}${url.search}`;

    try {
        // 转发请求到 Mixpanel
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: {
                'Content-Type': request.headers.get('Content-Type') || 'application/json',
                'Accept': request.headers.get('Accept') || 'text/plain',
                'User-Agent': 'MobausStudio-Proxy/1.0',
            },
            body: request.method !== 'GET' ? await request.text() : undefined,
        });

        // 返回响应
        const responseBody = await response.text();

        return new Response(responseBody, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'text/plain',
                ...CORS_HEADERS,
            },
        });
    } catch (error) {
        // 错误处理
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...CORS_HEADERS,
            },
        });
    }
}

// 注册事件监听器
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

/**
 * ============================================================
 * 如果使用 ES Modules 格式（Cloudflare Workers 新版本），
 * 请使用以下代码替换上面的 addEventListener：
 * ============================================================
 *
 * export default {
 *     async fetch(request, env, ctx) {
 *         return handleRequest(request);
 *     },
 * };
 */
