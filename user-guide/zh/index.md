---
layout: home

hero:
  name: MobausStudio
  text: 重新定义 AI 交互体验
  tagline: 🚀 一站式连接全球顶级 AI · OAuth 免密登录 · MCP 无限扩展 · 开源免费
  image:
    src: /logo.svg
    alt: MobausStudio
  actions:
    - theme: brand
      text: ⚡ 立即开始
      link: /zh/quick-start
    - theme: alt
      text: 📥 下载
      link: https://github.com/shulain/MobausStudio/releases
    - theme: alt
      text: ⭐ Star on GitHub
      link: https://github.com/shulain/MobausStudio

features:
  - icon: 🔐
    title: OAuth 魔法登录
    details: 告别繁琐的 API Key！直接用你的 ChatGPT Plus、Claude Pro、GitHub Copilot 订阅账号一键登录，3 秒开始对话
    link: /zh/features/providers
    linkText: 了解更多 →
  - icon: 🌐
    title: 全宇宙 AI 集结
    details: OpenAI / Anthropic / Google / Azure / Ollama / Groq... 20+ 服务商，一个界面统治所有 AI 模型
    link: /zh/features/models
    linkText: 查看支持列表 →
  - icon: 🔌
    title: MCP 超能力
    details: 让 AI 突破对话框！连接文件系统、数据库、API、代码执行器，打造你的专属 AI 工作流
    link: /zh/features/mcp
    linkText: 探索 MCP →
  - icon: 🤖
    title: 智能体工坊
    details: 创建专属 AI 助手，自定义人设、技能、工具，让 AI 成为你的私人专家团队
    link: /zh/features/agents
    linkText: 创建智能体 →
  - icon: 🧩
    title: 技能百宝箱
    details: 内置翻译、写作、编程、分析等 30000+ 专业技能，一键调用，效率飙升 10 倍
    link: /zh/features/skills
    linkText: 浏览技能 →
  - icon: 🎯
    title: 极致体验
    details: 原生跨平台、深色模式、快捷键、Markdown 渲染、代码高亮，每个细节都精心打磨
    link: /zh/features/ui-overview
    linkText: 界面预览 →
---

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  const features = document.querySelectorAll('.VPFeature')
  features.forEach((feature, index) => {
    feature.style.opacity = '0'
    feature.style.transform = 'translateY(30px)'
    feature.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
    setTimeout(() => {
      feature.style.opacity = '1'
      feature.style.transform = 'translateY(0)'
    }, 100 * index)
  })
})
</script>

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%);
  --vp-home-hero-image-background-image: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  --vp-home-hero-image-filter: blur(68px);
}

.VPHero .name {
  animation: gradient-shift 8s ease infinite;
  background-size: 400% 400%;
}

@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.VPHero .actions .VPButton {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.VPHero .actions .VPButton:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.VPFeature {
  background: linear-gradient(135deg, var(--vp-c-bg-soft) 0%, var(--vp-c-bg) 100%) !important;
  border: 1px solid transparent !important;
  position: relative;
}

.VPFeature::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(240, 147, 251, 0.3));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.VPFeature:hover::before {
  opacity: 1;
}

.VPFeature:hover {
  transform: translateY(-8px) !important;
  box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15) !important;
}

.VPFeature .icon {
  font-size: 2.5rem !important;
}

.custom-block {
  max-width: 1152px;
  margin: 0 auto;
  padding: 48px 24px;
}

.stats-wrapper {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(240, 147, 251, 0.08) 100%);
  border-radius: 28px;
  padding: 20px;
  margin: 40px auto;
  max-width: 1100px;
}

.stats-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 20px 60px rgba(102, 126, 234, 0.3);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  text-align: center;
}

.stat-item {
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 2.8rem;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
}

.stat-value {
  font-size: 2.8rem;
  font-weight: 800;
  text-shadow: 0 2px 10px rgba(0,0,0,0.2);
  line-height: 1.2;
}

.stat-label {
  font-size: 0.95rem;
  opacity: 0.9;
}

.section-title {
  font-size: 2.2rem;
  font-weight: 800;
  text-align: center;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.section-subtitle {
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 1.1rem;
  margin-bottom: 40px;
}

.comparison-card {
  background: var(--vp-c-bg-soft);
  border-radius: 20px;
  padding: 28px;
  border: 2px solid var(--vp-c-divider);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.comparison-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
}

.comparison-card:hover {
  transform: translateY(-4px);
  border-color: #667eea;
  box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15);
}

.comparison-card h3 {
  font-size: 1.2rem;
  margin-bottom: 16px;
}

.comparison-card table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.comparison-card th,
.comparison-card td {
  padding: 10px 12px;
  text-align: center;
  border-bottom: 1px solid var(--vp-c-divider);
}

.comparison-card th {
  font-weight: 600;
}

.comparison-card tr:last-child td {
  border-bottom: none;
}

.steps-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin: 40px 0;
}

.step-card {
  background: var(--vp-c-bg-soft);
  border-radius: 16px;
  padding: 28px 20px;
  text-align: center;
  border: 1px solid var(--vp-c-divider);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.step-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 25px 50px rgba(102, 126, 234, 0.2);
  border-color: transparent;
  background: linear-gradient(var(--vp-c-bg-soft), var(--vp-c-bg-soft)) padding-box,
              linear-gradient(135deg, #667eea, #f093fb) border-box;
}

.step-number {
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 800;
  font-size: 1.3rem;
  margin: 0 auto 16px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
}

.step-card h4 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 10px;
}

.step-card p {
  color: var(--vp-c-text-2);
  line-height: 1.5;
  font-size: 0.9rem;
}

.providers-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-top: 28px;
}

