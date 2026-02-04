import { defineConfig } from 'vitepress'

// VitePress 配置 - MobausStudio 文档站
// 支持中英文国际化
export default defineConfig({
  title: 'MobausStudio',
  description: 'AI Client Tool - 智能 AI 客户端工具',

  // 自定义域名 docs.mobaus.com 使用根路径
  base: '/',

  // 多语言配置
  locales: {
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/quick-start' },
          { text: '功能', link: '/zh/features/ui-overview' },
          { text: '部署', link: '/zh/deployment/docker' },
          { text: '常见问题', link: '/zh/faq' }
        ],
        sidebar: {
          '/zh/': [
            {
              text: '快速开始',
              items: [
                { text: '安装指南', link: '/zh/installation' },
                { text: '快速入门', link: '/zh/quick-start' }
              ]
            },
            {
              text: '功能指南',
              items: [
                { text: '界面介绍', link: '/zh/features/ui-overview' },
                { text: '对话功能', link: '/zh/features/chat' },
                { text: '提供商管理', link: '/zh/features/providers' },
                { text: '模型配置', link: '/zh/features/models' },
                { text: '智能体', link: '/zh/features/agents' },
                { text: '圆桌会议', link: '/zh/features/roundtable' },
                { text: 'MCP 服务', link: '/zh/features/mcp' },
                { text: '技能系统', link: '/zh/features/skills' }
              ]
            },
            {
              text: '进阶使用',
              items: [
                { text: '自动更新', link: '/zh/advanced/auto-update' },
                { text: '数据管理', link: '/zh/advanced/data-management' },
                { text: '快捷键', link: '/zh/advanced/shortcuts' }
              ]
            },
            {
              text: '部署指南',
              items: [
                { text: 'Docker 部署', link: '/zh/deployment/docker' },
                { text: '自托管', link: '/zh/deployment/self-hosted' }
              ]
            },
            {
              text: '其他',
              items: [
                { text: '常见问题', link: '/zh/faq' },
                { text: '更新日志', link: '/zh/changelog' }
              ]
            }
          ]
        },
        outline: {
          label: '页面导航'
        },
        docFooter: {
          prev: '上一页',
          next: '下一页'
        },
        lastUpdated: {
          text: '最后更新于'
        },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式'
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/quick-start' },
          { text: 'Features', link: '/en/features/ui-overview' },
          { text: 'Deploy', link: '/en/deployment/docker' },
          { text: 'FAQ', link: '/en/faq' }
        ],
        sidebar: {
          '/en/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Installation', link: '/en/installation' },
                { text: 'Quick Start', link: '/en/quick-start' }
              ]
            },
            {
              text: 'Features',
              items: [
                { text: 'UI Overview', link: '/en/features/ui-overview' },
                { text: 'Chat', link: '/en/features/chat' },
                { text: 'Provider Management', link: '/en/features/providers' },
                { text: 'Model Configuration', link: '/en/features/models' },
                { text: 'Agents', link: '/en/features/agents' },
                { text: 'Roundtable Meeting', link: '/en/features/roundtable' },
                { text: 'MCP Services', link: '/en/features/mcp' },
                { text: 'Skills System', link: '/en/features/skills' }
              ]
            },
            {
              text: 'Advanced',
              items: [
                { text: 'Auto Update', link: '/en/advanced/auto-update' },
                { text: 'Data Management', link: '/en/advanced/data-management' },
                { text: 'Keyboard Shortcuts', link: '/en/advanced/shortcuts' }
              ]
            },
            {
              text: 'Deployment',
              items: [
                { text: 'Docker', link: '/en/deployment/docker' },
                { text: 'Self-Hosted', link: '/en/deployment/self-hosted' }
              ]
            },
            {
              text: 'Others',
              items: [
                { text: 'FAQ', link: '/en/faq' },
                { text: 'Changelog', link: '/en/changelog' }
              ]
            }
          ]
        }
      }
    }
  },

  // 主题配置
  themeConfig: {
    logo: '/logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/shulain/MobausStudio' }
    ],

    // 本地搜索
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换'
                }
              }
            }
          }
        }
      }
    },

    // 页脚
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 MobausStudio'
    }
  },

  // 最后更新时间
  lastUpdated: true,

  // 清理 URL（移除 .html 后缀）
  cleanUrls: true,

  // 忽略死链接（文档中的相对链接在 VitePress 中需要特殊处理）
  // TODO: 后续可以修复文档中的链接格式
  ignoreDeadLinks: true
})
