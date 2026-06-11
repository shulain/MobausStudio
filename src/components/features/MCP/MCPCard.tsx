import React, { useState } from 'react';
import {
    CheckCircle, XCircle, AlertCircle, RefreshCw, Play, Square,
    Settings, Trash2, Loader2, Terminal, Globe, Wrench, Zap,
    ChevronDown, ChevronUp
} from 'lucide-react';
import type { MCPServer } from '../../../types';
import { useI18n } from '../../../i18n';

interface MCPCardProps {
    server: MCPServer;
    /** 当前服务器是否正在连接/操作中 (v2.0.0) */
    isLoading?: boolean;
    /** 连接到服务器 */
    onConnect: () => void;
    /** 断开服务器连接 */
    onDisconnect: () => void;
    /** 重连服务器 (v2.2.0) */
    onReconnect?: () => void;
    /** 配置服务器 */
    onConfigure: () => void;
    /** 删除服务器 */
    onDelete: () => void;
}

export const MCPCard: React.FC<MCPCardProps> = ({
    server,
    isLoading = false,
    onConnect,
    onDisconnect,
    onReconnect,
    onConfigure,
    onDelete,
}) => {
    const { t, language } = useI18n();
    // v2.3.0: 工具列表展开状态
    const [toolsExpanded, setToolsExpanded] = useState(false);

    // 获取状态图标 (v2.0.0: 支持 connecting 状态)
    const getStatusIcon = () => {
        if (isLoading || server.status === 'connecting') {
            return <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />;
        }
        switch (server.status) {
            case 'connected':
                return <CheckCircle className="w-8 h-8 text-green-600" />;
            case 'error':
                return <XCircle className="w-8 h-8 text-red-600" />;
            default:
                return <AlertCircle className="w-8 h-8 text-gray-600 dark:text-gray-400" />;
        }
    };

    // 获取状态背景色
    const getStatusBg = () => {
        if (isLoading || server.status === 'connecting') {
            return 'bg-blue-100 dark:bg-blue-900/40';
        }
        switch (server.status) {
            case 'connected':
                return 'bg-green-100 dark:bg-green-900/40';
            case 'error':
                return 'bg-red-100 dark:bg-red-900/40';
            default:
                return 'bg-gray-100 dark:bg-gray-700';
        }
    };

    // 获取状态文本和颜色
    const getStatusText = () => {
        if (isLoading || server.status === 'connecting') {
            return { text: t.mcp.connecting, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' };
        }
        switch (server.status) {
            case 'connected':
                return { text: t.mcp.connected, color: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' };
            case 'error':
                return { text: t.mcp.error, color: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' };
            default:
                return { text: t.mcp.disconnected, color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' };
        }
    };

    const status = getStatusText();
    const isConnected = server.status === 'connected';
    const isConnecting = isLoading || server.status === 'connecting';

    // 获取传输类型显示
    // v3.6.0: 添加完整命令用于 tooltip 显示
    const getTransportDisplay = () => {
        if (server.transportType === 'stdio') {
            const cmdDisplay = server.command || 'npx';
            const argsDisplay = server.args?.slice(0, 2).join(' ') || '';
            const fullCommand = server.args ? `${cmdDisplay} ${server.args.join(' ')}` : cmdDisplay;
            return {
                icon: <Terminal className="w-3 h-3" />,
                label: 'stdio',
                detail: argsDisplay ? `${cmdDisplay} ${argsDisplay}${server.args && server.args.length > 2 ? '...' : ''}` : cmdDisplay,
                fullDetail: fullCommand,
            };
        } else {
            return {
                icon: <Globe className="w-3 h-3" />,
                label: 'HTTP',
                detail: server.endpoint || '',
                fullDetail: server.endpoint || '',
            };
        }
    };

    const transport = getTransportDisplay();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all p-5">
            {/* 顶部：图标 + 名称/状态/描述 */}
            <div className="flex items-start gap-4">
                <div
                    className={`w-16 h-16 rounded-[10px] flex items-center justify-center flex-shrink-0 ${getStatusBg()}`}
                >
                    {getStatusIcon()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg flex items-center gap-2 flex-wrap">
                                {server.name}
                                <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                                >
                                    {status.text}
                                </span>
                                {/* 自启动标识 (v2.2.0) */}
                                {server.autoStart && (
                                    <span
                                        className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 flex items-center gap-1"
                                        title={t.mcp.autoStartTitle}
                                    >
                                        <Zap className="w-3 h-3" />
                                        {t.mcp.autoStartBadge}
                                    </span>
                                )}
                            </h3>
                            <p
                                className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate cursor-help"
                                title={server.description}
                            >
                                {server.description}
                            </p>
                            {/* 传输类型和配置 */}
                            <div className="flex items-center gap-2 text-sm mt-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs font-medium">
                                    {transport.icon}
                                    {transport.label}
                                </span>
                                <code
                                    className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-800 dark:text-gray-200 truncate max-w-xs cursor-help"
                                    title={transport.fullDetail}
                                >
                                    {transport.detail}
                                </code>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={onDelete}
                                disabled={isConnecting}
                                title={t.mcp.deleteServer}
                                aria-label={t.mcp.deleteServer}
                                className={`p-2 rounded-[10px] transition-colors ${
                                    isConnecting
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'hover:bg-red-50 dark:hover:bg-red-900/30'
                                }`}
                            >
                                <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 下方内容：全宽布局，不被图标挤压 */}
            <div className="mt-3 space-y-2">
                {/* 服务器信息 (连接后显示) */}
                {isConnected && server.serverInfo && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{t.mcp.server}:</span>
                        <span className="text-gray-700 dark:text-gray-300">
                            {server.serverInfo.name} v{server.serverInfo.version}
                        </span>
                    </div>
                )}

                {/* 错误信息显示 */}
                {server.status === 'error' && server.errorMessage && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-[10px] border border-red-200 dark:border-red-800">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-red-600 dark:text-red-400 break-all">
                            {server.errorMessage}
                        </span>
                    </div>
                )}

                {/* 工具列表 (连接后显示) */}
                {isConnected && server.tools && server.tools.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <Wrench className="w-3 h-3" />
                                {t.mcp.tools} ({server.tools.length})
                            </span>
                            {server.tools.length > 5 && (
                                <button
                                    onClick={() => setToolsExpanded(!toolsExpanded)}
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    {toolsExpanded ? (
                                        <>{t.mcp.collapse} <ChevronUp className="w-3 h-3" /></>
                                    ) : (
                                        <>{t.mcp.expandAll} <ChevronDown className="w-3 h-3" /></>
                                    )}
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                            {(toolsExpanded ? server.tools : server.tools.slice(0, 5)).map((tool, idx) => (
                                <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium cursor-help"
                                    title={tool.description || t.mcp.noDescription}
                                >
                                    {tool.name}
                                </span>
                            ))}
                            {!toolsExpanded && server.tools.length > 5 && (
                                <button
                                    onClick={() => setToolsExpanded(true)}
                                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    +{server.tools.length - 5}
                                </button>
                            )}
                        </div>

                        {toolsExpanded && (
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 rounded-[10px] p-2">
                                {server.tools.map((tool, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-600 last:border-0"
                                    >
                                        <span className="font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                            {tool.name}
                                        </span>
                                        <span className="text-gray-600 dark:text-gray-400 line-clamp-2">
                                            {tool.description || t.mcp.noDescription}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 服务器能力显示 */}
                {!isConnected && server.capabilities && (
                    <div className="flex flex-wrap gap-1">
                        {server.capabilities.tools && (
                            <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium">
                                {t.mcp.capabilities.tools}
                            </span>
                        )}
                        {server.capabilities.resources && (
                            <span className="px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs font-medium">
                                {t.mcp.capabilities.resources}
                            </span>
                        )}
                        {server.capabilities.prompts && (
                            <span className="px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-xs font-medium">
                                {t.mcp.capabilities.prompts}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span>{t.mcp.requests}: {server.requestCount}</span>
                    {server.lastActiveAt && (
                        <>
                            <span className="mx-2">|</span>
                            <span>{t.mcp.lastActivity}: {new Date(server.lastActiveAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                        </>
                    )}
                </div>

                <div className="flex gap-2">
                    {/* 连接/断开按钮 */}
                    {isConnected ? (
                        <button
                            onClick={onDisconnect}
                            disabled={isConnecting}
                            className={`px-3 py-1.5 rounded-[10px] text-sm font-medium flex items-center gap-1 transition-colors ${
                                isConnecting
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    : 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400'
                            }`}
                        >
                            <Square className="w-3 h-3" />
                            {t.mcp.disconnect}
                        </button>
                    ) : (
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            className={`px-3 py-1.5 rounded-[10px] text-sm font-medium flex items-center gap-1 transition-colors ${
                                isConnecting
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-400 dark:text-blue-500 cursor-not-allowed'
                                    : 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400'
                            }`}
                        >
                            {isConnecting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Play className="w-3 h-3" />
                            )}
                            {isConnecting ? t.mcp.connecting : t.mcp.connect}
                        </button>
                    )}

                    {/* 重连按钮 */}
                    {isConnected && onReconnect && (
                        <button
                            onClick={onReconnect}
                            disabled={isConnecting}
                            className={`px-3 py-1.5 rounded-[10px] text-sm font-medium flex items-center gap-1 transition-colors ${
                                isConnecting
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            <RefreshCw className="w-3 h-3" />
                            {t.mcp.reconnect}
                        </button>
                    )}

                    {/* 配置按钮 */}
                    <button
                        onClick={onConfigure}
                        disabled={isConnecting}
                        className={`px-3 py-1.5 rounded-[10px] text-sm font-medium flex items-center gap-1 transition-colors ${
                            isConnecting
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                : 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        }`}
                    >
                        <Settings className="w-3 h-3" />
                        {t.mcp.configure}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MCPCard;
