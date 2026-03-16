/**
 * 文件工具函数
 *
 * 提供文件类型检测和文件名提取功能
 * 用于 Markdown 渲染中的链接和文件下载处理
 *
 * @module components/common/markdown/fileUtils
 */

/**
 * 常见文件扩展名分类
 */
export const FILE_EXTENSIONS = {
    /** 文档类型 */
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt'],
    /** 压缩包类型 */
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    /** 代码文件类型 */
    code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'less', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'sql', 'go', 'rs', 'rb', 'php', 'swift', 'kt'],
    /** 图片类型 */
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff'],
    /** 音频类型 */
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
    /** 视频类型 */
    video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv'],
};

/**
 * 获取所有可下载的文件扩展名
 */
const DOWNLOADABLE_EXTENSIONS = [
    ...FILE_EXTENSIONS.document,
    ...FILE_EXTENSIONS.archive,
    ...FILE_EXTENSIONS.code,
];

/**
 * 判断 URL 是否为可下载文件
 *
 * @param url - 文件 URL
 * @returns 是否为可下载文件
 */
export const isDownloadableFile = (url: string): boolean => {
    if (!url) return false;
    try {
        // 提取扩展名（去除查询参数）
        const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
        return DOWNLOADABLE_EXTENSIONS.includes(ext);
    } catch {
        return false;
    }
};

/**
 * 判断 URL 是否为图片
 *
 * @param url - 文件 URL
 * @returns 是否为图片
 */
export const isImageUrl = (url: string): boolean => {
    if (!url) return false;
    try {
        const ext = url.split('.').pop()?.toLowerCase().split('?')[0] || '';
        return FILE_EXTENSIONS.image.includes(ext);
    } catch {
        return false;
    }
};

/**
 * 从 URL 中提取文件名
 *
 * @param url - 文件 URL
 * @returns 文件名
 */
export const getFileName = (url: string): string => {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const fileName = pathname.split('/').pop() || '';
        // 解码 URL 编码的文件名
        return decodeURIComponent(fileName) || url;
    } catch {
        // 如果 URL 解析失败，尝试简单提取
        return url.split('/').pop()?.split('?')[0] || url;
    }
};

/**
 * 获取文件扩展名
 *
 * @param url - 文件 URL 或文件名
 * @returns 扩展名（小写）
 */
export const getFileExtension = (url: string): string => {
    if (!url) return '';
    try {
        return url.split('.').pop()?.toLowerCase().split('?')[0] || '';
    } catch {
        return '';
    }
};

/**
 * 获取文件类型分类
 *
 * @param url - 文件 URL 或文件名
 * @returns 文件类型分类
 */
export const getFileCategory = (url: string): keyof typeof FILE_EXTENSIONS | 'unknown' => {
    const ext = getFileExtension(url);
    if (!ext) return 'unknown';

    for (const [category, extensions] of Object.entries(FILE_EXTENSIONS)) {
        if (extensions.includes(ext)) {
            return category as keyof typeof FILE_EXTENSIONS;
        }
    }
    return 'unknown';
};
