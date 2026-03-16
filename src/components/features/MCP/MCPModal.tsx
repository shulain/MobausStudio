import React, { useState, useEffect, useMemo } from 'react';
import { PlugZap, AlertCircle, Terminal, Globe, Zap } from 'lucide-react';
import { Modal, Button, Input, Textarea, Select } from '../../common';
import { useI18n } from '../../../i18n';
import type { MCPServer, MCPServerCreateInput, MCPTransportType } from '../../../types';
import { logger, LogTags } from '../../../utils/logger';

/**
 * 验证 HTTP 端点地址格式 (v1.1.0)
 *
 * 支持以下格式:
 * - http://host:port/path
 * - https://host:port/path
 * - ws://host:port/path
 * - wss://host:port/path
 * - localhost:port (自动补全为 http://)
 */
const isValidEndpoint = (endpoint: string): boolean => {
    if (!endpoint.trim()) return false;

    // 如果是 localhost 或纯 host:port 格式，视为有效
    if (/^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/.test(endpoint)) {
        return true;
    }

    // 检查完整 URL 格式
    try {
        const url = new URL(endpoint);
        return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol);
    } catch {
        return false;
    }
};

/**
 * 验证 stdio 命令格式
 * 命令不能为空，且不能包含危险字符
 */
const isValidCommand = (command: string): boolean => {
    const trimmed = command.trim();
    if (!trimmed) return false;
    // 基本安全检查：不允许 shell 操作符
    if (/[;&|`$]/.test(trimmed)) return false;
    return true;
};

/** 表单验证错误类型 */
interface ValidationErrors {
    name?: string;
    description?: string;
    transportType?: string;
    command?: string;
    args?: string;
    endpoint?: string;
    authValue?: string;
}

interface MCPModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: MCPServer | null;
    onSave: (data: MCPServerCreateInput) => void;
}

export const MCPModal: React.FC<MCPModalProps> = ({
    isOpen,
    onClose,
    server,
    onSave,
}) => {
    const { t } = useI18n();

    // 基础信息
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    // 启用与自启动配置 (v2.2.0)
    const [enabled, setEnabled] = useState(true);
    const [autoStart, setAutoStart] = useState(false);

    // 传输配置 (v2.0.0)
    const [transportType, setTransportType] = useState<MCPTransportType>('stdio');

    // stdio 配置
    const [command, setCommand] = useState('');
    const [argsText, setArgsText] = useState('');  // 逗号分隔的参数
    const [envText, setEnvText] = useState('');    // KEY=VALUE 格式，每行一个

    // HTTP 配置
    const [endpoint, setEndpoint] = useState('');

    // 认证配置
    const [authType, setAuthType] = useState<'none' | 'apikey' | 'token'>('none');
    const [authValue, setAuthValue] = useState('');

    // 标记是否尝试过提交 (用于显示验证错误)
    const [attempted, setAttempted] = useState(false);

    useEffect(() => {
        if (server) {
            setName(server.name);
            setDescription(server.description);

            // 启用与自启动配置 (v2.2.0)
            setEnabled(server.enabled !== false);  // 默认启用，兼容旧数据
            setAutoStart(server.autoStart || false);

            setTransportType(server.transportType || 'stdio');

            // stdio 配置
            setCommand(server.command || '');
            setArgsText(server.args?.join(', ') || '');
            setEnvText(
                server.env
                    ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n')
                    : ''
            );

            // HTTP 配置
            setEndpoint(server.endpoint || '');

            // 认证
            setAuthType(server.authType);
            setAuthValue(server.authValue || '');
        } else {
            // 重置为默认值
            setName('');
            setDescription('');
            setEnabled(true);
            setAutoStart(false);
            setTransportType('stdio');
            setCommand('');
            setArgsText('');
            setEnvText('');
            setEndpoint('');
            setAuthType('none');
            setAuthValue('');
        }
        // 重置提交尝试标记
        setAttempted(false);
    }, [server, isOpen]);

    /**
     * 解析参数文本为数组
     * 支持逗号分隔: -y, @modelcontextprotocol/server-filesystem, /path
     */
    const parseArgs = (text: string): string[] => {
        if (!text.trim()) return [];
        return text.split(',').map(arg => arg.trim()).filter(Boolean);
    };

    /**
     * 解析环境变量文本为对象
     * 支持 KEY=VALUE 格式，每行一个
     */
    const parseEnv = (text: string): Record<string, string> => {
        if (!text.trim()) return {};
        const env: Record<string, string> = {};
        text.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.includes('=')) return;
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim();
            if (key) env[key] = value;
        });
        return env;
    };

    /**
     * 表单验证 (v2.0.0)
     *
     * 验证规则:
     * - 名称: 1-50字符, 必填
     * - 描述: 可选, 最大200字符
     * - stdio: command 必填，args 可选
     * - http: endpoint 必填, 有效URL格式
     * - 认证值: 认证类型不为 none 时必填
     */
    const errors = useMemo<ValidationErrors>(() => {
        const errs: ValidationErrors = {};

        // 名称验证
        const trimmedName = name.trim();
        if (!trimmedName) {
            errs.name = t.mcp.serverNameRequired;
        } else if (trimmedName.length > 50) {
            errs.name = t.mcp.serverNameTooLong;
        }

        // 描述验证
        if (description.length > 200) {
            errs.description = t.mcp.descriptionTooLong;
        }

        // 传输类型相关验证
        if (transportType === 'stdio') {
            // stdio: 验证命令
            if (!command.trim()) {
                errs.command = t.mcp.startCommandRequired;
            } else if (!isValidCommand(command)) {
                errs.command = t.mcp.startCommandInvalid;
            }
        } else if (transportType === 'http') {
            // http: 验证端点
            if (!endpoint.trim()) {
                errs.endpoint = t.mcp.endpointRequired;
            } else if (!isValidEndpoint(endpoint)) {
                errs.endpoint = t.mcp.endpointInvalid;
            }
        }

        // 认证值验证
        if (authType !== 'none' && !authValue.trim()) {
            errs.authValue = `${authType === 'apikey' ? 'API Key' : 'Token'} ${t.mcp.endpointRequired.replace(t.mcp.endpoint, '')}`;
        }

        return errs;
    }, [name, description, transportType, command, endpoint, authType, authValue, t]);

    // 表单是否有效
    const isValid = Object.keys(errors).length === 0;

    const handleSubmit = () => {
        setAttempted(true);

        // 如果有验证错误，不提交
        if (!isValid) {
            if (import.meta.env.DEV) {
                logger.debug(LogTags.MCP, '表单验证失败', errors);
            }
            return;
        }

        const data: MCPServerCreateInput = {
            name: name.trim(),
            description: description.trim(),
            transportType,
            // 启用与自启动配置 (v2.2.0)
            enabled,
            autoStart,
            authType,
            authValue: authValue.trim() || undefined,
        };

        // 根据传输类型添加配置
        if (transportType === 'stdio') {
            data.command = command.trim();
            const args = parseArgs(argsText);
            if (args.length > 0) data.args = args;
            const env = parseEnv(envText);
            if (Object.keys(env).length > 0) data.env = env;
        } else if (transportType === 'http') {
            data.endpoint = endpoint.trim();
        }

        onSave(data);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={server ? t.mcp.editServer : t.mcp.addServer}
            size="md"
        >
            <div className="space-y-5">
                {/* 头部信息 */}
                <div className="p-4 bg-gradient-to-bl from-purple-50 to-blue-50 dark:from-purple-900/30 dark:to-blue-900/30 rounded-[10px] border border-purple-200 dark:border-purple-700">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] rounded-[10px] text-white">
                            <PlugZap className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t.mcp.serverConfig}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t.mcp.serverConfigDesc}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 服务器名称 (必填, 1-50字符) */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.mcp.serverName} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        value={name}
                        onChange={setName}
                        placeholder={t.mcp.namePlaceholder}
                    />
                    {attempted && errors.name && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                            <AlertCircle className="w-3 h-3" />
                            {errors.name}
                        </div>
                    )}
                </div>

                {/* 描述 (可选, 最大200字符) */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.mcp.description}
                    </label>
                    <Textarea
                        value={description}
                        onChange={setDescription}
                        placeholder={t.mcp.descriptionPlaceholder}
                        rows={2}
                    />
                    {attempted && errors.description && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                            <AlertCircle className="w-3 h-3" />
                            {errors.description}
                        </div>
                    )}
                </div>

                {/* 启用与自启动配置 (v2.2.0) */}
                <div className="grid grid-cols-2 gap-4">
                    {/* 启用开关 */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-[10px]">
                        <div>
                            <div className="font-medium text-sm text-gray-700 dark:text-gray-200">{t.mcp.enableServer}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t.mcp.enableServerDesc}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEnabled(!enabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                    enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    {/* 自启动开关 */}
                    <div className={`flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-[10px] ${!enabled ? 'opacity-50' : ''}`}>
                        <div>
                            <div className="font-medium text-sm text-gray-700 dark:text-gray-200 flex items-center gap-1">
                                <Zap className="w-3 h-3 text-yellow-500" />
                                {t.mcp.autoStart}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{t.mcp.autoStartDesc}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAutoStart(!autoStart)}
                            disabled={!enabled}
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                                autoStart && enabled ? 'bg-yellow-500' : 'bg-gray-300 dark:bg-gray-600'
                            } ${!enabled ? 'cursor-not-allowed' : ''}`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                    autoStart && enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* 传输类型选择 (v2.0.0) */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.mcp.transportType} <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setTransportType('stdio')}
                            className={`p-3 rounded-[10px] border-2 transition-all flex items-center gap-2 ${
                                transportType === 'stdio'
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                        >
                            <Terminal className="w-4 h-4" />
                            <div className="text-left">
                                <div className="font-medium text-sm">{t.mcp.transportStdio}</div>
                                <div className="text-xs opacity-70">{t.mcp.transportStdioDesc}</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setTransportType('http')}
                            className={`p-3 rounded-[10px] border-2 transition-all flex items-center gap-2 ${
                                transportType === 'http'
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                        >
                            <Globe className="w-4 h-4" />
                            <div className="text-left">
                                <div className="font-medium text-sm">{t.mcp.transportHttp}</div>
                                <div className="text-xs opacity-70">{t.mcp.transportHttpDesc}</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* stdio 传输配置 */}
                {transportType === 'stdio' && (
                    <>
                        {/* 启动命令 */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                {t.mcp.startCommand} <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={command}
                                onChange={setCommand}
                                placeholder={t.mcp.commandPlaceholder}
                                className="font-mono text-sm"
                            />
                            {attempted && errors.command && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                                    <AlertCircle className="w-3 h-3" />
                                    {errors.command}
                                </div>
                            )}
                        </div>

                        {/* 命令参数 */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                {t.mcp.commandArgs}
                            </label>
                            <Input
                                value={argsText}
                                onChange={setArgsText}
                                placeholder={t.mcp.argsPlaceholder}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-1">{t.mcp.commandArgsDesc}</p>
                        </div>

                        {/* 环境变量 */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                                {t.mcp.envVars}
                            </label>
                            <Textarea
                                value={envText}
                                onChange={setEnvText}
                                placeholder={t.mcp.envPlaceholder}
                                rows={2}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-1">{t.mcp.envVarsDesc}</p>
                        </div>
                    </>
                )}

                {/* HTTP 传输配置 */}
                {transportType === 'http' && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.mcp.endpoint} <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={endpoint}
                            onChange={setEndpoint}
                            placeholder={t.providers.apiEndpointPlaceholder}
                            className="font-mono text-sm"
                        />
                        {attempted && errors.endpoint && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                                <AlertCircle className="w-3 h-3" />
                                {errors.endpoint}
                            </div>
                        )}
                    </div>
                )}

                {/* 认证方式 */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.mcp.authMethod}
                    </label>
                    <Select
                        value={authType}
                        onChange={(v) => setAuthType(v as typeof authType)}
                        options={[
                            { value: 'none', label: t.mcp.authNone },
                            { value: 'apikey', label: t.mcp.authApiKey },
                            { value: 'token', label: t.mcp.authToken },
                        ]}
                    />
                </div>

                {/* 认证值 (认证类型不为 none 时必填) */}
                {authType !== 'none' && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {authType === 'apikey' ? t.mcp.authApiKey : t.mcp.authToken} <span className="text-red-500">*</span>
                        </label>
                        <Input
                            type="password"
                            value={authValue}
                            onChange={setAuthValue}
                            placeholder={`${t.models.enterApiKey.replace('API Key', authType === 'apikey' ? 'API Key' : 'Token')}`}
                        />
                        {attempted && errors.authValue && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                                <AlertCircle className="w-3 h-3" />
                                {errors.authValue}
                            </div>
                        )}
                    </div>
                )}

                {/* 按钮 */}
                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="flex-1 bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                        icon={<PlugZap className="w-4 h-4" />}
                    >
                        {server ? t.mcp.saveChanges : t.mcp.addServer}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default MCPModal;
