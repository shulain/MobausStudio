import React from 'react';
import { Star, Bot } from 'lucide-react';
import type { Chat, AIModel, Agent } from '../../../types';

interface ChatItemProps {
    chat: Chat;
    isSelected: boolean;
    onClick: () => void;
    // v2.3.0: 添加模型和 Agent 列表用于显示真实名称
    models?: AIModel[];
    agents?: Agent[];
}

export const ChatItem: React.FC<ChatItemProps> = ({ chat, isSelected, onClick, models = [], agents = [] }) => {
    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (hours < 1) return '刚刚';
        if (hours < 24) return `${hours}小时前`;
        if (days === 1) return '昨天';
        return `${days}天前`;
    };

    const lastMessage = chat.messages[chat.messages.length - 1];
    const preview = lastMessage?.content.slice(0, 50) || '暂无消息';

    // v2.3.0: 获取 Agent 和模型的真实名称
    const agent = chat.agentId ? agents.find(a => a.id === chat.agentId) : null;
    const modelId = agent?.model || chat.model;
    const model = models.find(m => m.id === modelId);
    const modelName = model?.name || modelId || '未知模型';

    return (
        <div
            onClick={onClick}
            className={`group relative p-3 rounded-[10px] cursor-pointer transition-all ${isSelected
                    ? 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 shadow-sm'
                    : 'hover:bg-gray-50'
                }`}
        >
            <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {chat.starred && (
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    )}
                    <span className="font-medium text-gray-800 text-sm truncate">
                        {chat.title}
                    </span>
                </div>
                <span className="text-xs text-gray-400">{formatTime(chat.updatedAt)}</span>
            </div>
            <p className="text-xs text-gray-500 truncate mb-1">{preview}</p>
            <div className="flex items-center gap-1">
                {/* v2.3.0: 显示 Agent 名称（如果有） */}
                {agent && (
                    <span className="text-xs px-2 py-0.5 bg-purple-50 rounded text-purple-600 border border-purple-200 flex items-center gap-1">
                        <Bot size={10} />
                        {agent.name}
                    </span>
                )}
                {/* 显示模型名称 */}
                <span className="text-xs px-2 py-0.5 bg-white rounded text-gray-600 border border-gray-200">
                    {modelName}
                </span>
            </div>
        </div>
    );
};

export default ChatItem;
