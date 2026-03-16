import React, { useRef } from 'react';
import { Paperclip, X, Film } from 'lucide-react';
import type { Attachment } from '../../../types';
import { logger, LogTags } from '../../../utils/logger';

interface AttachmentUploadProps {
    attachments: Attachment[];
    onAttachmentsChange: (attachments: Attachment[]) => void;
    maxSizeMB?: number; // 默认 10MB
}

export const AttachmentUpload: React.FC<AttachmentUploadProps> = ({
    attachments,
    onAttachmentsChange,
    maxSizeMB = 10
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newAttachments: Attachment[] = [];

        for (const file of files) {
            // 检查大小
            if (file.size > maxSizeMB * 1024 * 1024) {
                logger.warn(LogTags.CHAT, `文件 ${file.name} 超过 ${maxSizeMB}MB 限制`);
                continue;
            }

            try {
                const base64 = await fileToBase64(file);
                const type = file.type.startsWith('image/')
                    ? 'image'
                    : file.type.startsWith('video/')
                        ? 'video'
                        : 'file';

                newAttachments.push({
                    id: Date.now().toString() + Math.random().toString(36).substring(2),
                    type,
                    name: file.name,
                    url: base64,
                    mimeType: file.type,
                    size: file.size
                });
            } catch (err) {
                logger.error(LogTags.CHAT, '处理文件失败', err);
            }
        }

        if (newAttachments.length > 0) {
            onAttachmentsChange([...attachments, ...newAttachments]);
        }

        // 重置 input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAttachment = (id: string) => {
        onAttachmentsChange(attachments.filter(a => a.id !== id));
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    return (
        <div className="flex flex-col gap-2">
            {/* 预览区域 */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-700">
                    {attachments.map(att => (
                        <div key={att.id} className="relative group w-20 h-20 rounded-md overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600">
                            {att.type === 'image' ? (
                                <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                            ) : att.type === 'video' ? (
                                <div className="w-full h-full flex items-center justify-center bg-black">
                                    <Film className="w-8 h-8 text-white opacity-70" />
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-1">
                                    <Paperclip className="w-6 h-6 text-gray-400 mb-1" />
                                    <span className="text-[10px] truncate w-full text-center">{att.name}</span>
                                </div>
                            )}

                            <button
                                onClick={() => removeAttachment(att.id)}
                                className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 上传按钮 */}
            <div>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    multiple
                    accept="image/*,video/*" // 暂时只支持图片视频
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    title="上传图片/视频"
                >
                    <Paperclip size={20} />
                </button>
            </div>
        </div>
    );
};
