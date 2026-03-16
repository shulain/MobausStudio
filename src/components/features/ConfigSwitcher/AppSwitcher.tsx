/**
 * AppSwitcher 组件
 *
 * 用于选择目标 CLI 工具，紧凑水平胶囊按钮布局
 */

import React from 'react';
import type { ToolId } from './types';

interface AppSwitcherProps {
  activeApp?: ToolId; // 单选模式：当前激活的工具
  selectedApps?: ToolId[]; // 多选模式：已选中的工具列表
  multiSelect?: boolean; // 是否启用多选模式
  enabledProviders?: Record<ToolId, string | null>; // 各工具的启用状态
  onSwitch: (app: ToolId) => void; // 单选模式回调
  onToggle?: (app: ToolId) => void; // 多选模式回调
}

const ALL_TOOLS: ToolId[] = ['claude-code', 'codex', 'gemini-cli', 'opencode', 'openclaw'];

const TOOL_DISPLAY_NAMES: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'gemini-cli': 'Gemini CLI',
  'opencode': 'OpenCode',
  'openclaw': 'OpenClaw',
};

/** 每个工具的品牌色（用于选中状态的圆点指示器） */
const TOOL_COLORS: Record<ToolId, string> = {
  'claude-code': 'bg-orange-500',
  'codex': 'bg-emerald-500',
  'gemini-cli': 'bg-blue-500',
  'opencode': 'bg-violet-500',
  'openclaw': 'bg-rose-500',
};

export const AppSwitcher: React.FC<AppSwitcherProps> = ({
  activeApp,
  selectedApps = [],
  multiSelect = false,
  enabledProviders = {},
  onSwitch,
  onToggle
}) => {
  // 处理点击事件
  const handleClick = (tool: ToolId) => {
    if (multiSelect && onToggle) {
      onToggle(tool);
    } else {
      onSwitch(tool);
    }
  };

  // 判断工具是否被选中
  const isSelected = (tool: ToolId) => {
    if (multiSelect) {
      return selectedApps.includes(tool);
    }
    return activeApp === tool;
  };

  // 判断工具是否已配置
  const isConfigured = (tool: ToolId) => {
    return enabledProviders[tool] != null;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TOOLS.map((tool) => {
        const selected = isSelected(tool);
        const configured = isConfigured(tool);

        return (
          <button
            key={tool}
            type="button"
            onClick={() => handleClick(tool)}
            className={`
              relative flex items-center gap-2 px-3.5 py-2 rounded-full border-2
              transition-all duration-200 cursor-pointer text-sm font-medium
              ${selected
                ? 'border-purple-500 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 shadow-sm'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-600'
              }
            `}
          >
            {/* 多选模式 checkbox */}
            {multiSelect && (
              <svg
                className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-purple-500' : 'text-gray-400'}`}
                fill={selected ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 20 20"
              >
                {selected ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                ) : (
                  <circle cx="10" cy="10" r="8" strokeWidth="2" />
                )}
              </svg>
            )}

            {/* 品牌色圆点 */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TOOL_COLORS[tool]}`} />

            {/* 工具名称 */}
            <span className="whitespace-nowrap">{TOOL_DISPLAY_NAMES[tool]}</span>

            {/* 已配置对勾标记 */}
            {configured && (
              <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
};
