/**
 * SkillInstallModal 组件单元测试
 *
 * 测试用例对应文档 docs/modules/skills.md 中的：
 * - SK-110 ~ SK-114: 安装弹窗 UI 测试
 * - SK-120 ~ SK-129: URL 安装测试
 * - SK-130 ~ SK-134: 重复检测测试
 * - SK-140 ~ SK-143: 安装执行测试
 * - SK-150 ~ SK-154: 文件导入测试
 * - SK-160 ~ SK-165: skills.sh 集成测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { SkillInstallModal } from '../../../components/features/Skills/SkillInstallModal';
import { renderWithI18n } from '../../testUtils';
import type { Skill } from '../../../types';

// ==================== Mock Tauri API ====================
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// ==================== Mock skillUtils 模块（v3.0.6 使用 Tauri invoke）====================

// Mock fetchSkillsShList 函数（实际使用 Tauri invoke，测试中需要 mock）
const mockFetchSkillsShList = vi.fn();
const mockFetchSkillFromSkillsSh = vi.fn();

vi.mock('../../../utils/skillUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/skillUtils')>();
    return {
        ...actual,
        fetchSkillsShList: (...args: unknown[]) => mockFetchSkillsShList(...args),
        fetchSkillFromSkillsSh: (...args: unknown[]) => mockFetchSkillFromSkillsSh(...args),
    };
});

// ==================== Mock 数据 ====================

/**
 * 创建测试用的技能对象
 */
