import { AlertCircle, CheckCircle, Download, ExternalLink, Github, Info, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { checkForUpdates, downloadAndInstall, getCurrentVersion, type UpdateInfo } from '../../../services/updater';
import { logger, LogTags } from '../../../utils/logger';
import { isTauri } from '../../../utils/platform';
import { Button } from '../../common';

interface AboutSettingsProps {
    version: string;
    onCheckUpdate: () => void;
}

/**
 * 关于设置组件
 *
 * 显示应用信息、版本号，并提供手动检查更新功能
 */
export const AboutSettings: React.FC<AboutSettingsProps> = ({
    version: _version, // 保留 prop 以保持接口兼容，但使用动态获取的版本
    onCheckUpdate: _onCheckUpdate, // 保留 prop 以保持接口兼容
}) => {
    const { t } = useI18n();

    // 当前版本号（动态获取）
    const [currentVersion, setCurrentVersion] = useState<string>('...');
    // 检查更新状态: idle | checking | available | upToDate | error | downloading
    const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'available' | 'upToDate' | 'error' | 'downloading'>('idle');
    // 更新信息
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    // 下载进度
    const [downloadProgress, setDownloadProgress] = useState(0);
    // 错误信息
    const [errorMessage, setErrorMessage] = useState<string>('');

    // 获取当前版本号
    useEffect(() => {
        if (isTauri()) {
            getCurrentVersion().then(setCurrentVersion);
        } else {
            setCurrentVersion('Web');
        }
    }, []);

    /**
     * 手动检查更新
     */
    const handleCheckUpdate = async () => {
        if (!isTauri()) {
            // Web 版本不支持更新
            setCheckStatus('upToDate');
            return;
        }

        setCheckStatus('checking');
        setErrorMessage('');

        try {
            logger.info(LogTags.UI, '手动检查更新');
            const info = await checkForUpdates();
            setUpdateInfo(info);

            if (info.available) {
                setCheckStatus('available');
                logger.info(LogTags.UI, '发现新版本', { version: info.latestVersion });
            } else {
                setCheckStatus('upToDate');
                logger.info(LogTags.UI, '当前已是最新版本');
            }
        } catch (error) {
            setCheckStatus('error');
            setErrorMessage(error instanceof Error ? error.message : '检查更新失败');
            logger.error(LogTags.UI, '检查更新失败', error);
        }
    };

    /**
     * 下载并安装更新
     */
    const handleDownloadUpdate = async () => {
        setCheckStatus('downloading');
        setDownloadProgress(0);

        try {
            logger.info(LogTags.UI, '开始下载更新');
            await downloadAndInstall((downloaded, total) => {
                const percent = Math.round((downloaded / total) * 100);
                setDownloadProgress(percent);
            });
            // 下载完成后应用会自动重启
        } catch (error) {
            setCheckStatus('error');
            setErrorMessage(error instanceof Error ? error.message : '下载更新失败');
            logger.error(LogTags.UI, '下载更新失败', error);
        }
    };

    /**
     * 渲染更新状态信息
     */
    const renderUpdateStatus = () => {
        switch (checkStatus) {
            case 'checking':
                return (
                    <div className="flex items-center gap-2 text-blue-600">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{t.messages.checkingUpdate}</span>
                    </div>
                );
            case 'available':
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span>{t.messages.newVersionFound}: {updateInfo?.latestVersion}</span>
                        </div>
                        {updateInfo?.releaseNotes && (
                            <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded max-h-20 overflow-y-auto">
                                {updateInfo.releaseNotes}
                            </div>
                        )}
                        <Button
                            onClick={handleDownloadUpdate}
                            icon={<Download className="w-4 h-4" />}
                            className="w-full justify-center bg-green-500 hover:bg-green-600"
                        >
                            {t.messages.downloadAndInstall}
                        </Button>
                    </div>
                );
            case 'upToDate':
                return (
                    <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span>{t.messages.upToDate}</span>
                    </div>
                );
            case 'downloading':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-blue-600">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>{t.messages.downloading} {downloadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>{errorMessage}</span>
                    </div>
                );
            default:
                return (
                    <p className="text-xs text-gray-400">
                        {t.messages.clickToCheckUpdate}
                    </p>
                );
        }
    };

    return (
        <div className="space-y-8">
            <div className="text-center py-8">
                <div className="w-20 h-20 bg-gradient-to-br from-[#A688F6] to-[#009BF3] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-xl">
                    <span className="text-white text-3xl font-bold">M</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Mobaus Studio</h2>
                <p className="text-gray-500">{t.settings.description}</p>
            </div>

            <section className="bg-gray-50 rounded-[10px] border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Info className="w-5 h-5 text-gray-500" />
                        <span className="font-medium text-gray-700">{t.settings.version}</span>
                    </div>
                    <span className="text-gray-900 font-mono">{currentVersion}</span>
                </div>
                <div className="p-6 space-y-4">
                    <Button
                        onClick={handleCheckUpdate}
                        disabled={checkStatus === 'checking' || checkStatus === 'downloading'}
                        icon={<RefreshCw className={`w-4 h-4 ${checkStatus === 'checking' ? 'animate-spin' : ''}`} />}
                        className="w-full justify-center"
                    >
                        {t.settings.checkUpdate}
                    </Button>
                    <div className="text-center">
                        {renderUpdateStatus()}
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider px-2">Links</h3>
                <a
                    href="https://github.com/shulain/MobausStudio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-[10px] hover:border-purple-300 hover:shadow-sm transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <Github className="w-5 h-5 text-gray-600 group-hover:text-purple-600 transition-colors" />
                        <span className="text-gray-700 group-hover:text-gray-900">GitHub</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-purple-400" />
                </a>
                <a
                    href="https://github.com/shulain/MobausStudio/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-[10px] hover:border-purple-300 hover:shadow-sm transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <Download className="w-5 h-5 text-gray-600 group-hover:text-purple-600 transition-colors" />
                        <span className="text-gray-700 group-hover:text-gray-900">Releases</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-purple-400" />
                </a>
            </section>

            <div className="text-center text-xs text-gray-400 pt-8">
                <p>&copy; 2026 Mobaus Studio. All rights reserved.</p>
            </div>
        </div>
    );
};
