import React from 'react';
import { SearchInput } from '../../common';
import { ChatItem } from './ChatItem';
import type { Chat, AIModel, Agent } from '../../../types';

interface ChatListProps {
    chats: Chat[];
    selectedChatId: string | null;
    onSelectChat: (id: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    // v2.3.0: 添加模型和 Agent 列表用于显示真实名称
    models?: AIModel[];
    agents?: Agent[];
}

export const ChatList: React.FC<ChatListProps> = ({
    chats,
    selectedChatId,
    onSelectChat,
    searchQuery,
    onSearchChange,
    models = [],
    agents = [],
}) => {
    const filteredChats = chats.filter(
        (chat) =>
            chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chat.messages.some((m) =>
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
            )
    );

    return (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
                <SearchInput
                    value={searchQuery}
                    onChange={onSearchChange}
                    placeholder="搜索对话..."
                />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {filteredChats.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                        <p className="text-sm">暂无对话</p>
                    </div>
                ) : (
                    filteredChats.map((chat) => (
                        <ChatItem
                            key={chat.id}
                            chat={chat}
                            isSelected={chat.id === selectedChatId}
                            onClick={() => onSelectChat(chat.id)}
                            models={models}
                            agents={agents}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default ChatList;
