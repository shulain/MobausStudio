/**
 * 权限检查工具模块单元测试 (v2.4.0)
 *
 * 测试用例对应文档：docs/modules/agent.md
 * 测试用例 ID: PC-01 ~ CL-03
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    globToRegex,
    matchGlob,
    parseToolRule,
    matchToolRule,
    checkPathPermission,
    checkToolPermission,
    shouldAutoApprove,
    isDangerousCommand,
    checkSandboxPermission,
    extractPathFromArgs,
    extractCommandFromArgs,
    extractUrlFromArgs,
    extractDomainFromUrl,
    checkComprehensivePermission,
    clearRegexCache,
} from '../../utils/permissionUtils';

describe('permissionUtils', () => {
    // 每个测试前清除正则缓存
    beforeEach(() => {
        clearRegexCache();
    });

    // ==================== Glob 模式匹配测试 ====================
    describe('Glob 模式匹配', () => {
        describe('globToRegex', () => {
            it('应正确转换简单模式', () => {
                const regex = globToRegex('*.md');
                expect(regex.source).toBe('^[^/]*\\.md$');
            });

            it('应正确转换多层通配符', () => {
                const regex = globToRegex('/Users/**');
                expect(regex.source).toBe('^\\/Users\\/.*$');
            });

            it('应缓存已编译的正则', () => {
                const regex1 = globToRegex('*.md');
                const regex2 = globToRegex('*.md');
                expect(regex1).toBe(regex2);
            });
        });

        describe('matchGlob', () => {
            // PC-01: 单层通配符匹配
            it('PC-01: 单层通配符应匹配同级文件', () => {
                expect(matchGlob('*.md', 'README.md')).toBe(true);
                expect(matchGlob('*.ts', 'index.ts')).toBe(true);
                expect(matchGlob('test.*', 'test.js')).toBe(true);
            });

            // PC-02: 单层通配符不匹配子目录
            it('PC-02: 单层通配符不应匹配子目录中的文件', () => {
                expect(matchGlob('/tmp/*', '/tmp/sub/file.txt')).toBe(false);
                expect(matchGlob('src/*', 'src/utils/helper.ts')).toBe(false);
            });

            // PC-03: 多层通配符匹配
            it('PC-03: 多层通配符应匹配任意深度的路径', () => {
                expect(matchGlob('/Users/**', '/Users/xxx/a/b/c.ts')).toBe(true);
                expect(matchGlob('src/**/*.ts', 'src/utils/helper.ts')).toBe(true);
                expect(matchGlob('/project/**', '/project/deep/nested/file.js')).toBe(true);
            });

            // PC-04: 问号通配符匹配
            it('PC-04: 问号通配符应匹配单个字符', () => {
                expect(matchGlob('file?.txt', 'file1.txt')).toBe(true);
                expect(matchGlob('file?.txt', 'fileA.txt')).toBe(true);
                expect(matchGlob('file?.txt', 'file12.txt')).toBe(false);
            });

            // PC-05: 精确路径匹配
            it('PC-05: 精确路径应完全匹配', () => {
                expect(matchGlob('/tmp/test.txt', '/tmp/test.txt')).toBe(true);
            });

            // PC-06: 精确路径不匹配
            it('PC-06: 精确路径不应匹配不同的路径', () => {
                expect(matchGlob('/tmp/test.txt', '/tmp/other.txt')).toBe(false);
            });

            it('应处理特殊字符', () => {
                expect(matchGlob('file.test.ts', 'file.test.ts')).toBe(true);
                expect(matchGlob('file[1].txt', 'file[1].txt')).toBe(true);
            });
        });
    });

    // ==================== 工具规则解析测试 ====================
    describe('工具规则解析', () => {
        describe('parseToolRule', () => {
            // PR-01: 解析简单工具名
            it('PR-01: 应解析简单工具名', () => {
                const result = parseToolRule('Read');
                expect(result).toEqual({ toolName: 'Read' });
            });

            // PR-02: 解析通配符
            it('PR-02: 应解析通配符', () => {
                const result = parseToolRule('*');
                expect(result).toEqual({ toolName: '*' });
            });

            // PR-03: 解析命令条件
            it('PR-03: 应解析命令条件', () => {
                const result = parseToolRule('Bash(npm run *)');
                expect(result).toEqual({
                    toolName: 'Bash',
                    condition: 'npm run *',
                    conditionType: 'command',
                });
            });

            // PR-04: 解析域名条件
            it('PR-04: 应解析域名条件', () => {
                const result = parseToolRule('WebFetch(domain:github.com)');
                expect(result).toEqual({
                    toolName: 'WebFetch',
                    condition: 'github.com',
                    conditionType: 'domain',
                });
            });

            // PR-05: 解析路径条件
            it('PR-05: 应解析路径条件', () => {
                const result = parseToolRule('Read(path:/tmp/*)');
                expect(result).toEqual({
                    toolName: 'Read',
                    condition: '/tmp/*',
                    conditionType: 'path',
                });
            });

            it('应处理带下划线的工具名', () => {
                const result = parseToolRule('read_file');
                expect(result).toEqual({ toolName: 'read_file' });
            });
        });
    });

    // ==================== 工具规则匹配测试 ====================
    describe('工具规则匹配', () => {
        describe('matchToolRule', () => {
            // TM-01: 简单工具名匹配
            it('TM-01: 简单工具名应匹配相同的工具', () => {
                expect(matchToolRule('Read', 'Read', {})).toBe(true);
            });

            // TM-02: 简单工具名不匹配
            it('TM-02: 简单工具名不应匹配不同的工具', () => {
                expect(matchToolRule('Read', 'Write', {})).toBe(false);
            });

            // TM-03: 通配符匹配所有
            it('TM-03: 通配符应匹配所有工具', () => {
                expect(matchToolRule('*', 'AnyTool', {})).toBe(true);
                expect(matchToolRule('*', 'Read', {})).toBe(true);
                expect(matchToolRule('*', 'Bash', { command: 'ls' })).toBe(true);
            });

            // TM-04: 命令条件匹配
            it('TM-04: 命令条件应匹配符合模式的命令', () => {
                expect(
                    matchToolRule('Bash(npm run *)', 'Bash', { command: 'npm run build' })
                ).toBe(true);
                expect(
                    matchToolRule('Bash(git *)', 'Bash', { command: 'git status' })
                ).toBe(true);
            });

            // TM-05: 命令条件不匹配
            it('TM-05: 命令条件不应匹配不符合模式的命令', () => {
                expect(
                    matchToolRule('Bash(npm run *)', 'Bash', { command: 'rm -rf /' })
                ).toBe(false);
            });

            // TM-06: 域名条件匹配
            it('TM-06: 域名条件应匹配符合的 URL', () => {
                expect(
                    matchToolRule('WebFetch(domain:github.com)', 'WebFetch', {
                        url: 'https://github.com/xxx',
                    })
                ).toBe(true);
            });

            // TM-07: 域名条件不匹配
            it('TM-07: 域名条件不应匹配不符合的 URL', () => {
                expect(
                    matchToolRule('WebFetch(domain:github.com)', 'WebFetch', {
                        url: 'https://gitlab.com/xxx',
                    })
                ).toBe(false);
            });

            it('路径条件应匹配符合模式的路径', () => {
                expect(
                    matchToolRule('Read(path:/tmp/*)', 'Read', { path: '/tmp/file.txt' })
                ).toBe(true);
                expect(
                    matchToolRule('Read(path:/tmp/*)', 'Read', { path: '/home/file.txt' })
                ).toBe(false);
            });

            it('工具名不匹配时应返回 false', () => {
                expect(
                    matchToolRule('Bash(npm *)', 'Read', { command: 'npm run build' })
                ).toBe(false);
            });

            it('缺少必要参数时应返回 false', () => {
                expect(matchToolRule('Bash(npm *)', 'Bash', {})).toBe(false);
                expect(
                    matchToolRule('WebFetch(domain:github.com)', 'WebFetch', {})
                ).toBe(false);
            });
        });
    });

    // ==================== 路径权限检查测试 ====================
    describe('路径权限检查', () => {
        describe('checkPathPermission', () => {
            // PP-01: 无配置默认允许
            it('PP-01: 无配置时应默认允许', () => {
                const result = checkPathPermission('/any/path', {});
                expect(result.allowed).toBe(true);
            });

            // PP-02: allowedPaths 匹配允许
            it('PP-02: allowedPaths 匹配时应允许', () => {
                const result = checkPathPermission('/project/file.ts', {
                    allowedPaths: ['/project/**'],
                });
                expect(result.allowed).toBe(true);
                expect(result.matchedRule).toBe('/project/**');
            });

            // PP-03: allowedPaths 不匹配拒绝
            it('PP-03: allowedPaths 不匹配时应拒绝', () => {
                const result = checkPathPermission('/other/file.ts', {
                    allowedPaths: ['/project/**'],
                });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('未匹配任何允许规则');
            });

            // PP-04: deniedPaths 优先拒绝
            it('PP-04: deniedPaths 应优先于 allowedPaths', () => {
                const result = checkPathPermission('/project/secrets/key.txt', {
                    allowedPaths: ['/project/**'],
                    deniedPaths: ['/project/secrets/**'],
                });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('禁止规则拒绝');
                expect(result.matchedRule).toBe('/project/secrets/**');
            });

            // PP-05: deniedPaths 不匹配允许
            it('PP-05: deniedPaths 不匹配时应允许', () => {
                const result = checkPathPermission('/project/src/app.ts', {
                    allowedPaths: ['/project/**'],
                    deniedPaths: ['/project/secrets/**'],
                });
                expect(result.allowed).toBe(true);
            });

            it('多个 allowedPaths 应匹配任一', () => {
                const result = checkPathPermission('/docs/readme.md', {
                    allowedPaths: ['/project/**', '/docs/**'],
                });
                expect(result.allowed).toBe(true);
            });
        });
    });

    // ==================== 工具权限检查测试 ====================
    describe('工具权限检查', () => {
        describe('checkToolPermission', () => {
            // TP-01: 无配置默认允许
            it('TP-01: 无配置时应默认允许', () => {
                const result = checkToolPermission('Bash', { command: 'ls' }, {});
                expect(result.allowed).toBe(true);
            });

            // TP-02: allow 规则匹配允许
            it('TP-02: allow 规则匹配时应允许', () => {
                const result = checkToolPermission(
                    'Bash',
                    { command: 'npm run build' },
                    { allow: ['Bash(npm *)'] }
                );
                expect(result.allowed).toBe(true);
            });

            // TP-03: allow 规则不匹配拒绝
            it('TP-03: allow 规则不匹配时应拒绝', () => {
                const result = checkToolPermission(
                    'Bash',
                    { command: 'rm -rf /' },
                    { allow: ['Bash(npm *)'] }
                );
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('未匹配任何允许规则');
            });

            // TP-04: deny 规则优先拒绝
            it('TP-04: deny 规则应优先于 allow', () => {
                const result = checkToolPermission(
                    'Bash',
                    { command: 'rm -rf /home' },
                    { allow: ['*'], deny: ['Bash(rm -rf **)'] }
                );
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('禁止规则拒绝');
            });

            // TP-05: deny 规则不匹配允许
            it('TP-05: deny 规则不匹配时应允许', () => {
                const result = checkToolPermission(
                    'Bash',
                    { command: 'npm run build' },
                    { allow: ['*'], deny: ['Bash(rm *)'] }
                );
                expect(result.allowed).toBe(true);
            });

            it('多个 allow 规则应匹配任一', () => {
                const result = checkToolPermission('Read', { path: '/tmp/file.txt' }, {
                    allow: ['Bash(npm *)', 'Read'],
                });
                expect(result.allowed).toBe(true);
            });
        });
    });

    // ==================== 沙箱模式测试 ====================
    describe('沙箱模式', () => {
        describe('isDangerousCommand', () => {
            it('应识别危险命令', () => {
                // rm -rf * 模式匹配
                expect(isDangerousCommand('rm -rf /home/user')).toBe(true);
                expect(isDangerousCommand('rm -rf /etc/config')).toBe(true);
                // sudo * 模式匹配
                expect(isDangerousCommand('sudo apt install vim')).toBe(true);
                expect(isDangerousCommand('sudo reboot')).toBe(true);
                // chmod 777 * 模式匹配
                expect(isDangerousCommand('chmod 777 /etc/passwd')).toBe(true);
                // mkfs.* 模式匹配
                expect(isDangerousCommand('mkfs.ext4 /dev/sda')).toBe(true);
                // shutdown * 模式匹配
                expect(isDangerousCommand('shutdown -h now')).toBe(true);
                expect(isDangerousCommand('shutdown now')).toBe(true);
            });

            it('应允许安全命令', () => {
                expect(isDangerousCommand('npm run build')).toBe(false);
                expect(isDangerousCommand('git status')).toBe(false);
                expect(isDangerousCommand('ls -la')).toBe(false);
                expect(isDangerousCommand('rm file.txt')).toBe(false); // 不是 rm -rf
            });
        });

        describe('checkSandboxPermission', () => {
            it('应拒绝 Bash 工具的危险命令', () => {
                const result = checkSandboxPermission('Bash', { command: 'rm -rf /' });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('沙箱模式');
            });

            it('应允许 Bash 工具的安全命令', () => {
                const result = checkSandboxPermission('Bash', { command: 'npm run build' });
                expect(result.allowed).toBe(true);
            });

            it('应允许非 Bash 工具', () => {
                const result = checkSandboxPermission('Read', { path: '/tmp/file.txt' });
                expect(result.allowed).toBe(true);
            });
        });
    });

    // ==================== 自动批准检查测试 ====================
    describe('自动批准检查', () => {
        describe('shouldAutoApprove', () => {
            // AA-01: readFiles 自动批准
            it('AA-01: readFiles 应自动批准读取工具', () => {
                expect(
                    shouldAutoApprove('Read', { path: '/tmp/file.txt' }, 'fs-server', {
                        readFiles: true,
                    })
                ).toBe(true);
                expect(
                    shouldAutoApprove('read_file', {}, 'fs-server', { readFiles: true })
                ).toBe(true);
                expect(
                    shouldAutoApprove('Glob', {}, 'fs-server', { readFiles: true })
                ).toBe(true);
            });

            // AA-02: writeFiles 自动批准
            it('AA-02: writeFiles 应自动批准写入工具', () => {
                expect(
                    shouldAutoApprove('Write', { path: '/tmp/file.txt' }, 'fs-server', {
                        writeFiles: true,
                    })
                ).toBe(true);
                expect(
                    shouldAutoApprove('Edit', {}, 'fs-server', { writeFiles: true })
                ).toBe(true);
            });

            // AA-03: bashCommands 模式匹配
            it('AA-03: bashCommands 应匹配符合模式的命令', () => {
                expect(
                    shouldAutoApprove('Bash', { command: 'npm run build' }, 'server', {
                        bashCommands: ['npm *'],
                    })
                ).toBe(true);
                expect(
                    shouldAutoApprove('Bash', { command: 'git status' }, 'server', {
                        bashCommands: ['npm *', 'git *'],
                    })
                ).toBe(true);
            });

            // AA-04: bashCommands 模式不匹配
            it('AA-04: bashCommands 不应匹配不符合模式的命令', () => {
                expect(
                    shouldAutoApprove('Bash', { command: 'rm -rf /' }, 'server', {
                        bashCommands: ['npm *'],
                    })
                ).toBe(false);
            });

            // AA-05: mcpTools 匹配
            it('AA-05: mcpTools 应匹配指定的工具', () => {
                expect(
                    shouldAutoApprove('read_file', {}, 'fs-server', {
                        mcpTools: ['fs-server:read_file'],
                    })
                ).toBe(true);
            });

            // AA-06: mcpTools 通配符匹配
            it('AA-06: mcpTools 通配符应匹配', () => {
                expect(
                    shouldAutoApprove('any_tool', {}, 'fs-server', {
                        mcpTools: ['fs-server:*'],
                    })
                ).toBe(true);
                expect(
                    shouldAutoApprove('read_file', {}, 'any-server', {
                        mcpTools: ['*:read_file'],
                    })
                ).toBe(true);
            });

            it('无配置时应返回 false', () => {
                expect(shouldAutoApprove('Read', {}, 'server', undefined)).toBe(false);
                expect(shouldAutoApprove('Read', {}, 'server', {})).toBe(false);
            });
        });
    });

    // ==================== 辅助函数测试 ====================
    describe('辅助函数', () => {
        describe('extractPathFromArgs', () => {
            it('应提取各种格式的路径参数', () => {
                expect(extractPathFromArgs({ path: '/tmp/file.txt' })).toBe('/tmp/file.txt');
                expect(extractPathFromArgs({ file_path: '/tmp/file.txt' })).toBe('/tmp/file.txt');
                expect(extractPathFromArgs({ filePath: '/tmp/file.txt' })).toBe('/tmp/file.txt');
                expect(extractPathFromArgs({ file: '/tmp/file.txt' })).toBe('/tmp/file.txt');
            });

            it('无路径参数时应返回 undefined', () => {
                expect(extractPathFromArgs({})).toBeUndefined();
                expect(extractPathFromArgs({ command: 'ls' })).toBeUndefined();
            });
        });

        describe('extractCommandFromArgs', () => {
            it('应提取各种格式的命令参数', () => {
                expect(extractCommandFromArgs({ command: 'npm run build' })).toBe('npm run build');
                expect(extractCommandFromArgs({ cmd: 'ls -la' })).toBe('ls -la');
                expect(extractCommandFromArgs({ script: 'echo hello' })).toBe('echo hello');
            });

            it('无命令参数时应返回 undefined', () => {
                expect(extractCommandFromArgs({})).toBeUndefined();
                expect(extractCommandFromArgs({ path: '/tmp' })).toBeUndefined();
            });
        });

        describe('extractUrlFromArgs', () => {
            it('应提取各种格式的 URL 参数', () => {
                expect(extractUrlFromArgs({ url: 'https://github.com' })).toBe('https://github.com');
                expect(extractUrlFromArgs({ uri: 'https://api.example.com' })).toBe(
                    'https://api.example.com'
                );
                expect(extractUrlFromArgs({ href: 'https://docs.example.com' })).toBe(
                    'https://docs.example.com'
                );
            });

            it('无 URL 参数时应返回 undefined', () => {
                expect(extractUrlFromArgs({})).toBeUndefined();
            });
        });

        describe('extractDomainFromUrl', () => {
            it('应从 URL 中提取域名', () => {
                expect(extractDomainFromUrl('https://github.com/user/repo')).toBe('github.com');
                expect(extractDomainFromUrl('http://api.example.com:8080/path')).toBe(
                    'api.example.com'
                );
                expect(extractDomainFromUrl('https://sub.domain.com')).toBe('sub.domain.com');
            });

            it('应处理无协议的 URL', () => {
                expect(extractDomainFromUrl('github.com/user/repo')).toBe('github.com');
            });
        });
    });

    // ==================== 综合权限检查测试 ====================
    describe('综合权限检查', () => {
        describe('checkComprehensivePermission', () => {
            // CL-01: 未超限允许
            it('CL-01: 未超限时应允许', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Read', args: {}, serverId: 'server' },
                    currentCallCount: 4,
                    maxCallCount: 5,
                });
                expect(result.allowed).toBe(true);
                expect(result.exceedsCallLimit).toBe(false);
            });

            // CL-02: 达到上限拒绝
            it('CL-02: 达到上限时应拒绝', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Read', args: {}, serverId: 'server' },
                    currentCallCount: 5,
                    maxCallCount: 5,
                });
                expect(result.allowed).toBe(false);
                expect(result.exceedsCallLimit).toBe(true);
                expect(result.reason).toContain('上限');
            });

            // CL-03: 无限制配置允许
            it('CL-03: 无限制配置时应允许', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Read', args: {}, serverId: 'server' },
                    currentCallCount: 100,
                    maxCallCount: undefined,
                });
                expect(result.allowed).toBe(true);
                expect(result.exceedsCallLimit).toBe(false);
            });

            it('沙箱模式应拒绝危险命令', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Bash', args: { command: 'rm -rf /' }, serverId: 'server' },
                    sandboxMode: true,
                    currentCallCount: 0,
                });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('沙箱模式');
            });

            it('应综合检查工具权限和路径权限', () => {
                const result = checkComprehensivePermission({
                    context: {
                        toolName: 'Read',
                        args: { path: '/project/secrets/key.txt' },
                        serverId: 'server',
                    },
                    permissions: {
                        allow: ['Read'],
                        allowedPaths: ['/project/**'],
                        deniedPaths: ['/project/secrets/**'],
                    },
                    currentCallCount: 0,
                });
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('禁止规则拒绝');
            });

            it('应正确判断自动批准', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Read', args: {}, serverId: 'server' },
                    permissions: {
                        autoApprove: { readFiles: true },
                    },
                    currentCallCount: 0,
                });
                expect(result.allowed).toBe(true);
                expect(result.requiresApproval).toBe(false);
            });

            it('无自动批准配置时应需要确认', () => {
                const result = checkComprehensivePermission({
                    context: { toolName: 'Bash', args: { command: 'npm run build' }, serverId: 'server' },
                    currentCallCount: 0,
                });
                expect(result.allowed).toBe(true);
                expect(result.requiresApproval).toBe(true);
            });
        });
    });
});
