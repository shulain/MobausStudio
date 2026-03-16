/**
 * MCPPage MCP服务器管理页面 (v3.5.0)
 *
 * 管理MCP服务器配置和连接
 * - 服务器列表展示
 * - 添加/编辑/删除服务器
 * - 连接/断开/重连操作
 * - v2.6.0: 删除二次确认功能
 * - v3.5.0: 使用 PageHeader 组件优化头部布局，节省垂直空间
 *
 * 对应文档: docs/modules/mcp.md
 */

import React, { useState } from 'react';
import { PlugZap, Plus, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react';
import { Button, Modal, PageHeader, type StatItem } from '../../common';
import { MCPCard } from './MCPCard';
import { MCPModal } from './MCPModal';
import { useI18n } from '../../../i18n';
import type { MCPServer, MCPServerCreateInput, MCPStats } from '../../../types';

interface MCPPageProps {
    servers: MCPServer[];
    stats: MCPStats;
    onAddServer: (data: MCPServerCreateInput) => void;
    onUpdateServer: (id: string, data: MCPServerCreateInput) => void;
    onDeleteServer: (id: string) => void;
    /** 连接到 MCP 服务器 (v2.0.0) */
    onConnect: (id: string) => void;
    /** 断开 MCP 服务器连接 (v2.0.0) */
    onDisconnect: (id: string) => void;
    /** 重连 MCP 服务器 (v2.2.0) */
    onReconnect?: (id: string) => void;
    /** 检查指定 MCP 服务器是否正在操作中 (v2.0.0) */
    isLoading: (id: string) => boolean;
}

export const MCPPage: React.FC<MCPPageProps> = ({
    servers,
    stats,
    onAddServer,
    onUpdateServer,
    onDeleteServer,
    onConnect,
    onDisconnect,
    onReconnect,
    isLoading,
}) => {
    const { t } = useI18n();
    const [showModal, setShowModal] = useState(false);
    const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
    // v2.6.0: 删除确认对话框状态
    const [deleteConfirmServer, setDeleteConfirmServer] = useState<MCPServer | null>(null);

    const handleAdd = () => {
        setSelectedServer(null);
        setShowModal(true);
    };

    const handleConfigure = (server: MCPServer) => {
        setSelectedServer(server);
        setShowModal(true);
    };

    const handleSave = (data: MCPServerCreateInput) => {
        if (selectedServer) {
            onUpdateServer(selectedServer.id, data);
        } else {
            onAddServer(data);
        }
    };

    /**
     * 确认删除MCP服务器 (v2.6.0)
     * 执行实际的删除操作并关闭确认对话框
     */
    const handleConfirmDelete = () => {
        if (deleteConfirmServer) {
            onDeleteServer(deleteConfirmServer.id);
            setDeleteConfirmServer(null);
        }
    };

    // 统计数据 - 转换为 StatItem 格式
    const statItems: StatItem[] = [
        {
            label: t.mcp.connected,
            value: stats.connected,
            icon: <CheckCircle />,
            color: 'success',
        },
        {
            label: t.mcp.disconnected,
            value: stats.disconnected,
            icon: <AlertCircle />,
            color: 'warning',
        },
        {
            label: t.mcp.error,
            value: stats.error,
            icon: <XCircle />,
            color: 'error',
        },
        {
            label: t.mcp.totalRequests,
            value: stats.totalRequests >= 1000 ? `${(stats.totalRequests / 1000).toFixed(1)}K` : stats.totalRequests,
            icon: <Activity />,
            color: 'info',
        },
    ];

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 使用 PageHeader 组件优化头部布局 */}
                <PageHeader
                    icon={<PlugZap className="text-green-600" />}
                    title={t.mcp.title}
                    subtitle={t.mcp.subtitle}
                    stats={statItems}
                    actions={
                        <Button
                            onClick={handleAdd}
                            icon={<Plus className="w-4 h-4" />}
                            className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                        >
                            {t.mcp.addServer}
                        </Button>
                    }
                />

                {/* 服务器列表 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {servers.map((server) => (
                            <MCPCard
                                key={server.id}
                                server={server}
                                isLoading={isLoading(server.id)}
                                onConnect={() => onConnect(server.id)}
                                onDisconnect={() => onDisconnect(server.id)}
                                onReconnect={onReconnect ? () => onReconnect(server.id) : undefined}
                                onConfigure={() => handleConfigure(server)}
                                onDelete={() => setDeleteConfirmServer(server)}
                            />
                        ))}

                        {/* 添加服务器卡片 */}
                        <div
                            onClick={handleAdd}
                            className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all p-5 flex items-center justify-center cursor-pointer min-h-[200px]"
                        >
                            <div className="text-center">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Plus className="w-8 h-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{t.mcp.addServer}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t.mcp.noServersDesc}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <MCPModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                server={selectedServer}
                onSave={handleSave}
            />

            {/* v2.6.0: 删除确认对话框 */}
            <Modal
                isOpen={!!deleteConfirmServer}
                onClose={() => setDeleteConfirmServer(null)}
                title={t.mcp.deleteServer}
            >
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        {t.mcp.deleteServerConfirm.replace('{name}', deleteConfirmServer?.name || '')}
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirmServer(null)}
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirmDelete}
                        >
                            {t.common.delete}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MCPPage;
