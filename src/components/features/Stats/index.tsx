import React, { useState } from 'react';
import { MessageCircle, Zap, Database, Activity, Clock } from 'lucide-react';
import { Modal, Button } from '../../common';
import { useI18n } from '../../../i18n';
import type { UsageStats, ModelUsage, ActivityItem, TimeRange } from '../../../types';

interface StatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    stats: Record<TimeRange, UsageStats>;
    modelUsage: ModelUsage[];
    recentActivity: ActivityItem[];
}

export const StatsModal: React.FC<StatsModalProps> = ({
    isOpen,
    onClose,
    stats,
    modelUsage,
    recentActivity,
}) => {
    const { t, language } = useI18n();
    const [timeRange, setTimeRange] = useState<TimeRange>('week');

    const currentStats = stats[timeRange];

    const getActivityIcon = (type: string) => {
        const icons: Record<string, React.ReactNode> = {
            chat: <MessageCircle className="w-4 h-4" />,
            agent: <Activity className="w-4 h-4" />,
            skill: <Zap className="w-4 h-4" />,
            mcp: <Database className="w-4 h-4" />,
        };
        return icons[type] || <Clock className="w-4 h-4" />;
    };

    const getTimeRangeLabel = (range: TimeRange) => {
        const labels: Record<TimeRange, string> = {
            today: t.stats.today,
            week: t.stats.week,
            month: t.stats.month,
        };
        return labels[range];
    };

    // 获取活动类型的翻译文本
    const getActivityActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            createChat: t.stats.activityCreateChat,
            enableSkill: t.stats.activityEnableSkill,
            editAgent: t.stats.activityEditAgent,
            connectMcp: t.stats.activityConnectMcp,
        };
        return labels[action] || action;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t.stats.title} size="xl">
            <div className="space-y-6">
                {/* 时间范围选择 */}
                <div className="flex gap-2">
                    {(['today', 'week', 'month'] as TimeRange[]).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-4 py-2 rounded-[10px] text-sm font-medium transition-all ${timeRange === range
                                    ? 'bg-purple-500 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {getTimeRangeLabel(range)}
                        </button>
                    ))}
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-[10px] p-6 border border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-blue-700 font-medium">{t.stats.messages}</span>
                            <MessageCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="text-3xl font-bold text-blue-800">
                            {currentStats.messages}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-[10px] p-6 border border-purple-200">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-purple-700 font-medium">{t.stats.tokens}</span>
                            <Zap className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="text-3xl font-bold text-purple-800">
                            {(currentStats.tokens / 1000).toFixed(1)}K
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-[10px] p-6 border border-green-200">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-green-700 font-medium">{t.stats.cost}</span>
                            <Database className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="text-3xl font-bold text-green-800">
                            ${currentStats.cost.toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* 模型使用分布 */}
                <div className="bg-white rounded-[10px] border-2 border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">{t.stats.modelUsage}</h3>
                    <div className="space-y-4">
                        {modelUsage.map((item, idx) => (
                            <div key={idx}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700">
                                        {item.model}
                                    </span>
                                    <span className="text-sm font-bold text-gray-800">
                                        {item.usage}%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`h-full ${item.color} transition-all`}
                                        style={{ width: `${item.usage}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 最近活动 */}
                <div className="bg-white rounded-[10px] border-2 border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">{t.stats.recentActivity}</h3>
                    <div className="space-y-3">
                        {recentActivity.map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-center gap-3 p-3 bg-gray-50 rounded-[10px]"
                            >
                                <div className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center text-gray-600 border border-gray-200">
                                    {getActivityIcon(activity.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-gray-800">
                                        {getActivityActionLabel(activity.action)}
                                    </div>
                                    <div className="text-xs text-gray-500">{activity.details}</div>
                                </div>
                                <div className="text-xs text-gray-400">
                                    {new Date(activity.time).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.close}
                    </Button>
                    <Button className="flex-1">{t.stats.exportReport}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default StatsModal;
