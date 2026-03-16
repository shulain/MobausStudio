import React from 'react';
import { Download, Upload, Database, Trash2, HardDrive } from 'lucide-react';
import { Button } from '../../common';
import { useI18n } from '../../../i18n';

/**
 * 数据设置组件 Props (v2.3.0)
 * v2.3.0: 新增 storagePercent 支持动态存储进度条
 */
interface DataSettingsProps {
    onExport: () => void;
    onImport: () => void;
    onClearData: () => void;
    storageSize?: string;
    storagePercent?: number;  // v2.3.0: 存储占用百分比 (0-100)
}

/**
 * 数据管理设置组件
 * 提供导出、导入、清除数据等功能
 * v2.3.0: 存储进度条支持动态百分比显示
 */
export const DataSettings: React.FC<DataSettingsProps> = ({
    onExport,
    onImport,
    onClearData,
    storageSize = '0 KB',
    storagePercent = 0,  // v2.3.0: 默认0%
}) => {
    const { t } = useI18n();

    return (
        <div className="space-y-8">
            {/* 配置管理 */}
            <section>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    {t.settings.dataManagement}
                </h3>
                <div className="bg-gray-50 rounded-[10px] p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h4 className="font-medium text-gray-900 mb-1">{t.settings.backupRestore}</h4>
                            <p className="text-sm text-gray-500">{t.settings.backupDesc}</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <Button
                            variant="secondary"
                            onClick={onExport}
                            icon={<Download className="w-4 h-4" />}
                        >
                            {t.settings.export}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={onImport}
                            icon={<Upload className="w-4 h-4" />}
                        >
                            {t.settings.import}
                        </Button>
                    </div>
                </div>
            </section>

            {/* 存储空间 */}
            <section>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <HardDrive className="w-5 h-5" />
                    {t.settings.storage}
                </h3>
                <div className="bg-white rounded-[10px] border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="font-medium text-gray-900 text-sm">{t.settings.storageUsage}</h4>
                            <p className="text-xs text-gray-500 mt-1">{t.settings.storageDesc}</p>
                        </div>
                        <span className="text-lg font-semibold text-gray-700">{storageSize}</span>
                    </div>
                    {/* v2.3.0: 存储进度条使用动态百分比 */}
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
                        <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(storagePercent, 100)}%` }}
                        ></div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <Button
                            variant="danger"
                            onClick={onClearData}
                            icon={<Trash2 className="w-4 h-4" />}
                            className="w-full justify-center"
                        >
                            {t.settings.clearData}
                        </Button>
                        <p className="text-xs text-red-500 mt-2 text-center">
                            {t.settings.clearWarning}
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
};
