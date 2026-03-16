/**
 * ConfigSwitcher 模块类型定义
 */

// 外部 CLI 工具 ID
export type ToolId = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode' | 'openclaw';

// 外部工具信息
export interface ExternalTool {
  id: ToolId;
  name: string;
  icon: string;
  configFiles: string[];
  supportsMcp: boolean;
  supportsSkills: boolean;
}

// 导出配置状态
export interface ExportConfig {
  selectedProviderId: string | null;
  selectedToolId: ToolId;
  includeMcp: boolean;
  includeSkills: boolean;
}

// 导出进度
export interface ExportProgress {
  isExporting: boolean;
  message: string;
}
