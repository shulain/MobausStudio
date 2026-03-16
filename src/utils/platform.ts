/**
 * 平台检测工具模块
 *
 * 提供运行环境检测功能，用于区分 Tauri 桌面应用和 Web 浏览器环境
 */

/**
 * 检测当前是否运行在 Tauri 桌面应用环境中
 *
 * @returns 如果在 Tauri 环境中返回 true，否则返回 false
 */
export function isTauri(): boolean {
  // Tauri 会在 window 对象上注入 __TAURI__ 或 __TAURI_INTERNALS__
  return typeof window !== 'undefined' && (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window
  );
}

/**
 * 检测当前是否运行在 Web 浏览器环境中
 *
 * @returns 如果在浏览器环境中返回 true，否则返回 false
 */
export function isWeb(): boolean {
  return !isTauri();
}