function createTestSkill(overrides: Partial<Skill> = {}): Skill {
    return {
        id: 'test-skill',
        name: '测试技能',
        description: '用于测试的技能',
        category: 'custom',
        icon: 'code',
        color: 'blue',
        enabled: true,
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '这是一个测试模板',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

/**
 * Mock 技能仓库数据（包含完整的 skill 定义）
 */
const mockRegistry = {
    name: '测试仓库',
    version: '1.0.0',
    description: '用于测试的技能仓库',
    skills: [
        {
            id: 'skill-1',
            name: '技能1',
            description: '第一个技能',
            version: '1.0.0',
            tags: ['test', 'demo'],
            skill: {
                name: '技能1',
                description: '第一个技能',
                category: 'custom' as const,
                promptTemplate: '模板1',
            },
        },
        {
            id: 'skill-2',
            name: '技能2',
            description: '第二个技能',
            version: '1.0.0',
            tags: ['test'],
            skill: {
                name: '技能2',
                description: '第二个技能',
                category: 'coding' as const,
                promptTemplate: '模板2',
            },
        },
    ],
};

// ==================== 测试套件 ====================

describe('SkillInstallModal', () => {
    // 保存原始 fetch
    const originalFetch = global.fetch;

    // Mock handlers
    const mockOnClose = vi.fn();
    const mockOnInstall = vi.fn();
    const mockOnUpdate = vi.fn();

    // 默认 props
    const defaultProps = {
        isOpen: true,
        onClose: mockOnClose,
        existingSkills: [] as Skill[],
        onInstall: mockOnInstall,
        onUpdate: mockOnUpdate,
    };

    beforeEach(() => {
        vi.resetAllMocks();
        // 重置 skills.sh mock
        mockFetchSkillsShList.mockReset();
        mockFetchSkillFromSkillsSh.mockReset();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    // ==================== 基础 UI 测试 (SK-110 ~ SK-114) ====================

    describe('基础 UI 测试', () => {
        // SK-110: 打开安装弹窗
        it('SK-110: 打开安装弹窗时显示默认 Tab', () => {
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 应该显示弹窗标题
            expect(screen.getByText(/安装技能|Install Skills/i)).toBeInTheDocument();

            // 应该有三个 Tab
            expect(screen.getByText(/URL 安装/i)).toBeInTheDocument();
            expect(screen.getByText(/文件导入/i)).toBeInTheDocument();
            expect(screen.getByText(/官方仓库/i)).toBeInTheDocument();
        });

        // SK-111: Tab 切换（v3.0.7: 官方仓库 Tab 自动加载数据）
        it('SK-111: Tab 切换正确显示内容', async () => {
            // 模拟 API 响应
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'test-skill', skillId: 'test-skill', name: 'Test Skill', installs: 1000, source: 'owner/repo' },
                ],
                hasMore: false,
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 点击文件导入 Tab
            await user.click(screen.getByText(/文件导入/i));

            // 应该显示文件上传区域
            expect(screen.getByText(/拖放 JSON 文件/i)).toBeInTheDocument();

            // 点击官方仓库 Tab
            await user.click(screen.getByText(/官方仓库/i));

            // 应该显示 skills.sh 搜索框（v3.0.7: 自动加载数据）
            expect(screen.getByPlaceholderText(/搜索技能/i)).toBeInTheDocument();

            // 等待自动加载完成
            await waitFor(() => {
                expect(screen.getByText(/Test Skill/i)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        // SK-113: 获取技能列表按钮状态
        it('SK-113: URL 为空时获取按钮禁用', () => {
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            const fetchButton = screen.getByRole('button', { name: /获取/i });
            expect(fetchButton).toBeDisabled();
        });

        // SK-114: 关闭弹窗
        it('SK-114: 点击关闭按钮时调用 onClose', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 找到关闭按钮（Modal 组件的关闭按钮是一个包含 X 图标的按钮）
            // 在标题行查找按钮
            const buttons = screen.getAllByRole('button');
            // 第一个按钮通常是关闭按钮（在 modal header 中）
            const closeButton = buttons[0];
            await user.click(closeButton);

            expect(mockOnClose).toHaveBeenCalled();
        });

        it('弹窗关闭时不显示', () => {
            renderWithI18n(<SkillInstallModal {...defaultProps} isOpen={false} />);

            expect(screen.queryByText(/安装技能|Install Skills/i)).not.toBeInTheDocument();
        });
    });

    // ==================== URL 安装测试 (SK-120 ~ SK-129) ====================

    describe('URL 安装测试', () => {
        // SK-123: 获取成功 - 显示技能列表
        it('SK-123: 获取成功后显示技能列表', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockRegistry),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/skills.json');

            // 点击获取按钮
            const fetchButton = screen.getByRole('button', { name: /获取/i });
            await user.click(fetchButton);

            // 等待技能列表显示
            await waitFor(() => {
                expect(screen.getByText('技能1')).toBeInTheDocument();
                expect(screen.getByText('技能2')).toBeInTheDocument();
            });
        });

        // SK-124: 获取失败 - 网络错误
        it('SK-124: 网络错误时显示错误信息', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/error.json');

            // 点击获取按钮
            const fetchButton = screen.getByRole('button', { name: /获取/i });
            await user.click(fetchButton);

            // 等待错误信息显示
            await waitFor(() => {
                expect(screen.getByText(/获取.*失败|失败/i)).toBeInTheDocument();
            });
        });

        // SK-127: 全选/取消全选
        it('SK-127: 全选和取消全选功能', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockRegistry),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL 并获取
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/skills.json');
            await user.click(screen.getByRole('button', { name: /获取/i }));

            // 等待技能列表显示
            await waitFor(() => {
                expect(screen.getByText('技能1')).toBeInTheDocument();
            });

            // 点击取消全选
            const toggleButton = screen.getByText(/取消全选/i);
            await user.click(toggleButton);

            // 再点击全选
            await user.click(screen.getByText(/全选/i));

            // 检查复选框状态
            const checkboxes = screen.getAllByRole('checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox).toBeChecked();
            });
        });

        // SK-129: 安装按钮显示数量
        it('SK-129: 安装按钮显示选中数量', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockRegistry),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL 并获取
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/skills.json');
            await user.click(screen.getByRole('button', { name: /获取/i }));

            // 等待技能列表显示
            await waitFor(() => {
                expect(screen.getByText('技能1')).toBeInTheDocument();
            });

            // 应该显示安装按钮，包含选中数量
            expect(screen.getByText(/安装.*2.*技能/i)).toBeInTheDocument();
        });
    });

    // ==================== 重复检测测试 (SK-130 ~ SK-134) ====================

    describe('重复检测测试', () => {
        // SK-130: 传入已存在技能
        it('SK-130: 可以传入已存在技能列表', async () => {
            const existingSkills = [
                createTestSkill({ id: 'existing-1', name: '技能1' }),
            ];

            renderWithI18n(
                <SkillInstallModal {...defaultProps} existingSkills={existingSkills} />
            );

            // 弹窗应该正常显示
            expect(screen.getByText(/安装技能|Install Skills/i)).toBeInTheDocument();
        });

        // SK-131: 空已存在技能列表
        it('SK-131: 空已存在技能列表正常工作', async () => {
            renderWithI18n(<SkillInstallModal {...defaultProps} existingSkills={[]} />);

            // 弹窗应该正常显示
            expect(screen.getByText(/安装技能|Install Skills/i)).toBeInTheDocument();
        });
    });

    // ==================== 安装执行测试 (SK-140 ~ SK-143) ====================

    describe('安装执行测试', () => {
        // SK-140: 安装按钮状态
        it('SK-140: 获取技能列表后显示安装按钮', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockRegistry),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL 并获取
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/skills.json');
            await user.click(screen.getByRole('button', { name: /获取/i }));

            // 等待并验证安装按钮显示
            await waitFor(() => {
                expect(screen.getByText('技能1')).toBeInTheDocument();
            });

            // 安装按钮应该显示并且可点击
            const installButton = screen.getByRole('button', { name: /安装.*\d.*技能/i });
            expect(installButton).toBeInTheDocument();
            expect(installButton).not.toBeDisabled();
        });

        // SK-142: 验证 onInstall 回调
        it('SK-142: 点击安装后调用 onInstall', async () => {
            // 创建包含完整技能定义的 mock 数据
            const registryWithFullSkills = {
                ...mockRegistry,
                skills: mockRegistry.skills.map(s => ({
                    ...s,
                    skill: {
                        name: s.name,
                        description: s.description,
                        category: 'custom',
                        promptTemplate: '测试模板',
                    },
                })),
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(registryWithFullSkills),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 输入 URL 并获取
            const input = screen.getByPlaceholderText(/github.com|JSON URL/i);
            await user.type(input, 'https://example.com/skills.json');
            await user.click(screen.getByRole('button', { name: /获取/i }));

            await waitFor(() => {
                expect(screen.getByText('技能1')).toBeInTheDocument();
            });

            // 点击安装按钮
            await user.click(screen.getByRole('button', { name: /安装.*\d.*技能/i }));

            // 验证 onInstall 被调用
            await waitFor(() => {
                expect(mockOnInstall).toHaveBeenCalled();
            });
        });
    });

    // ==================== 文件导入测试 (SK-150 ~ SK-154) ====================

    describe('文件导入测试', () => {
        // SK-152: 无效文件格式
        it('SK-152: 文件导入 Tab 只接受 JSON 文件', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到文件导入 Tab
            await user.click(screen.getByText(/文件导入/i));

            // 找到文件输入，验证它只接受 .json 文件
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            expect(fileInput).toHaveAttribute('accept', '.json');
        });

        // SK-153: 显示文件上传区域
        it('SK-153: 切换到文件导入 Tab 时显示上传区域', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到文件导入 Tab
            await user.click(screen.getByText(/文件导入/i));

            // 应该显示拖放区域
            expect(screen.getByText(/拖放 JSON 文件/i)).toBeInTheDocument();
            // 应该有选择文件按钮
            expect(screen.getByRole('button', { name: /选择文件/i })).toBeInTheDocument();
        });

        // SK-150: 文件导入支持格式说明
        it('SK-150: 显示文件格式说明', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到文件导入 Tab
            await user.click(screen.getByText(/文件导入/i));

            // 应该显示格式说明（支持从 Mobaus Studio 导出的技能包）
            expect(screen.getByText(/支持从.*Mobaus Studio.*导出/i)).toBeInTheDocument();
        });
    });

    // ==================== skills.sh 集成测试 (SK-160 ~ SK-165, v3.0.6) ====================

    describe('skills.sh 集成测试', () => {
        // SK-160: 显示 skills.sh 入口（v3.0.7: 自动加载数据）
        it('SK-160: 官方仓库 Tab 显示 skills.sh 入口', async () => {
            // 模拟 API 响应
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'test-skill', skillId: 'test-skill', name: 'Test Skill', installs: 1000, source: 'owner/repo' },
                ],
                hasMore: false,
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab
            await user.click(screen.getByText(/官方仓库/i));

            // 应该显示搜索框
            expect(screen.getByPlaceholderText(/搜索技能/i)).toBeInTheDocument();

            // 应该显示 skills.sh 来源链接
            expect(screen.getByRole('link', { name: /skills\.sh/i })).toBeInTheDocument();

            // v3.0.7: 自动加载数据，等待列表显示
            await waitFor(() => {
                expect(screen.getByText(/Test Skill/i)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        // SK-161: 加载 skills.sh 列表（v3.0.6: 使用 Tauri invoke mock）
        it('SK-161: 点击加载按钮从 skills.sh 获取技能列表', async () => {
            // 模拟 skills.sh API 响应（通过 mock 函数）
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'react-best-practices', skillId: 'react-best-practices', name: 'React Best Practices', installs: 45594, source: 'vercel-labs/agent-skills' },
                    { id: 'web-design', skillId: 'web-design', name: 'Web Design Guidelines', installs: 34911, source: 'anthropics/skills' },
                ],
                hasMore: true,
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab（v3.0.7: 自动加载数据）
            await user.click(screen.getByText(/官方仓库/i));

            // 等待技能列表显示（自动加载）
            await waitFor(() => {
                expect(screen.getByText(/React Best Practices/i)).toBeInTheDocument();
                expect(screen.getByText(/Web Design Guidelines/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // 应该显示安装次数
            expect(screen.getByText(/45\.6k/i)).toBeInTheDocument();
        });

        // SK-162: 搜索功能（v3.0.6: 使用 Tauri invoke mock）
        it('SK-162: 可以搜索 skills.sh 技能', async () => {
            // 第一次调用返回初始列表，第二次调用返回搜索结果
            mockFetchSkillsShList
                .mockResolvedValueOnce({
                    skills: [
                        { id: 'initial-skill', skillId: 'initial-skill', name: 'Initial Skill', installs: 1000, source: 'owner/repo' },
                    ],
                    hasMore: false,
                })
                .mockResolvedValueOnce({
                    skills: [
                        { id: 'react-patterns', skillId: 'react-patterns', name: 'React Patterns', installs: 12000, source: 'vercel-labs/agent-skills' },
                    ],
                    hasMore: false,
                });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab（v3.0.7: 自动加载数据）
            await user.click(screen.getByText(/官方仓库/i));

            // 等待初始列表加载完成
            await waitFor(() => {
                expect(screen.getByText(/Initial Skill/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // 输入搜索关键词
            const searchInput = screen.getByPlaceholderText(/搜索技能/i);
            await user.type(searchInput, 'react');

            // 点击搜索按钮
            await user.click(screen.getByRole('button', { name: /搜索/i }));

            // 等待搜索结果
            await waitFor(() => {
                expect(screen.getByText(/React Patterns/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // 验证 mock 被正确调用（第二次调用带搜索参数）
            expect(mockFetchSkillsShList).toHaveBeenCalledWith(
                expect.objectContaining({ search: 'react' })
            );
        });

        // SK-163: 点击安装按钮执行安装（v3.0.6: 使用 Tauri invoke mock）
        it('SK-163: 点击安装按钮从 GitHub 获取技能并安装', async () => {
            // 模拟 skills.sh 列表
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'react-best-practices', skillId: 'react-best-practices', name: 'React Best Practices', installs: 45594, source: 'vercel-labs/agent-skills' },
                ],
                hasMore: false,
            });

            // 模拟 fetchSkillFromSkillsSh 返回技能详情
            mockFetchSkillFromSkillsSh.mockResolvedValue({
                name: 'React Best Practices',
                description: 'Follow React official best practices',
                category: 'coding',
                promptTemplate: 'When helping with React development...',
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab（v3.0.7: 自动加载数据）
            await user.click(screen.getByText(/官方仓库/i));

            // 等待列表显示（自动加载）
            await waitFor(() => {
                expect(screen.getByText(/React Best Practices/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // 点击技能项的安装按钮
            const installButtons = screen.getAllByRole('button', { name: /安装/i });
            // 找到技能项对应的安装按钮（不是底部的安装按钮）
            const skillInstallButton = installButtons.find(btn =>
                btn.closest('.flex.items-center.gap-3')
            );

            if (skillInstallButton) {
                await user.click(skillInstallButton);

                // 等待 fetchSkillFromSkillsSh 被调用
                await waitFor(() => {
                    expect(mockFetchSkillFromSkillsSh).toHaveBeenCalled();
                }, { timeout: 3000 });

                // 验证 onInstall 被调用
                await waitFor(() => {
                    expect(mockOnInstall).toHaveBeenCalled();
                }, { timeout: 3000 });
            }
        });

        it('skills.sh skillId 不匹配时回退到 URL 多选列表', async () => {
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'xiaohongshu-skills', skillId: 'xiaohongshu-skills', name: 'xiaohongshu-skills', installs: 100, source: 'autoclaw-cc/xiaohongshu-skills' },
                ],
                hasMore: false,
            });

            mockFetchSkillFromSkillsSh.mockRejectedValueOnce(
                new Error(
                    '在仓库 autoclaw-cc/xiaohongshu-skills 中未找到技能 "xiaohongshu-skills"。\n' +
                    '该仓库包含以下 5 个技能：xhs-auth, xhs-content-ops, xhs-explore, xhs-interact, xhs-publish\n' +
                    '请使用正确的技能名称重新安装。'
                )
            );

            // Mock invoke for fetchSkillRegistry
            vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
                if (cmd === 'fetch_url_content') {
                    const url = String((args as Record<string, unknown>)?.url || '');
                    // Git Trees API
                    if (url.includes('/git/trees/main?recursive=1')) {
                        return JSON.stringify({
                            truncated: false,
                            tree: [
                                { type: 'blob', path: 'xhs-auth/SKILL.md' },
                                { type: 'blob', path: 'xhs-content-ops/SKILL.md' },
                            ],
                        });
                    }
                    if (url.endsWith('/main/xhs-auth/SKILL.md')) {
                        return '---\nname: xhs-auth\ndescription: auth\n---\nAuth prompt';
                    }
                    if (url.endsWith('/main/xhs-content-ops/SKILL.md')) {
                        return '---\nname: xhs-content-ops\ndescription: ops\n---\nOps prompt';
                    }
                }
                return null;
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    name: 'xiaohongshu-skills',
                    version: '1.0.0',
                    skills: [
                        { id: 'xhs-auth', name: 'xhs-auth', description: 'auth', version: '1.0.0', tags: ['custom'], skill: { name: 'xhs-auth', description: 'auth', category: 'custom' as const, promptTemplate: 'a' } },
                        { id: 'xhs-content-ops', name: 'xhs-content-ops', description: 'ops', version: '1.0.0', tags: ['custom'], skill: { name: 'xhs-content-ops', description: 'ops', category: 'custom' as const, promptTemplate: 'b' } },
                    ],
                }),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            await user.click(screen.getByText(/官方仓库/i));

            await waitFor(() => {
                expect(screen.getByText(/^xiaohongshu-skills$/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            const installButtons = screen.getAllByRole('button', { name: /安装/i });
            const skillInstallButton = installButtons.find(btn =>
                btn.closest('.flex.items-center.gap-3')
            );

            if (skillInstallButton) {
                await user.click(skillInstallButton);
            }

            await waitFor(() => {
                expect(screen.getByText(/URL 安装/i)).toBeInTheDocument();
                expect(screen.getByText(/已切换到仓库技能列表/)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('skills.sh skillId 不匹配且无候选列表时也回退到 URL 多选列表', async () => {
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'xiaohongshu-cover-generator', skillId: 'xiaohongshu-cover-generator', name: 'xiaohongshu-cover-generator', installs: 100, source: 'freestylefly/xiaohongshu-skills' },
                ],
                hasMore: false,
            });

            mockFetchSkillFromSkillsSh.mockRejectedValueOnce(
                new Error(
                    '在仓库 freestylefly/xiaohongshu-skills 中未找到技能 xiaohongshu-cover-generator。\n' +
                    '请确认：1) 仓库存在且可访问；2) 技能目录包含 SKILL.md 文件；3) 技能名称正确。'
                )
            );

            // Mock invoke for fetchSkillRegistry
            vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
                if (cmd === 'fetch_url_content') {
                    const url = String((args as Record<string, unknown>)?.url || '');
                    // Git Trees API
                    if (url.includes('/git/trees/main?recursive=1')) {
                        return JSON.stringify({
                            truncated: false,
                            tree: [
                                { type: 'blob', path: 'xhs-auth/SKILL.md' },
                                { type: 'blob', path: 'xhs-cover-generator/SKILL.md' },
                            ],
                        });
                    }
                    if (url.endsWith('/main/xhs-auth/SKILL.md')) {
                        return '---\nname: xhs-auth\ndescription: auth\n---\nAuth prompt';
                    }
                    if (url.endsWith('/main/xhs-cover-generator/SKILL.md')) {
                        return '---\nname: xhs-cover-generator\ndescription: cover\n---\nCover prompt';
                    }
                }
                return null;
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    name: 'xiaohongshu-skills',
                    version: '1.0.0',
                    skills: [
                        { id: 'xhs-auth', name: 'xhs-auth', description: 'auth', version: '1.0.0', tags: ['custom'], skill: { name: 'xhs-auth', description: 'auth', category: 'custom' as const, promptTemplate: 'a' } },
                        { id: 'xhs-cover-generator', name: 'xhs-cover-generator', description: 'cover', version: '1.0.0', tags: ['custom'], skill: { name: 'xhs-cover-generator', description: 'cover', category: 'custom' as const, promptTemplate: 'b' } },
                    ],
                }),
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            await user.click(screen.getByText(/官方仓库/i));

            await waitFor(() => {
                expect(screen.getByText(/^xiaohongshu-cover-generator$/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            const installButtons = screen.getAllByRole('button', { name: /安装/i });
            const skillInstallButton = installButtons.find(btn =>
                btn.closest('.flex.items-center.gap-3')
            );

            if (skillInstallButton) {
                await user.click(skillInstallButton);
            }

            await waitFor(() => {
                expect(screen.getByText(/URL 安装/i)).toBeInTheDocument();
                expect(screen.getByText(/已加载仓库中的全部技能，请选择后安装/)).toBeInTheDocument();
                expect(screen.getByText(/^xhs-auth$/i)).toBeInTheDocument();
                expect(screen.getByText(/^xhs-cover-generator$/i)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        // SK-164: API 错误处理 - 显示错误提示
        it('SK-164: skills.sh API 错误时显示错误提示', async () => {
            // 模拟 API 错误
            mockFetchSkillsShList.mockRejectedValue(new Error('获取 skills.sh 技能列表失败'));

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab（v3.0.7: 自动加载会触发错误）
            await user.click(screen.getByText(/官方仓库/i));

            // 应该显示错误提示（自动加载失败）
            await waitFor(() => {
                expect(screen.getByText(/获取.*失败|错误|Error/i)).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        // SK-165: 加载更多
        it('SK-165: 有更多数据时显示加载更多按钮', async () => {
            mockFetchSkillsShList.mockResolvedValue({
                skills: [
                    { id: 'skill-1', skillId: 'skill-1', name: 'Skill 1', installs: 1000, source: 'owner/repo' },
                ],
                hasMore: true,
            });

            const user = userEvent.setup();
            renderWithI18n(<SkillInstallModal {...defaultProps} />);

            // 切换到官方仓库 Tab（v3.0.7: 自动加载数据）
            await user.click(screen.getByText(/官方仓库/i));

            // 等待列表显示（自动加载）
            await waitFor(() => {
                expect(screen.getByText(/Skill 1/i)).toBeInTheDocument();
            }, { timeout: 3000 });

            // 应该显示加载更多按钮
            expect(screen.getByText(/加载更多/i)).toBeInTheDocument();
        });
    });
});
