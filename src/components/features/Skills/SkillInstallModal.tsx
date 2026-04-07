/**
 * SkillInstallModal 组件 (v3.0.0)
 *
 * 技能安装弹窗，支持三种安装方式：
 * - URL 安装：从 GitHub 或其他 URL 获取技能
 * - 文件导入：从本地 JSON 文件导入
 * - 官方仓库：从预设的官方仓库浏览安装
 *
 * 对应文档: docs/modules/skills.md
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
    Link,
    FileUp,
    Store,
    Download,
    AlertCircle,
    CheckCircle,
    Loader2,
    Check,
    RefreshCw,
    Search,
} from 'lucide-react';
import { Modal, Button, Input } from '../../common';
import { useI18n } from '../../../i18n';
import { logger, LogTags } from '../../../utils/logger';
import {
    fetchSkillRegistry,
    fetchSkillFromRegistry,
    validateSkillPackage,
    detectDuplicateSkills,
    applyDuplicateStrategy,
    parseSkillCommand,
    fetchSkillsShList,
    fetchSkillFromSkillsSh,
    formatInstallCount,
    isGitHubRateLimitError,
} from '../../../utils/skillUtils';
import type {
    Skill,
    SkillCreateInput,
    SkillRegistry,
    SkillRegistryItem,
    DuplicateSkillResult,
    InstallSourceType,
    SkillsShItem,
} from '../../../types';

interface SkillInstallModalProps {
    isOpen: boolean;
    onClose: () => void;
    existingSkills: Skill[];
    onInstall: (skills: SkillCreateInput[]) => void;
    onUpdate?: (id: string, data: SkillCreateInput) => void;
}

/**
 * skills.sh 每页加载数量 (v3.0.6)
 */
const SKILLS_SH_PAGE_SIZE = 20;

/**
 * skills.sh 搜索结果数量上限 (v3.0.16)
 * 搜索 API 不支持分页，所以一次性获取更多结果
 */
const SKILLS_SH_SEARCH_LIMIT = 100;

/**
 * 解析 skills.sh 安装失败错误中的可选技能列表
 *
 * 支持格式：
 * - 该仓库包含以下 5 个技能：a, b, c
 * - Available skills: a, b, c
 */
