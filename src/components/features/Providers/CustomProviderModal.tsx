/**
 * 自定义提供商添加/编辑对话框 (v0.9.3, v0.9.4, v4.2.7)
 *
 * 允许用户添加自定义 AI 提供商
 * v0.9.4: 添加协议选择器，设置提供商默认协议
 * v4.2.7: 移除模型配置，模型统一在 Models 页面管理
 *
 * @module components/features/Providers/CustomProviderModal
 * @version 4.2.7
 */

import { Globe, Key, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { customProviderStorage } from '../../../services/customProviderStorage';
import type { CustomProvider, ProtocolType } from '../../../types';
import { PROTOCOLS, getDefaultProtocol } from '../../../data/protocols';

interface CustomProviderModalProps {
    /** 是否显示 */
    open: boolean;
    /** 编辑模式（传入已有提供商） */
    provider?: CustomProvider;
    /** 关闭回调 */
    onClose: () => void;
    /** 保存成功回调 */
    onSave: () => void;
}

export function CustomProviderModal({ open, provider, onClose, onSave }: CustomProviderModalProps) {
    const [name, setName] = useState('');
    const [icon, setIcon] = useState('🤖');
    const [descriptionZh, setDescriptionZh] = useState('');
    const [descriptionEn, setDescriptionEn] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasExistingApiKey, setHasExistingApiKey] = useState(false); // 是否已有 API Key
    const [protocol, setProtocol] = useState<ProtocolType>('openai'); // v0.9.4: 默认协议
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const language = localStorage.getItem('language') || 'zh';

    // 编辑模式：填充已有数据并检查是否已有 API Key
    useEffect(() => {
        const loadData = async () => {
            if (provider) {
                setName(provider.name);
                setIcon(provider.icon);
                setDescriptionZh(provider.description?.zh || '');
                setDescriptionEn(provider.description?.en || '');
                setEndpoint(provider.endpoint);
                setApiKey(''); // 不显示已保存的 API Key
                setProtocol(provider.protocol || getDefaultProtocol(provider.id)); // v0.9.4: 加载协议

                // 检查是否已有 API Key
                const { providerCredentialsStorage } = await import('../../../services/storage');
                const credential = await providerCredentialsStorage.get(provider.id);
                setHasExistingApiKey(!!credential?.apiKey);
            } else {
                // 新建模式：重置表单
                setName('');
                setIcon('🤖');
                setDescriptionZh('');
                setDescriptionEn('');
                setEndpoint('');
                setApiKey('');
                setHasExistingApiKey(false);
                setProtocol('openai'); // v0.9.4: 默认 OpenAI 协议
            }
            setError('');
        };

        if (open) {
            loadData();
        }
    }, [provider, open]);

    // 表单验证
    const validate = (): boolean => {
        if (!name.trim()) {
            setError(language === 'zh' ? '请输入提供商名称' : 'Please enter provider name');
            return false;
        }
        if (!endpoint.trim()) {
            setError(language === 'zh' ? '请输入 API 端点' : 'Please enter API endpoint');
            return false;
        }
        return true;
    };

    // 保存
    const handleSave = async () => {
        if (!validate()) return;

        setSaving(true);
        setError('');

        try {
            const customProvider: CustomProvider = {
                id: provider?.id || customProviderStorage.generateId(),
                name: name.trim(),
                icon,
                description: descriptionZh || descriptionEn ? { zh: descriptionZh, en: descriptionEn } : undefined,
                endpoint: endpoint.trim(),
                authMethods: [
                    {
                        type: 'api',
                        label: 'API Key',
                        description: language === 'zh' ? '从服务商获取' : 'Get from provider',
                    },
                ],
                protocol, // v0.9.4: 保存默认协议
                createdAt: provider?.createdAt || new Date(),
                updatedAt: new Date(),
            };

            if (provider) {
                // 更新
                await customProviderStorage.update(provider.id, customProvider);
            } else {
                // 新建
                await customProviderStorage.add(customProvider);
            }

            // 如果提供了 API Key，保存凭证
            if (apiKey.trim()) {
                const { providerCredentialsStorage } = await import('../../../services/storage');
                await providerCredentialsStorage.add({
                    providerId: customProvider.id,
                    type: 'api',
                    apiKey: apiKey.trim(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            onSave();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                {/* 标题栏 */}
                <div className="relative bg-gradient-to-bl from-[#A688F6] to-[#009BF3] p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-[10px] flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-white" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">
                                    {provider
                                        ? language === 'zh' ? '编辑自定义提供商' : 'Edit Custom Provider'
                                        : language === 'zh' ? '添加自定义提供商' : 'Add Custom Provider'}
                                </h2>
                            </div>
                            {!provider && (
                                <p className="text-white/90 text-sm ml-13">
                                    {language === 'zh'
                                        ? '添加自定义提供商，模型配置请前往 Models 页面'
                                        : 'Add custom provider, configure models in Models page'}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-[10px] transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 表单内容 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50 dark:bg-gray-900/50">
                    {/* 基本信息 */}
                    <div className="bg-white dark:bg-gray-800 rounded-[10px] p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-[10px] flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                {language === 'zh' ? '基本信息' : 'Basic Information'}
                            </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? '名称' : 'Name'} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={language === 'zh' ? '例如：My Claude API' : 'e.g., My Claude API'}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? '图标 Emoji' : 'Icon Emoji'}
                                </label>
                                <input
                                    type="text"
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                    placeholder="🤖"
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-2xl text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? '描述（中文）' : 'Description (Chinese)'}
                                </label>
                                <input
                                    type="text"
                                    value={descriptionZh}
                                    onChange={(e) => setDescriptionZh(e.target.value)}
                                    placeholder={language === 'zh' ? '可选' : 'Optional'}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? '描述（英文）' : 'Description (English)'}
                                </label>
                                <input
                                    type="text"
                                    value={descriptionEn}
                                    onChange={(e) => setDescriptionEn(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 连接配置 */}
                    <div className="bg-white dark:bg-gray-800 rounded-[10px] p-5 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] rounded-[10px] flex items-center justify-center">
                                <Globe className="w-4 h-4 text-white" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                {language === 'zh' ? '连接配置' : 'Connection Configuration'}
                            </h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? 'API 端点' : 'API Endpoint'} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={endpoint}
                                    onChange={(e) => setEndpoint(e.target.value)}
                                    placeholder="https://api.example.com"
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* v0.9.4: 协议选择器 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    {language === 'zh' ? '默认通信协议' : 'Default Protocol'}
                                </label>
                                <select
                                    value={protocol}
                                    onChange={(e) => setProtocol(e.target.value as ProtocolType)}
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                >
                                    {PROTOCOLS.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {language === 'zh' ? p.label.zh : p.label.en}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {language === 'zh'
                                        ? '💡 此协议将作为该提供商下新建模型的默认协议，创建模型时可以覆盖'
                                        : '💡 This protocol will be the default for new models under this provider, can be overridden when creating models'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <div className="flex items-center gap-2">
                                        <Key className="w-4 h-4" />
                                        {language === 'zh' ? 'API Key' : 'API Key'}
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            ({language === 'zh' ? '可选，保存后自动连接' : 'Optional, auto-connect after save'})
                                        </span>
                                        {hasExistingApiKey && (
                                            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                                                {language === 'zh' ? '✓ 已配置' : '✓ Configured'}
                                            </span>
                                        )}
                                    </div>
                                </label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={
                                        hasExistingApiKey
                                            ? (language === 'zh' ? '留空保持不变，输入新值以更新' : 'Leave empty to keep, enter new value to update')
                                            : (language === 'zh' ? '输入 API Key 以自动连接' : 'Enter API Key to auto-connect')
                                    }
                                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    {hasExistingApiKey
                                        ? (language === 'zh'
                                            ? '💡 提示：已有 API Key，留空则保持不变，输入新值则更新'
                                            : '💡 Tip: API Key already configured, leave empty to keep it, enter new value to update')
                                        : (language === 'zh'
                                            ? '💡 提示：如果现在不填写，可以稍后在提供商列表中连接'
                                            : '💡 Tip: If not filled now, you can connect later in the provider list')}
                                </p>
                            </div>
                        </div>

                        {/* 提示信息 */}
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[10px]">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                💡 {language === 'zh'
                                    ? '提示：模型配置请前往 Models 页面进行，在那里可以为此提供商添加多个模型配置。'
                                    : 'Tip: Configure models in the Models page, where you can add multiple model configurations for this provider.'}
                            </p>
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-[10px]">
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">!</span>
                                </div>
                                <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                                    {error}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {language === 'zh' ? '* 必填字段' : '* Required fields'}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-[10px] font-medium transition-colors"
                        >
                            {language === 'zh' ? '取消' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] hover:opacity-90 text-white rounded-[10px] font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg transition-all"
                        >
                            {saving
                                ? language === 'zh' ? '保存中...' : 'Saving...'
                                : language === 'zh' ? '保存' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
