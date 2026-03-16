import React from 'react';
import { X, CheckCircle, XCircle, AlertCircle, Bell } from 'lucide-react';
import type { AppNotification } from '../../../types';
import { useI18n } from '../../../i18n';

interface NotificationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: AppNotification[];
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
    isOpen,
    onClose,
    notifications,
    onMarkRead,
    onMarkAllRead,
}) => {
    const { t, language } = useI18n();

    if (!isOpen) return null;

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'error':
                return <XCircle className="w-5 h-5 text-red-600" />;
            case 'warning':
                return <AlertCircle className="w-5 h-5 text-yellow-600" />;
            default:
                return <Bell className="w-5 h-5 text-blue-600" />;
        }
    };

    const getIconBg = (type: string) => {
        switch (type) {
            case 'success':
                return 'bg-green-100';
            case 'error':
                return 'bg-red-100';
            case 'warning':
                return 'bg-yellow-100';
            default:
                return 'bg-blue-100';
        }
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <div className="fixed right-6 top-20 w-96 bg-white rounded-[10px] shadow-2xl border border-gray-200 z-50 max-h-[500px] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800">{t.notifications.title}</h3>
                    {unreadCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
                            {unreadCount}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            onClick={onMarkAllRead}
                            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                        >
                            {t.notifications.markAllRead}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-600" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">{t.notifications.empty}</p>
                    </div>
                ) : (
                    notifications.map((notif) => (
                        <div
                            key={notif.id}
                            onClick={() => onMarkRead(notif.id)}
                            className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.read ? 'bg-blue-50' : ''
                                }`}
                        >
                            <div className="flex gap-3">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getIconBg(
                                        notif.type
                                    )}`}
                                >
                                    {getIcon(notif.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm text-gray-800">
                                        {notif.title}
                                    </h4>
                                    <p className="text-xs text-gray-600 mb-1">{notif.message}</p>
                                    <span className="text-xs text-gray-400">
                                        {new Date(notif.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                                    </span>
                                </div>
                                {!notif.read && (
                                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NotificationPanel;
