import type { Attachment } from '../types';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 处理文件上传，转换为 Attachment 对象
 * @param file 原始文件对象
 * @returns Attachment 对象 Promise
 */
export const processFile = (file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
        // 1. 检查大小
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`文件大小超过限制 (10MB): ${file.name}`));
            return;
        }

        // 2. 检查类型 (仅允许图片和视频)
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            reject(new Error(`不支持的文件类型: ${file.type}`));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target?.result as string;
            resolve({
                id: crypto.randomUUID(),
                type: file.type.startsWith('image/') ? 'image' : 'video',
                name: file.name,
                url,
                mimeType: file.type,
                size: file.size,
            });
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
};

/**
 * 处理 DataTransferItems (用于 Paste/Drop)
 * @param items DataTransferItemList
 * @returns File 数组
 */
export const getFilesFromDataTransfer = (items: DataTransferItemList): File[] => {
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    return files;
};
