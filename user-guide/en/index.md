---
layout: home

hero:
  name: MobausStudio
  text: Redefine AI Interaction
  tagline: 🚀 Connect Top AI Services · OAuth Login · MCP Extensions · Open Source & Free
  image:
    src: /logo.svg
    alt: MobausStudio
  actions:
    - theme: brand
      text: ⚡ Get Started
      link: /en/quick-start
    - theme: alt
      text: 📥 Download
      link: https://github.com/shulain/MobausStudio/releases
    - theme: alt
      text: ⭐ Star on GitHub
      link: https://github.com/shulain/MobausStudio

features:
  - icon: 🔐
    title: OAuth Magic Login
    details: Say goodbye to API Keys! Login directly with your ChatGPT Plus, Claude Pro, or GitHub Copilot subscription - start chatting in 3 seconds
    link: /en/features/providers
    linkText: Learn More →
  - icon: 🌐
    title: All AI in One Place
    details: OpenAI / Anthropic / Google / Azure / Ollama / Groq... 20+ providers, one interface to rule them all
    link: /en/features/models
    linkText: View Providers →
  - icon: 🔌
    title: MCP Superpowers
    details: Let AI break free! Connect to file systems, databases, APIs, code executors - build your custom AI workflow
    link: /en/features/mcp
    linkText: Explore MCP →
  - icon: 🤖
    title: Agent Workshop
    details: Create custom AI assistants with personalized personas, skills, and tools - your private expert team
    link: /en/features/agents
    linkText: Create Agents →
  - icon: 🧩
    title: Skills Treasure Box
    details: 30000+ built-in professional skills for translation, writing, coding, analysis - 10x your productivity
    link: /en/features/skills
    linkText: Browse Skills →
  - icon: 🎯
    title: Ultimate Experience
    details: Native cross-platform, dark mode, shortcuts, Markdown rendering, code highlighting - every detail polished
    link: /en/features/ui-overview
    linkText: Preview UI →
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
          <span class="stat-label">AI Providers</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">🧩</span>
          <span class="stat-value">30000+</span>
          <span class="stat-label">Built-in Skills</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">🔌</span>
          <span class="stat-value">∞</span>
          <span class="stat-label">MCP Extensions</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">💰</span>
          <span class="stat-value">$0</span>
          <span class="stat-label">Usage Cost</span>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🏆 Why Choose MobausStudio?</h2>
  <p class="section-subtitle">Not just another AI client, but your AI super workstation</p>

  <div class="comparison-card">
    <h3>⚔️ Feature Comparison at a Glance</h3>
    <table>
      <tr>
        <th>Feature</th>
        <th>MobausStudio</th>
        <th>ChatGPT Web</th>
        <th>Other Clients</th>
      </tr>
      <tr>
        <td>OAuth Login</td>
        <td>✅ Supported</td>
        <td>➖ Own only</td>
        <td>❌ Not supported</td>
      </tr>
      <tr>
        <td>Multi-model</td>
        <td>✅ 20+ providers</td>
        <td>❌ GPT only</td>
        <td>⚠️ Partial</td>
      </tr>
      <tr>
        <td>MCP Protocol</td>
        <td>✅ Full support</td>
        <td>❌ Not supported</td>
        <td>⚠️ Partial</td>
      </tr>
      <tr>
        <td>Agent System</td>
        <td>✅ Custom</td>
        <td>⚠️ GPTs</td>
        <td>⚠️ Limited</td>
      </tr>
      <tr>
        <td>Skills System</td>
        <td>✅ 30000+</td>
        <td>❌ None</td>
        <td>❌ None</td>
      </tr>
      <tr>
        <td>Open Source</td>
        <td>✅ MIT License</td>
        <td>❌ Closed</td>
        <td>⚠️ Partial</td>
      </tr>
    </table>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🚀 Start Your AI Journey in 3 Steps</h2>
  <p class="section-subtitle">From download to conversation in just 60 seconds</p>

  <div class="steps-row">
    <div class="step-card">
      <div class="step-number">1</div>
      <h4>📥 Download & Install</h4>
      <p>Supports macOS / Windows / Linux<br/>One-click install, ready to use</p>
    </div>
    <div class="step-card">
      <div class="step-number">2</div>
      <h4>🔐 Connect AI</h4>
      <p>OAuth one-click login<br/>or enter API Key</p>
    </div>
    <div class="step-card">
      <div class="step-number">3</div>
      <h4>💬 Start Chatting</h4>
      <p>Select model, ask questions<br/>Enjoy intelligent AI service</p>
    </div>
  </div>
</div>

<div class="custom-block">
  <h2 class="section-title">🌐 Supported AI Providers</h2>
  <p class="section-subtitle">One client, connect to world's top AI services</p>

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
      <span>More...</span>
    </div>
  </div>
</div>

<div class="custom-block">
  <div class="cta-section">
    <h2 class="cta-title">🎉 Ready to Experience the Next-Gen AI Client?</h2>
    <p class="cta-subtitle">Join thousands of users and unlock your AI superpowers</p>
    <div class="cta-buttons">
      <a href="/en/quick-start" class="cta-btn primary">⚡ Get Started</a>
      <a href="https://github.com/shulain/MobausStudio/releases" class="cta-btn secondary">📥 Download</a>
      <a href="https://github.com/shulain/MobausStudio" class="cta-btn secondary">⭐ GitHub Star</a>
    </div>
  </div>
</div>
