import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Modal, Button } from '../../common';
import type { ExportConfig } from '../../../types';
import { useI18n } from '../../../i18n';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (config: ExportConfig) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
    isOpen,
    onClose,
    onExport,
}) => {
    const { t } = useI18n();

    // v2.6.5: 添加 roundtableChats 和 settings 选项，默认选中
    const [config, setConfig] = useState<ExportConfig>({
        models: true,
        customProviders: true,
        agents: true,
        skills: true,
        mcp: true,
        chats: false,
        roundtableChats: false,  // v2.6.5: 圆桌对话默认不选中
        settings: true,          // v2.6.5: 应用设置默认选中
    });

    const handleToggle = (key: keyof ExportConfig) => {
        setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExport = () => {
        onExport(config);
        onClose();
    };

    // v2.6.5: 添加 roundtableChats 和 settings 选项
    const items = [
        { key: 'models' as const, label: t.exportModal.modelsConfig, desc: t.exportModal.modelsConfigDesc },
        { key: 'customProviders' as const, label: t.exportModal.customProvidersConfig, desc: t.exportModal.customProvidersConfigDesc },
        { key: 'agents' as const, label: t.exportModal.agentsConfig, desc: t.exportModal.agentsConfigDesc },
        { key: 'skills' as const, label: t.exportModal.skillsConfig, desc: t.exportModal.skillsConfigDesc },
        { key: 'mcp' as const, label: t.exportModal.mcpServers, desc: t.exportModal.mcpServersDesc },
        { key: 'chats' as const, label: t.exportModal.chatHistory, desc: t.exportModal.chatHistoryDesc },
        { key: 'roundtableChats' as const, label: t.exportModal.roundtableChats, desc: t.exportModal.roundtableChatsDesc },
        { key: 'settings' as const, label: t.exportModal.settingsConfig, desc: t.exportModal.settingsConfigDesc },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t.exportModal.title} size="md">
            <div className="space-y-4">
                <p className="text-sm text-gray-600">{t.exportModal.selectItems}</p>

                <div className="space-y-3">
                    {items.map((item) => (
                        <label
                            key={item.key}
                            className={`flex items-center gap-3 p-4 border-2 rounded-[10px] cursor-pointer transition-all ${config[item.key]
                                    ? 'border-purple-400 bg-purple-50'
                                    : 'border-gray-200 hover:border-purple-300'
                                }`}
                        >
                            <input
                                type="checkbox"
                                checked={config[item.key]}
                                onChange={() => handleToggle(item.key)}
                                className="w-5 h-5 accent-purple-500"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-sm text-gray-800">
                                    {item.label}
                                </div>
                                <div className="text-xs text-gray-500">{item.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>

                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>
                    <Button
                        onClick={handleExport}
                        icon={<Download className="w-4 h-4" />}
                        className="flex-1"
                    >
                        {t.exportModal.export}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ExportModal;