.provider-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  font-weight: 600;
  font-size: 0.9rem;
}

.provider-card:hover {
  transform: translateY(-4px) scale(1.05);
  border-color: #667eea;
  box-shadow: 0 12px 28px rgba(102, 126, 234, 0.15);
}

.provider-icon {
  font-size: 1.5rem;
}

.cta-section {
  margin-top: 60px;
  text-align: center;
  padding: 48px 32px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(240, 147, 251, 0.1) 100%);
  border-radius: 20px;
  border: 1px solid rgba(102, 126, 234, 0.2);
}

.cta-title {
  font-size: 1.8rem;
  font-weight: 800;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #667eea, #f093fb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cta-subtitle {
  color: var(--vp-c-text-2);
  font-size: 1rem;
  margin-bottom: 28px;
}

.cta-buttons {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.cta-btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
}

.cta-btn.primary:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5);
}

.cta-btn.secondary {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border: 2px solid var(--vp-c-divider);
}

.cta-btn.secondary:hover {
  border-color: #667eea;
  transform: translateY(-3px);
}

.dark .stats-section {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.dark .step-card:hover,
.dark .comparison-card:hover,
.dark .provider-card:hover {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

@media (max-width: 960px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
  .providers-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .steps-row {
    grid-template-columns: 1fr;
  }
  .stat-value {
    font-size: 2rem;
  }
  .section-title {
    font-size: 1.6rem;
  }
}

@media (max-width: 480px) {
  .providers-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .cta-buttons {
    flex-direction: column;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

<div class="custom-block">
  <div class="stats-wrapper">
    <div class="stats-section">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-icon">🤖</span>
          <span class="stat-value">20+</span>
          <span class="stat-label">AI 服务商</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">🧩</span>
          <span class="stat-value">30000+</span>
          <span class="stat-label">内置技能</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">🔌</span>
          <span class="stat-value">∞</span>
          <span class="stat-label">MCP 扩展</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">💰</span>
          <span class="stat-value">$0</span>
          <span class="stat-label">使用费用</span>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🏆 为什么选择 MobausStudio？</h2>
  <p class="section-subtitle">不只是另一个 AI 客户端，而是你的 AI 超级工作站</p>

  <div class="comparison-card">
    <h3>⚔️ 功能对比一目了然</h3>
    <table>
      <tr>
        <th>功能特性</th>
        <th>MobausStudio</th>
        <th>ChatGPT 官网</th>
        <th>其他客户端</th>
      </tr>
      <tr>
        <td>OAuth 免密登录</td>
        <td>✅ 支持</td>
        <td>➖ 仅自家</td>
        <td>❌ 不支持</td>
      </tr>
      <tr>
        <td>多模型切换</td>
        <td>✅ 20+ 服务商</td>
        <td>❌ 仅 GPT</td>
        <td>⚠️ 部分支持</td>
      </tr>
      <tr>
        <td>MCP 协议</td>
        <td>✅ 完整支持</td>
        <td>❌ 不支持</td>
        <td>⚠️ 部分支持</td>
      </tr>
      <tr>
        <td>智能体系统</td>
        <td>✅ 自定义</td>
        <td>⚠️ GPTs</td>
        <td>⚠️ 有限</td>
      </tr>
      <tr>
        <td>技能系统</td>
        <td>✅ 30000+</td>
        <td>❌ 无</td>
        <td>❌ 无</td>
      </tr>
      <tr>
        <td>开源免费</td>
        <td>✅ MIT 协议</td>
        <td>❌ 闭源</td>
        <td>⚠️ 部分</td>
      </tr>
    </table>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🚀 三步开启 AI 之旅</h2>
  <p class="section-subtitle">从下载到对话，只需 60 秒</p>

  <div class="steps-row">
    <div class="step-card">
      <div class="step-number">1</div>
      <h4>📥 下载安装</h4>
      <p>支持 macOS / Windows / Linux<br/>一键安装，开箱即用</p>
    </div>
    <div class="step-card">
      <div class="step-number">2</div>
      <h4>🔐 连接 AI</h4>
      <p>OAuth 一键登录<br/>或输入 API Key</p>
    </div>
    <div class="step-card">
      <div class="step-number">3</div>
      <h4>💬 开始对话</h4>
      <p>选择模型，输入问题<br/>享受智能 AI 服务</p>
    </div>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🌐 支持的 AI 服务商</h2>
  <p class="section-subtitle">一个客户端，连接全球顶级 AI</p>

  <div class="providers-grid">
    <div class="provider-card">
      <span class="provider-icon">💚</span>
      <span>OpenAI</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">🧡</span>
      <span>Anthropic</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">💙</span>
      <span>Google AI</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">🖤</span>
      <span>GitHub Copilot</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">💜</span>
      <span>Azure OpenAI</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">❤️</span>
      <span>Ollama</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">💛</span>
      <span>Groq</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">🩵</span>
      <span>Mistral</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">🩷</span>
      <span>Cohere</span>
    </div>
    <div class="provider-card">
      <span class="provider-icon">🤍</span>
      <span>更多...</span>
    </div>
  </div>
</div>

<div class="custom-block">
  <div class="cta-section">
    <h2 class="cta-title">🎉 准备好体验下一代 AI 客户端了吗？</h2>
    <p class="cta-subtitle">加入数千名用户，开启你的 AI 超能力之旅</p>
    <div class="cta-buttons">
      <a href="/zh/quick-start" class="cta-btn primary">⚡ 立即开始</a>
      <a href="https://github.com/shulain/MobausStudio/releases" class="cta-btn secondary">📥 下载应用</a>
      <a href="https://github.com/shulain/MobausStudio" class="cta-btn secondary">⭐ GitHub Star</a>
    </div>
  </div>
</div>
