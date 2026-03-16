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
      'src/test/**',  // 忽略测试文件，减少噪声
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
      // 禁止使用 console.log（警告级别）
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 禁止使用 any 类型（警告级别）
      '@typescript-eslint/no-explicit-any': 'warn',

      // 禁止未使用的变量（警告级别）
      '@typescript-eslint/no-unused-vars': ['warn', {
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
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
