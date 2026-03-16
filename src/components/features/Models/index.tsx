/**
 * ModelPage 模型配置页面 (v3.6.0)
 *
 * 管理AI模型API密钥和连接配置
 * - v3.5.0: 使用 PageHeader 组件优化头部布局，节省垂直空间
 * - v3.6.0: 添加批量检查模型可用性功能
 * - v3.6.3: 配额显示移至 ProviderCard，此处移除独立配额面板
 *
 * 对应文档: docs/modules/models.md
 */

import React, { useState } from 'react';
import { Cpu, Plus, CheckCircle, XCircle, Key, RefreshCw } from 'lucide-react';
import { Button, Modal, PageHeader, type StatItem } from '../../common';
import { ModelCard } from './ModelCard';
import { ModelModal } from './ModelModal';
import { useI18n } from '../../../i18n';
import type { AIModelConfig, ModelCreateInput, ModelProvider } from '../../../types';

interface ModelPageProps {
    models: AIModelConfig[];
    providers: ModelProvider[];
    onAddModel: (data: ModelCreateInput) => void;
    onUpdateModel: (id: string, data: ModelCreateInput) => void;
    onDeleteModel: (id: string) => void;
    onTestModel: (id: string) => void;
    /** v3.6.0: 批量测试所有模型 */
    onBatchTestModels?: () => Promise<void>;
}

export const ModelPage: React.FC<ModelPageProps> = ({
    models,
    providers,
    onAddModel,
    onUpdateModel,
    onDeleteModel,
    onTestModel,
    onBatchTestModels,
}) => {
    const { t } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const [providerFilter, setProviderFilter] = useState<string>('all');
    const [showModal, setShowModal] = useState(false);
    const [selectedModel, setSelectedModel] = useState<AIModelConfig | null>(null);
    const [testingModelId, setTestingModelId] = useState<string | null>(null);
    // v2.5.3: 删除确认对话框状态
    const [deleteConfirmModel, setDeleteConfirmModel] = useState<AIModelConfig | null>(null);
    // v3.6.0: 批量检查状态
    const [isBatchTesting, setIsBatchTesting] = useState(false);

    const filteredModels = models.filter((model) => {
        const matchesSearch =
            model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            model.provider.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesProvider = providerFilter === 'all' || model.provider === providerFilter;
        return matchesSearch && matchesProvider;
    });

    // 统计数据 - 转换为 StatItem 格式
    const stats: StatItem[] = [
        {
            label: t.models.total,
            value: models.length,
            color: 'default',
        },
        {
            label: t.models.online,
            value: models.filter((m) => m.status === 'online').length,
            icon: <CheckCircle />,
            color: 'success',
        },
        {
            label: t.models.offline,
            value: models.filter((m) => m.status === 'offline').length,
            icon: <XCircle />,
            color: 'default',
        },
        {
            label: t.models.configured,
            value: models.filter((m) => m.apiKeySet).length,
            icon: <Key />,
            color: 'info',
        },
    ];

    const handleEdit = (model: AIModelConfig) => {
        setSelectedModel(model);
        setShowModal(true);
    };

    const handleAdd = () => {
        setSelectedModel(null);
        setShowModal(true);
    };

    const handleSave = (data: ModelCreateInput) => {
        if (selectedModel) {
            onUpdateModel(selectedModel.id, data);
        } else {
            onAddModel(data);
        }
    };

    const handleTest = async (id: string) => {
        setTestingModelId(id);
        await onTestModel(id);
        setTimeout(() => setTestingModelId(null), 1000);
    };

    /**
     * v3.6.0: 批量检查所有模型可用性
     * 调用父组件传入的 onBatchTestModels 方法
     */
    const handleBatchTest = async () => {
        if (!onBatchTestModels || isBatchTesting) return;

        setIsBatchTesting(true);
        try {
            await onBatchTestModels();
        } finally {
            setIsBatchTesting(false);
        }
    };

    const uniqueProviders = [...new Set(models.map((m) => m.provider))];

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 使用 PageHeader 组件优化头部布局 */}
                <PageHeader
                    icon={<Cpu className="text-purple-600" />}
                    title={t.models.title}
                    subtitle={t.models.subtitle}
                    stats={stats}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={t.models.searchModels}
                    filters={
                        <select
                            value={providerFilter}
                            onChange={(e) => setProviderFilter(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100"
                        >
                            <option value="all">{t.models.allProviders}</option>
                            {uniqueProviders.map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    }
                    actions={
                        <div className="flex gap-2">
                            {/* v3.6.0: 批量检查按钮 */}
                            {onBatchTestModels && models.length > 0 && (
                                <Button
                                    variant="secondary"
                                    onClick={handleBatchTest}
                                    disabled={isBatchTesting}
                                    icon={<RefreshCw className={`w-4 h-4 ${isBatchTesting ? 'animate-spin' : ''}`} />}
                                >
                                    {isBatchTesting ? t.models.batchChecking : t.models.batchCheck}
                                </Button>
                            )}
                            <Button onClick={handleAdd} icon={<Plus className="w-4 h-4" />}>
                                {t.models.addModel}
                            </Button>
                        </div>
                    }
                />

                {/* 模型列表 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredModels.map((model) => (
                            <ModelCard
                                key={model.id}
                                model={model}
                                onEdit={() => handleEdit(model)}
                                onTest={() => handleTest(model.id)}
                                onDelete={() => setDeleteConfirmModel(model)}
                                isTesting={testingModelId === model.id}
                            />
                        ))}

                        {/* 添加新模型卡片 */}
                        <div
                            onClick={handleAdd}
                            className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all p-5 flex items-center justify-center cursor-pointer min-h-[200px]"
                        >
                            <div className="text-center">
                                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Plus className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{t.models.addModel}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t.models.configNewModel}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ModelModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                model={selectedModel}
                providers={providers}
                onSave={handleSave}
            />

            {/* v2.5.3: 删除确认对话框 */}
            <Modal
                isOpen={!!deleteConfirmModel}
                onClose={() => setDeleteConfirmModel(null)}
                title={t.models.deleteModel}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        {t.models.deleteModelConfirm.replace('{name}', deleteConfirmModel?.name || '')}
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirmModel(null)}
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => {
                                if (deleteConfirmModel) {
                                    onDeleteModel(deleteConfirmModel.id);
                                    setDeleteConfirmModel(null);
                                }
                            }}
                        >
                            {t.common.delete}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ModelPage;
