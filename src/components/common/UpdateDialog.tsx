/**
 * 更新提示对话框组件
 *
 * 显示新版本信息并提供更新操作
 */

import React, { useState } from 'react';
import { X, Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { UpdateInfo, downloadAndInstall } from '../../services/updater';
import { logger, LogTags } from '../../utils/logger';

interface UpdateDialogProps {
  /** 更新信息 */
  updateInfo: UpdateInfo;
  /** 关闭对话框回调 */
  onClose: () => void;
}

/**
 * 更新提示对话框
 */
export const UpdateDialog: React.FC<UpdateDialogProps> = ({ updateInfo, onClose }) => {
  const { t } = useI18n();
  // 更新状态: idle | downloading | success | error
  const [status, setStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  // 下载进度 (0-100)
  const [progress, setProgress] = useState(0);
  // 错误信息
  const [errorMessage, setErrorMessage] = useState<string>('');

  /**
   * 处理立即更新
   */
  const handleUpdate = async () => {
    logger.info(LogTags.UI, '用户确认更新');
    setStatus('downloading');
    setProgress(0);

    try {
      await downloadAndInstall((downloaded, total) => {
        const percent = Math.round((downloaded / total) * 100);
        setProgress(percent);
      });

      setStatus('success');
      // 更新成功后应用会自动重启
    } catch (error) {
      logger.error(LogTags.UI, '更新失败', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '更新失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-[10px] shadow-xl w-[420px] max-w-[90vw]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t.messages.newVersionFound}
          </h2>
          <button
            onClick={onClose}
            disabled={status === 'downloading'}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-4 space-y-4">
          {/* 版本信息 */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t.messages.currentVersion}</span>
              <span className="text-gray-900 dark:text-white">{updateInfo.currentVersion}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t.messages.latestVersion}</span>
              <span className="text-green-600 dark:text-green-400 font-medium">
                {updateInfo.latestVersion}
              </span>
            </div>
            {updateInfo.releaseDate && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t.messages.releaseDate}</span>
                <span className="text-gray-900 dark:text-white">
                  {new Date(updateInfo.releaseDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* 更新说明 */}
          {updateInfo.releaseNotes && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t.messages.releaseNotes}
              </h3>
              <div className="max-h-32 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}

          {/* 下载进度 */}
          {status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t.messages.downloading} {progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-bl from-[#A688F6] to-[#009BF3] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 成功状态 */}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>{t.messages.downloadComplete}</span>
            </div>
          )}

          {/* 错误状态 */}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={status === 'downloading'}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
          >
            {t.messages.remindLater}
          </button>
          <button
            onClick={handleUpdate}
            disabled={status === 'downloading' || status === 'success'}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-gradient-to-bl from-[#A688F6] to-[#009BF3] hover:opacity-90 rounded-[10px] disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {status === 'error' ? t.messages.retry : t.messages.updateNow}
          </button>
        </div>
      </div>
    </div>
  );
};
