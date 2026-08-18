/**
 * ESLint 配置文件
 *
 * 使用 ESLint 9+ 的扁平配置格式
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // 忽略的文件和目录
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'src-tauri/target/**',
      '*.config.js',
      '*.config.ts',
    ],
  },

  // JavaScript 推荐规则
  js.configs.recommended,

  // TypeScript 推荐规则
  ...tseslint.configs.recommended,

  // 全局配置
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    plugins: {
      'react-hooks': reactHooks,
    },

    rules: {
      // 禁止使用 console.log
      // error 级 + lint 脚本的 --max-warnings=0：违规必须显式登记，不能靠"警告"无限累积
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // 禁止使用 any 类型
      '@typescript-eslint/no-explicit-any': 'error',

      // 禁止未使用的变量
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // 允许空函数
      '@typescript-eslint/no-empty-function': 'off',

      // 允许 require
      '@typescript-eslint/no-var-requires': 'off',

      // 允许 async promise executor（复杂异步逻辑需要）
      'no-async-promise-executor': 'warn',

      // React Hooks 规则
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // 测试文件：定向放宽个别规则，而非整体豁免
  //
  // 测试代码同样需要参与 lint —— 未使用变量、错误的 Hook 用法、被抑制的类型
  // 检查在测试里同样是缺陷。但以下两类在测试中属正常手段，单独关闭：
  // - console：断言失败时的诊断输出
  // - any：构造不完整的桩数据、访问私有实现
  {
    files: ['src/test/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
