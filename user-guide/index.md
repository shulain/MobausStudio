---
layout: false
---

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // 获取浏览器语言
  const lang = navigator.language || navigator.userLanguage || 'en'

  // 判断是否为中文
  const isChinese = lang.toLowerCase().startsWith('zh')

  // 重定向到对应语言页面
  if (isChinese) {
    window.location.href = '/zh/'
  } else {
    window.location.href = '/en/'
  }
})
</script>

<div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui, sans-serif;">
  <div style="text-align: center;">
    <p style="font-size: 1.2rem; color: #666;">Redirecting / 正在跳转...</p>
  </div>
</div>
