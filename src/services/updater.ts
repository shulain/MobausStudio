/**
 * 软件更新服务模块
 *
 * 提供应用程序自动更新检查和安装功能
 * 使用 Tauri updater 插件实现
 */

import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { logger, LogTags } from '../utils/logger';

/**
 * 更新信息接口
 */
export interface UpdateInfo {
  /** 是否有新版本 */
  available: boolean;
  /** 当前版本 */
  currentVersion: string;
  /** 最新版本 */
  latestVersion?: string;
  /** 更新说明 */
  releaseNotes?: string;
  /** 发布日期 */
  releaseDate?: string;
}

/**
 * 更新进度回调
 */
export type UpdateProgressCallback = (progress: number, total: number) => void;

// 缓存的更新对象
let cachedUpdate: Update | null = null;

function isDevelopmentVersion(version: string): boolean {
  const normalized = version.trim().toLowerCase();
  return normalized === '0.0.0-dev' || normalized.endsWith('-dev') || normalized.includes('.dev');
}

/**
 * 检查是否有新版本
 *
 * @returns 更新信息
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  logger.info(LogTags.APP, '开始检查更新');

  try {
    // 获取当前版本
    const currentVersion = await getVersion();
    logger.info(LogTags.APP, `当前版本: ${currentVersion}`);

    if (isDevelopmentVersion(currentVersion)) {
      logger.info(LogTags.APP, '开发版本跳过自动更新检查');
      cachedUpdate = null;

      return {
        available: false,
        currentVersion,
      };
    }

    // 检查更新
    const update = await check();

    if (update) {
      cachedUpdate = update;
      logger.info(LogTags.APP, `发现新版本: ${update.version}`);

      return {
        available: true,
        currentVersion,
        latestVersion: update.version,
        releaseNotes: update.body || undefined,
        releaseDate: update.date || undefined,
      };
    } else {
      logger.info(LogTags.APP, '已是最新版本');
      cachedUpdate = null;

      return {
        available: false,
        currentVersion,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(LogTags.APP, `检查更新失败: ${errorMsg}`);

    throw new Error('检查更新失败', { cause: error });
  }
}

/**
 * 下载并安装更新
 *
 * @param onProgress 下载进度回调
 */
export async function downloadAndInstall(onProgress?: UpdateProgressCallback): Promise<void> {
  logger.info(LogTags.APP, '开始下载更新');

  if (!cachedUpdate) {
    throw new Error('没有可用的更新，请先检查更新');
  }

  try {
    let downloaded = 0;
    let totalSize = 0;

    // 下载更新
    await cachedUpdate.downloadAndInstall((event) => {
      if (event.event === 'Started' && event.data.contentLength) {
        totalSize = event.data.contentLength;
        logger.info(LogTags.APP, `开始下载，总大小: ${totalSize} bytes`);
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        if (onProgress && totalSize > 0) {
          onProgress(downloaded, totalSize);
        }
      } else if (event.event === 'Finished') {
        logger.info(LogTags.APP, '下载完成');
      }
    });

    logger.info(LogTags.APP, '更新安装完成，正在重启应用...');

    // 重启应用以应用更新
    // 注意：不使用 await，因为如果重启成功，Promise 永远不会 resolve
    // 使用 setTimeout 确保日志和 UI 状态更新后再重启
    setTimeout(() => {
      relaunch().catch((err) => {
        logger.error(LogTags.APP, `重启失败: ${err}`);
      });
    }, 100);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(LogTags.APP, `下载或安装更新失败: ${errorMsg}`);
    throw new Error('更新失败', { cause: error });
  }
}

/**
 * 获取当前应用版本
 */
export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return '未知';
  }
}