function parseAvailableSkillsFromError(message: string): string[] {
    const lineMatch = message.match(
        /(?:该仓库包含以下(?:\s*\d+\s*个)?技能[:：]|available skills[:：]|contains(?:\s+\d+)?\s+skills[:：])\s*([^\n]+)/i
    );
    if (!lineMatch || !lineMatch[1]) return [];

    return lineMatch[1]
        .split(/[，,]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function isSkillNotFoundError(message: string): boolean {
    return /未找到技能|not\s+found\s+skill|skill\s+.+\s+not\s+found/i.test(message);
}


/**
 * Tab 配置 - 使用函数动态生成以支持 i18n
 */
const getTabs = (t: ReturnType<typeof useI18n>['t']): { id: InstallSourceType; label: string; icon: React.ReactNode }[] => [
    { id: 'url', label: t.skills.urlInstall, icon: <Link className="w-4 h-4" /> },
    { id: 'file', label: t.skills.fileImport, icon: <FileUp className="w-4 h-4" /> },
    { id: 'official', label: t.skills.officialRepo, icon: <Store className="w-4 h-4" /> },
];

export const SkillInstallModal: React.FC<SkillInstallModalProps> = ({
    isOpen,
    onClose,
    existingSkills,
    onInstall,
    onUpdate,
}) => {
    const { t } = useI18n();

    // 动态生成 Tab 配置
    const TABS = getTabs(t);

    // ==================== 状态 ====================

    const [activeTab, setActiveTab] = useState<InstallSourceType>('url');
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 仓库/技能列表
    const [registry, setRegistry] = useState<SkillRegistry | null>(null);
    const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

    // 重复技能处理
    const [duplicates, setDuplicates] = useState<DuplicateSkillResult[]>([]);
    const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite' | 'rename'>('skip');
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [pendingSkills, setPendingSkills] = useState<SkillCreateInput[]>([]);

    // 安装结果
    const [installResult, setInstallResult] = useState<{
        success: number;
        failed: number;
        skipped: number;
    } | null>(null);

    // 命令解析后指定的技能 ID 列表 (v3.0.2)
    const [commandSkillIds, setCommandSkillIds] = useState<string[] | undefined>(undefined);

    // skills.sh 技能列表 (v3.0.6)
    const [skillsShList, setSkillsShList] = useState<SkillsShItem[]>([]);
    const [skillsShHasMore, setSkillsShHasMore] = useState(false);
    const [skillsShSearch, setSkillsShSearch] = useState('');
    const [skillsShLoading, setSkillsShLoading] = useState(false);
    const [skillsShError, setSkillsShError] = useState<string | null>(null);

    // 使用 ref 追踪列表长度，避免 useCallback 依赖问题 (v3.0.8)
    const skillsShListLengthRef = useRef(0);
    skillsShListLengthRef.current = skillsShList.length;

    // v3.0.16: 服务端搜索已修复，此处保留客户端过滤作为实时筛选
    // 当用户输入搜索词但还未点击搜索按钮时，可以在已加载的列表中实时过滤
    const filteredSkillsShList = useMemo(() => {
        // 如果列表为空，直接返回
        if (skillsShList.length === 0) {
            return skillsShList;
        }
        // 如果没有搜索词，返回完整列表
        if (!skillsShSearch.trim()) {
            return skillsShList;
        }
        // 客户端实时过滤（用于在已加载的结果中筛选）
        const searchLower = skillsShSearch.toLowerCase().trim();
        return skillsShList.filter(item =>
            item.name.toLowerCase().includes(searchLower) ||
            item.id.toLowerCase().includes(searchLower) ||
            item.source.toLowerCase().includes(searchLower)
        );
    }, [skillsShList, skillsShSearch]);

    // ==================== 重置状态 ====================

    const resetState = useCallback(() => {
        setUrl('');
        setError(null);
        setRegistry(null);
        setSelectedSkills(new Set());
        setDuplicates([]);
        setShowDuplicateDialog(false);
        setPendingSkills([]);
        setInstallResult(null);
        setCommandSkillIds(undefined);
        // 重置 skills.sh 状态 (v3.0.6)
        setSkillsShList([]);
        setSkillsShHasMore(false);
        setSkillsShSearch('');
        setSkillsShError(null);
    }, []);

    // ==================== URL 安装 ====================

    /**
     * 从 URL 获取技能仓库
     *
     * v3.0.2: 支持命令格式输入，如：
     * - npx skills add https://github.com/user/repo --skill my-skill
     * - https://github.com/user/repo
     */
    const handleFetchRegistry = async () => {
        if (!url.trim()) {
            setError(t.skills.invalidInputFormat || '请输入有效的 URL 或安装命令');
            return;
        }

        setIsLoading(true);
        setError(null);
        setRegistry(null);
        setCommandSkillIds(undefined);

        try {
            // 尝试解析命令格式
            const parseResult = parseSkillCommand(url.trim());

            let targetUrl: string;
            let filterSkillIds: string[] | undefined;

            if (parseResult) {
                targetUrl = parseResult.url;
                filterSkillIds = parseResult.skillIds;

                if (parseResult.isCommand) {
                    logger.info(LogTags.SKILL, `解析命令成功: URL=${targetUrl}, 指定技能=${filterSkillIds?.join(', ') || '全部'}`);
                }
            } else {
                // 无法解析，检查是否是有效 URL
                if (!url.trim().startsWith('http')) {
                    setError(t.skills.invalidInputFormat || '无效的输入格式。请输入 URL 或安装命令（如：npx skills add <url>）');
                    setIsLoading(false);
                    return;
                }
                targetUrl = url.trim();
            }

            // 获取仓库（v3.0.3: 传递 skillIds 用于 SKILL.md 格式优化）
            const result = await fetchSkillRegistry(targetUrl, filterSkillIds);
            setRegistry(result);

            // 根据命令指定的技能 ID 筛选显示
            if (filterSkillIds && filterSkillIds.length > 0) {
                // 保存命令指定的技能 ID
                setCommandSkillIds(filterSkillIds);

                // v3.0.24: 使用不区分大小写的匹配，同时匹配 skill.id 和 skill.name
                const filterSkillIdsLower = filterSkillIds.map(id => id.toLowerCase());
                const matchedSkillIds = new Set<string>();
                for (const skill of result.skills) {
                    const skillIdLower = skill.id.toLowerCase();
                    const skillNameLower = skill.name.toLowerCase();

                    // 匹配 ID 或名称（支持部分匹配）
                    if (filterSkillIdsLower.some(filterId =>
                        skillIdLower === filterId ||
                        skillIdLower.includes(filterId) ||
                        filterId.includes(skillIdLower) ||
                        skillNameLower === filterId ||
                        skillNameLower.includes(filterId)
                    )) {
                        matchedSkillIds.add(skill.id);
                    }
                }

                // 如果没有匹配到任何技能，显示警告但仍然显示所有可用技能
                if (matchedSkillIds.size === 0) {
                    const availableSkillsStr = result.skills.map(s => s.name || s.id).join(', ');
                    setError((t.skills.specifiedSkillsNotFound || '未找到技能 "{skills}"。已切换到仓库技能列表，请勾选后安装。可选技能：{availableSkills}')
                        .replace('{skills}', filterSkillIds.join(', '))
                        .replace('{availableSkills}', availableSkillsStr));
                    setSelectedSkills(new Set(result.skills.map((s) => s.id)));
                } else {
                    setSelectedSkills(matchedSkillIds);
                }
            } else {
                // 默认全选
                setSelectedSkills(new Set(result.skills.map((s) => s.id)));
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '获取仓库失败', err);
            setError(err instanceof Error ? err.message : (t.skills.noSkillDefinitions || '获取失败，请检查 URL 是否正确'));
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== 文件导入 ====================

    /**
     * 处理文件选择
     */
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // 重置
        setError(null);
        setRegistry(null);
        setIsLoading(true);

        try {
            const content = await file.text();
            const data = JSON.parse(content);

            // 验证格式
            const validation = validateSkillPackage(data);
            if (!validation.valid) {
                setError(`文件格式无效:\n${validation.errors.join('\n')}`);
                return;
            }

            // 转换为仓库格式以复用 UI
            const pkg = validation.package!;
            const fakeRegistry: SkillRegistry = {
                name: file.name.replace('.json', ''),
                version: pkg.version,
                skills: pkg.skills.map((skill, index) => ({
                    id: `imported-${index}`,
                    name: skill.name,
                    description: skill.description,
                    version: '1.0.0',
                    tags: [skill.category],
                    skill: skill,
                })),
            };

            setRegistry(fakeRegistry);
            setSelectedSkills(new Set(fakeRegistry.skills.map((s) => s.id)));
        } catch (err) {
            logger.error(LogTags.SKILL, '解析文件失败', err);
            setError(t.skills.fileParseError || '文件解析失败，请确保是有效的 JSON 格式');
        } finally {
            setIsLoading(false);
        }

        // 清空 input 以便重复选择同一文件
        event.target.value = '';
    };

    // ==================== skills.sh 集成 (v3.0.6, v3.0.16 修复搜索) ====================

    /**
     * 加载 skills.sh 技能列表 (v3.0.16: 搜索使用独立 API)
     *
     * 通过 Rust 后端代理调用 skills.sh API
     * - 列表模式: /api/skills?limit=20&offset=N（支持分页）
     * - 搜索模式: /api/search?q=keyword&limit=100（不支持分页，一次性获取）
     *
     * 关键修复：
     * 1. 移除所有外部状态依赖，通过参数传入
     * 2. 分页时使用传入的 offset，避免 ref 同步问题
     * 3. v3.0.16: 搜索时使用更大的 limit，因为搜索 API 不支持分页
     */
    const loadSkillsShList = useCallback(async (options: {
        reset: boolean;
        searchTerm?: string;
        currentOffset?: number;
    }) => {
        const { reset, searchTerm = '', currentOffset = 0 } = options;
        const isSearchMode = searchTerm.trim().length > 0;

        logger.debug(LogTags.SKILL, `loadSkillsShList 开始`, { reset, searchTerm, currentOffset, isSearchMode });

        setSkillsShLoading(true);
        setSkillsShError(null);

        try {
            const offset = reset ? 0 : currentOffset;
            // v3.0.16: 搜索模式使用更大的 limit，因为搜索 API 不支持分页
            const limit = isSearchMode ? SKILLS_SH_SEARCH_LIMIT : SKILLS_SH_PAGE_SIZE;

            logger.debug(LogTags.SKILL, `调用 API`, { limit, offset, search: searchTerm });

            const response = await fetchSkillsShList({
                limit,
                offset,
                search: searchTerm || undefined,
            });

            logger.debug(LogTags.SKILL, `API 响应`, { count: response.skills.length, hasMore: response.hasMore });

            if (reset) {
                logger.debug(LogTags.SKILL, `重置列表`, { count: response.skills.length });
                setSkillsShList(response.skills);
            } else {
                logger.debug(LogTags.SKILL, `追加列表`, { currentOffset, newCount: response.skills.length });
                setSkillsShList((prev) => {
                    const newList = [...prev, ...response.skills];
                    logger.debug(LogTags.SKILL, `列表更新完成`, { total: newList.length });
                    return newList;
                });
            }
            setSkillsShHasMore(response.hasMore);
            logger.debug(LogTags.SKILL, `hasMore 更新`, { hasMore: response.hasMore });
        } catch (err) {
            logger.error(LogTags.SKILL, '加载 skills.sh 列表失败', err);
            setSkillsShError(err instanceof Error ? err.message : 'Error');
        } finally {
            setSkillsShLoading(false);
            logger.debug(LogTags.SKILL, 'loadSkillsShList 结束');
        }
    }, []); // 无外部依赖，函数稳定

    /**
     * 搜索 skills.sh (v3.0.9: 直接传入当前搜索词)
     */
    const handleSkillsShSearch = useCallback(() => {
        // 直接读取当前 state 值并传入
        loadSkillsShList({ reset: true, searchTerm: skillsShSearch });
    }, [loadSkillsShList, skillsShSearch]);

    /**
     * 加载更多 skills.sh 技能 (v3.0.11: 添加详细日志)
     */
    const handleLoadMoreSkillsSh = useCallback(() => {
        const currentLength = skillsShListLengthRef.current;
        logger.debug(LogTags.SKILL, `handleLoadMoreSkillsSh 调用`, { currentLength, searchTerm: skillsShSearch });
        // 使用 ref 获取当前列表长度作为 offset
        loadSkillsShList({
            reset: false,
            searchTerm: skillsShSearch,
            currentOffset: currentLength,
        });
    }, [loadSkillsShList, skillsShSearch]);

    /**
     * 当切换到官方仓库 Tab 且列表为空时，自动加载数据 (v3.0.9)
     */
    useEffect(() => {
        if (isOpen && activeTab === 'official' && skillsShListLengthRef.current === 0 && !skillsShLoading && !skillsShError) {
            loadSkillsShList({ reset: true, searchTerm: '' });
        }
    }, [isOpen, activeTab, skillsShLoading, skillsShError, loadSkillsShList]);

    /**
     * 从 skills.sh 技能项安装 (v3.0.15: 添加 files 调试日志)
     */
    const handleInstallFromSkillsSh = async (item: SkillsShItem) => {
        setIsLoading(true);
        setError(null);
        logger.info(LogTags.SKILL, '开始从官方仓库安装技能', {
            itemId: item.id,
            skillId: item.skillId,
            name: item.name,
            source: item.source,
        });

        try {
            // 获取技能定义
            const skillInput = await fetchSkillFromSkillsSh(item);

            // v3.0.15: 调试日志 - 检查 files 是否正确返回
            logger.info(LogTags.SKILL, `fetchSkillFromSkillsSh 返回`, {
                name: skillInput.name,
                promptTemplateLength: skillInput.promptTemplate?.length,
                filesCount: skillInput.files?.length ?? 0,
                files: skillInput.files?.map(f => ({ path: f.path, type: f.type, contentLength: f.content?.length })),
            });

            // 检测重复
            const { duplicates: dups, unique } = detectDuplicateSkills([skillInput], existingSkills);

            if (dups.length > 0) {
                setDuplicates(dups);
                setPendingSkills(unique);
                setShowDuplicateDialog(true);
            } else {
                // 直接安装
                logger.info(LogTags.SKILL, `调用 onInstall`, { filesCount: skillInput.files?.length ?? 0 });
                onInstall([skillInput]);
                setInstallResult({ success: 1, failed: 0, skipped: 0 });
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '从 skills.sh 安装失败', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            const availableSkills = parseAvailableSkillsFromError(errorMessage);
            logger.warn(LogTags.SKILL, '官方仓库安装失败分类', {
                isRateLimit: isGitHubRateLimitError(err),
                isNotFound: isSkillNotFoundError(errorMessage),
                parsedAvailableSkillsCount: availableSkills.length,
                source: item.source,
                skillId: item.skillId || item.name,
            });

            if (availableSkills.length > 0 || isSkillNotFoundError(errorMessage)) {
                logger.info(LogTags.SKILL, '检测到可选技能列表，回退到 URL 多选安装流程', {
                    source: item.source,
                    availableSkills,
                });

                try {
                    const repoUrl = `https://github.com/${item.source}`;
                    const result = await fetchSkillRegistry(repoUrl);

                    // 切换到 URL Tab，复用已有技能多选列表
                    setActiveTab('url');
                    setUrl(repoUrl);
                    setRegistry(result);
                    setCommandSkillIds(availableSkills);

                    const matchedSkillIds = new Set<string>();
                    if (availableSkills.length > 0) {
                        const availableSkillsLower = availableSkills.map(id => id.toLowerCase());
                        for (const skill of result.skills) {
                            const skillIdLower = skill.id.toLowerCase();
                            const skillNameLower = skill.name.toLowerCase();
                            const hasMatch = availableSkillsLower.some(filterId =>
                                skillIdLower === filterId ||
                                skillIdLower.includes(filterId) ||
                                filterId.includes(skillIdLower) ||
                                skillNameLower === filterId ||
                                skillNameLower.includes(filterId)
                            );
                            if (hasMatch) {
                                matchedSkillIds.add(skill.id);
                            }
                        }
                    }

                    if (matchedSkillIds.size === 0) {
                        setSelectedSkills(new Set(result.skills.map((s) => s.id)));
                    } else {
                        setSelectedSkills(matchedSkillIds);
                    }

                    const missingSkill = item.skillId || item.name;
                    if (availableSkills.length > 0) {
                        setError((t.skills.specifiedSkillsNotFound || `未找到技能 "{skills}"。已切换到仓库技能列表，请勾选后安装。可选技能：{availableSkills}`).replace('{skills}', missingSkill).replace('{availableSkills}', availableSkills.join(', ')));
                    } else {
                        setError((t.skills.specifiedSkillsNotFoundFallback || `未找到技能 "{skills}"。已加载仓库中的全部技能，请选择后安装。`).replace('{skills}', missingSkill));
                    }
                } catch (fallbackErr) {
                    logger.error(LogTags.SKILL, '回退到 URL 多选流程失败', fallbackErr);
                    setError(errorMessage || t.skills.failed || '安装失败');
                }
            } else {
                if (isGitHubRateLimitError(err)) {
                    logger.warn(LogTags.SKILL, '官方仓库安装因 GitHub 限流终止，不触发多选回退');
                }
                setError(errorMessage || t.skills.failed || '安装失败');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== 安装流程 ====================

    /**
     * 开始安装选中的技能
     */
    const handleStartInstall = async () => {
        if (!registry || selectedSkills.size === 0) return;

        setIsLoading(true);
        setError(null);

        try {
            // 1. 获取选中的技能定义
            const selectedItems = registry.skills.filter((s) => selectedSkills.has(s.id));
            const skillInputs: SkillCreateInput[] = [];

            for (const item of selectedItems) {
                try {
                    const skill = await fetchSkillFromRegistry(item);
                    skillInputs.push(skill);
                } catch (err) {
                    if (isGitHubRateLimitError(err)) {
                        throw err;
                    }
                    logger.error(LogTags.SKILL, `获取技能 ${item.name} 失败`, err);
                }
            }

            if (skillInputs.length === 0) {
                setError('未能获取任何技能定义');
                return;
            }

            // 2. 检测重复
            const { duplicates: dups, unique } = detectDuplicateSkills(skillInputs, existingSkills);

            if (dups.length > 0) {
                // 有重复，显示处理对话框
                setDuplicates(dups);
                setPendingSkills(unique);
                setShowDuplicateDialog(true);
            } else {
                // 无重复，直接安装
                await performInstall(skillInputs, { toAdd: [], toUpdate: [] });
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '安装失败', err);
            setError(err instanceof Error ? err.message : '安装失败');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * 执行实际安装
     */
    const performInstall = async (
        uniqueSkills: SkillCreateInput[],
        duplicateResults: { toAdd: SkillCreateInput[]; toUpdate: { id: string; data: SkillCreateInput }[] }
    ) => {
        let success = 0;
        let failed = 0;
        const skipped = duplicates.length - (duplicateResults.toAdd.length + duplicateResults.toUpdate.length);

        try {
            // 安装唯一技能
            const allToAdd = [...uniqueSkills, ...duplicateResults.toAdd];
            if (allToAdd.length > 0) {
                onInstall(allToAdd);
                success += allToAdd.length;
            }

            // 更新重复技能
            if (onUpdate && duplicateResults.toUpdate.length > 0) {
                for (const item of duplicateResults.toUpdate) {
                    onUpdate(item.id, item.data);
                    success++;
                }
            }

            setInstallResult({ success, failed, skipped });
        } catch (err) {
            logger.error(LogTags.SKILL, '执行安装失败', err);
            failed = uniqueSkills.length + duplicateResults.toAdd.length;
            setInstallResult({ success, failed, skipped });
        }
    };

    /**
     * 确认重复处理策略
     */
    const handleConfirmDuplicateStrategy = () => {
        const result = applyDuplicateStrategy(duplicates, duplicateStrategy);
        setShowDuplicateDialog(false);
        performInstall(pendingSkills, result);
    };

    // ==================== 技能选择 ====================

    const toggleSkillSelection = (id: string) => {
        const newSelected = new Set(selectedSkills);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedSkills(newSelected);
    };

    const toggleSelectAll = () => {
        if (registry) {
            if (selectedSkills.size === registry.skills.length) {
                setSelectedSkills(new Set());
            } else {
                setSelectedSkills(new Set(registry.skills.map((s) => s.id)));
            }
        }
    };

    // ==================== 渲染 ====================

    /**
     * 渲染技能列表
     * v3.0.22: 显示附带文件数量
     */
    const renderSkillList = (skills: SkillRegistryItem[]) => (
        <div className="space-y-2 max-h-64 overflow-y-auto">
            {skills.map((skill) => (
                <label
                    key={skill.id}
                    className={`flex items-center gap-3 p-3 rounded-[10px] cursor-pointer transition-colors ${
                        selectedSkills.has(skill.id)
                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                            : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                    }`}
                >
                    <input
                        type="checkbox"
                        checked={selectedSkills.has(skill.id)}
                        onChange={() => toggleSkillSelection(skill.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 dark:text-gray-100">
                            {skill.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {skill.description}
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap items-center">
                            {skill.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                                >
                                    {tag}
                                </span>
                            ))}
                            {/* v3.0.22: 显示附带文件数量 */}
                            {skill.skill?.files && skill.skill.files.length > 0 && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                    📁 {t.skills.filesAttached.replace('{count}', String(skill.skill.files.length))}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="text-xs text-gray-400">v{skill.version}</span>
                </label>
            ))}
        </div>
    );

    /**
     * 渲染 URL 安装 Tab
     */
    const renderUrlTab = () => (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    {t.skills.repoUrlOrCommand}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {t.skills.repoUrlOrCommandDesc}
                </p>
                <div className="flex gap-2">
                    <Input
                        value={url}
                        onChange={setUrl}
                        placeholder={t.skills.repoUrlPlaceholderFull}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleFetchRegistry}
                        disabled={isLoading || !url.trim()}
                        icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    >
                        {isLoading ? t.skills.fetching : t.skills.fetch}
                    </Button>
                </div>
            </div>

            {/* 命令指定的技能提示 */}
            {commandSkillIds && commandSkillIds.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-[10px] text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                        {t.skills.commandSpecifiedSkills}：{commandSkillIds.join(', ')}
                        {t.skills.autoSelectedMatching}
                    </span>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-[10px] text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {registry && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                                {registry.name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {registry.description || t.skills.containsSkills.replace('{count}', String(registry.skills.length))}
                            </p>
                        </div>
                        <button
                            onClick={toggleSelectAll}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {selectedSkills.size === registry.skills.length ? t.skills.deselectAll : t.common.selectAll}
                        </button>
                    </div>
                    {renderSkillList(registry.skills)}
                </div>
            )}
        </div>
    );

    /**
     * 渲染文件导入 Tab
     */
    const renderFileTab = () => (
        <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-[10px] p-8 text-center">
                <FileUp className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {t.skills.dropFileHere}
                </p>
                <label className="inline-flex">
                    <input
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <Button
                        variant="secondary"
                        icon={<FileUp className="w-4 h-4" />}
                    >
                        {t.skills.selectFile}
                    </Button>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                    {t.skills.supportedFormat}
                </p>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-[10px] text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{error}</span>
                </div>
            )}

            {registry && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                                {registry.name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t.skills.containsSkills.replace('{count}', String(registry.skills.length))}
                            </p>
                        </div>
                        <button
                            onClick={toggleSelectAll}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {selectedSkills.size === registry.skills.length ? t.skills.deselectAll : t.common.selectAll}
                        </button>
                    </div>
                    {renderSkillList(registry.skills)}
                </div>
            )}
        </div>
    );

    /**
     * 渲染官方仓库 Tab (v3.0.6: skills.sh 完整集成)
     *
     * 通过 Rust 后端代理调用 skills.sh API
     * 支持搜索和分页加载
     */
    const renderOfficialTab = () => (
        <div className="space-y-4">
            {/* 搜索框 */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={skillsShSearch}
                    onChange={(e) => setSkillsShSearch(e.target.value)}
                    placeholder={t.skills.searchSkillsSh}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleSkillsShSearch();
                        }
                    }}
                />
                <Button
                    onClick={handleSkillsShSearch}
                    disabled={skillsShLoading}
                    icon={skillsShLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                >
                    {t.common.search}
                </Button>
            </div>

            {/* 来源说明 */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.skills.sourceSkillsSh}：<a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">skills.sh</a> - The Agent Skills Directory
                </p>
                {skillsShList.length === 0 && !skillsShLoading && !skillsShError && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadSkillsShList({ reset: true, searchTerm: '' })}
                        icon={<RefreshCw className="w-4 h-4" />}
                    >
                        {t.skills.loadSkills}
                    </Button>
                )}
            </div>

            {/* 错误提示 */}
            {skillsShError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-[10px] text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{skillsShError}</span>
                </div>
            )}

            {/* v3.0.16: 搜索无结果提示 */}
            {skillsShList.length === 0 && skillsShSearch.trim() && !skillsShLoading && (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <p>{t.skills.noSearchResults.replace('{search}', skillsShSearch)}</p>
                    <p className="text-xs mt-1">{t.skills.tryOtherKeywords}</p>
                </div>
            )}

            {/* 技能列表 (v3.0.16: 服务端搜索 + 客户端实时过滤) */}
            {filteredSkillsShList.length > 0 && (
                <div
                    className="space-y-2 max-h-64 overflow-y-auto"
                    ref={(el) => {
                        if (el) {
                            logger.debug(LogTags.SKILL, `容器尺寸`, { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollable: el.scrollHeight > el.clientHeight });
                        }
                    }}
                    onScroll={(e) => {
                        const target = e.target as HTMLDivElement;
                        const scrollHeight = target.scrollHeight;
                        const scrollTop = target.scrollTop;
                        const clientHeight = target.clientHeight;
                        const distanceToBottom = scrollHeight - scrollTop - clientHeight;

                        // 每次滚动都输出位置信息（调试用）
                        logger.debug(LogTags.SKILL, `滚动`, { scrollHeight, scrollTop: scrollTop.toFixed(0), clientHeight, distanceToBottom: distanceToBottom.toFixed(0) });

                        // v3.0.16: 滚动到底部时自动加载更多（仅列表模式，搜索模式不支持分页）
                        if (distanceToBottom < 50 && !skillsShSearch.trim()) {
                            logger.debug(LogTags.SKILL, `接近底部`, { hasMore: skillsShHasMore, loading: skillsShLoading });
                            if (skillsShHasMore && !skillsShLoading) {
                                logger.debug(LogTags.SKILL, '触发加载更多');
                                handleLoadMoreSkillsSh();
                            }
                        }
                    }}
                >
                    {/* v3.0.16: 渲染列表 */}
                    {(() => { logger.debug(LogTags.SKILL, `渲染列表`, { filtered: filteredSkillsShList.length, total: skillsShList.length }); return null; })()}
                    {filteredSkillsShList.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                        >
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-[10px] flex items-center justify-center text-white text-lg">
                                📦
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-800 dark:text-gray-100">
                                    {item.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <span>{item.source}</span>
                                    <span>•</span>
                                    <span>{formatInstallCount(item.installs)} {t.skills.installs}</span>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => handleInstallFromSkillsSh(item)}
                                disabled={isLoading}
                                icon={isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            >
                                {t.skills.install}
                            </Button>
                        </div>
                    ))}

                    {/* 加载更多指示器（在滚动区域内） */}
                    {skillsShHasMore && (
                        <div className="text-center py-2">
                            {skillsShLoading ? (
                                <div className="flex items-center justify-center text-gray-500 dark:text-gray-400">
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    <span className="text-sm">{t.skills.loadingMore}</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleLoadMoreSkillsSh}
                                    className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                    {t.skills.loadMore}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 加载中 */}
            {skillsShLoading && skillsShList.length === 0 && (
                <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>{t.skills.loadingMore}</span>
                </div>
            )}

            {/* 空状态 */}
            {!skillsShLoading && skillsShList.length === 0 && !skillsShError && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t.skills.clickToLoadSkills}</p>
                </div>
            )}

            {/* 通用错误提示 */}
            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-[10px] text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );

    /**
     * 渲染重复处理对话框
     */
    const renderDuplicateDialog = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-[10px] p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
                    {t.skills.duplicateSkillsFound}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {t.skills.duplicateSkillsDesc.replace('{count}', String(duplicates.length))}
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-h-32 overflow-y-auto">
                    {duplicates.map((dup, index) => (
                        <li key={index} className="py-1">
                            • {dup.newSkill.name}
                            <span className="text-gray-400">
                                （{dup.matchType === 'id' ? t.skills.duplicateById : t.skills.duplicateByName}）
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <input
                            type="radio"
                            name="strategy"
                            checked={duplicateStrategy === 'skip'}
                            onChange={() => setDuplicateStrategy('skip')}
                            className="text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {t.skills.skipDuplicates}
                        </span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <input
                            type="radio"
                            name="strategy"
                            checked={duplicateStrategy === 'overwrite'}
                            onChange={() => setDuplicateStrategy('overwrite')}
                            className="text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {t.skills.overwriteExisting}
                        </span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                        <input
                            type="radio"
                            name="strategy"
                            checked={duplicateStrategy === 'rename'}
                            onChange={() => setDuplicateStrategy('rename')}
                            className="text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {t.skills.renameAndAdd}
                        </span>
                    </label>
                </div>

                <div className="flex gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => setShowDuplicateDialog(false)}
                        className="flex-1"
                    >
                        {t.common.cancel}
                    </Button>
                    <Button
                        onClick={handleConfirmDuplicateStrategy}
                        className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500"
                    >
                        {t.common.confirm}
                    </Button>
                </div>
            </div>
        </div>
    );

    /**
     * 渲染安装结果
     */
    const renderInstallResult = () => (
        <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                {t.skills.installComplete}
            </h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>{t.skills.successfullyInstalled}: {installResult!.success}</p>
                {installResult!.skipped > 0 && (
                    <p>{t.skills.skipped}: {installResult!.skipped} {t.skills.duplicateSkillsSkipped}</p>
                )}
                {installResult!.failed > 0 && (
                    <p className="text-red-500">{t.skills.failed}: {installResult!.failed}</p>
                )}
            </div>
            <div className="flex gap-3 mt-6 justify-center">
                <Button
                    variant="secondary"
                    onClick={() => {
                        resetState();
                        onClose();
                    }}
                >
                    {t.common.close}
                </Button>
                <Button
                    onClick={resetState}
                    icon={<RefreshCw className="w-4 h-4" />}
                >
                    {t.skills.continueInstall}
                </Button>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                resetState();
                onClose();
            }}
            title={t.skills.installSkills}
            size="lg"
        >
            {installResult ? (
                renderInstallResult()
            ) : (
                <div className="space-y-4">
                    {/* Tab 切换 */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setRegistry(null);
                                    setError(null);
                                }}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab 内容 */}
                    <div className="min-h-[300px]">
                        {activeTab === 'url' && renderUrlTab()}
                        {activeTab === 'file' && renderFileTab()}
                        {activeTab === 'official' && renderOfficialTab()}
                    </div>

                    {/* 操作按钮 */}
                    {registry && (
                        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    resetState();
                                    onClose();
                                }}
                                className="flex-1"
                            >
                                {t.common.cancel}
                            </Button>
                            <Button
                                onClick={handleStartInstall}
                                disabled={selectedSkills.size === 0 || isLoading}
                                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500"
                                icon={
                                    isLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4" />
                                    )
                                }
                            >
                                {isLoading
                                    ? t.skills.installing
                                    : t.skills.installCount.replace('{count}', String(selectedSkills.size))}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* 重复处理对话框 */}
            {showDuplicateDialog && renderDuplicateDialog()}
        </Modal>
    );
};

export default SkillInstallModal;
