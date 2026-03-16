// ==================== Chat Types ====================
export interface Chat {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    starred: boolean;
    model: string;
    messages: Message[];
    // Agent 选择持久化 (v2.3.0)
    agentId?: string | null;
}

export interface Message {
    id: string;
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: Date;
    tokens?: number;

    // 思考模式：AI 的推理过程 (如 DeepSeek Reasoner)
    reasoningContent?: string;

    // 多模态：附件列表
    attachments?: Attachment[];

    // MCP 工具调用 (v2.1.0)
    toolCalls?: ToolCall[];    // AI 请求的工具调用
    toolResults?: ToolResult[]; // 工具执行结果
}

/** 工具调用记录 (v2.1.0, v2.5.0: 添加 serverName, v4.1.36: 添加 thoughtSignature) */
export interface ToolCall {
    id: string;           // 调用 ID (由 AI 返回)
    name: string;         // 工具名称
    arguments: string;    // JSON 字符串格式的参数
    serverId: string;     // 对应的 MCP 服务器 ID
    serverName?: string;  // MCP 服务器名称 (v2.5.0, 用于 UI 显示)
    thoughtSignature?: string; // Gemini 2.5 thinking 模型的 thought_signature (v4.1.36)
}

/** 工具执行结果 (v2.1.0, v2.4.0: 添加 duration) */
export interface ToolResult {
    callId: string;       // 对应的 ToolCall ID
    content: string;      // 执行结果内容
    isError: boolean;     // 是否为错误
    duration?: number;    // 执行耗时（毫秒） (v2.4.0)
}

// 附件类型 (图片/视频/文件)
export interface Attachment {
    id: string;
    type: 'image' | 'video' | 'file';
    name: string;
    url: string;           // data:base64 或文件路径
    mimeType: string;
    size: number;          // 字节数
}

// ==================== Agent Types ====================
export interface Agent {
    id: string;
    name: string;
    description: string;
    model: string;
    skills: string[];
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    status: 'active' | 'inactive';
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    lastUsedAt?: Date;

    // MCP 集成 (v2.1.0)
    mcpServers?: AgentMCPConfig[];  // 关联的 MCP 服务器
    enableToolUse?: boolean;         // 是否启用工具调用

    // 权限与安全配置 (v2.4.0)
    permissions?: AgentPermissions;  // 权限配置
    context?: AgentContext;          // 上下文配置
    limits?: AgentLimits;            // 执行限制
}

/** Agent 关联的 MCP 服务器配置 (v2.1.0) */
export interface AgentMCPConfig {
    serverId: string;        // MCP 服务器 ID
    serverName: string;      // 显示名称 (用于 UI)
    enabledTools?: string[]; // 启用的工具列表，undefined 表示全部启用
}

/**
 * Agent 权限配置 (v2.4.0)
 * 参考 Claude Code 的 .claude/settings.local.json 设计
 */
export interface AgentPermissions {
    // ===== 文件系统权限 =====
    /** 允许访问的目录/文件路径列表 */
    allowedPaths?: string[];
    /** 禁止访问的目录/文件路径列表（优先级高于 allowedPaths） */
    deniedPaths?: string[];
    /** 工作目录（Agent 执行时的默认目录） */
    workingDirectory?: string;

    // ===== 工具权限规则 =====
    /**
     * 允许的工具/操作规则列表
     * 支持通配符模式，如：
     * - "Read" - 允许所有读取操作
     * - "Bash(npm run *)" - 允许 npm run 开头的命令
     * - "Bash(git add:*)" - 允许 git add 命令
     * - "WebFetch(domain:github.com)" - 允许访问 github.com
     */
    allow?: string[];
    /**
     * 禁止的工具/操作规则列表（优先级高于 allow）
     * 格式同 allow
     */
    deny?: string[];

    // ===== 自动批准规则 =====
    /** 自动批准配置 */
    autoApprove?: AgentAutoApprove;
}

/**
 * Agent 自动批准规则 (v2.4.0)
 * 匹配的操作将自动执行，无需用户确认
 */
export interface AgentAutoApprove {
    /** 自动批准读取文件 */
    readFiles?: boolean;
    /** 自动批准写入文件 */
    writeFiles?: boolean;
    /** 自动批准的 Bash 命令模式列表 */
    bashCommands?: string[];
    /** 自动批准的 MCP 工具列表（格式：serverId:toolName 或 *:toolName） */
    mcpTools?: string[];
}

/**
 * Agent 上下文配置 (v2.4.0)
 * 定义 Agent 启动时自动加载的上下文信息
 */
export interface AgentContext {
    /**
     * 自动加载的文件路径列表
     * 支持相对路径（相对于 workingDirectory）和绝对路径
     * 示例：["CLAUDE.md", "docs/README.md", ".cursorrules"]
     */
    files?: string[];
    /**
     * 自动获取的 URL 列表
     * 示例：["https://docs.example.com/api"]
     */
    urls?: string[];
    /**
     * 额外的系统指令（追加到 systemPrompt 之后）
     */
    additionalInstructions?: string;
}

/**
 * Agent 执行限制 (v2.4.0)
 * 用于安全防护和资源控制
 */
export interface AgentLimits {
    /** 单次对话最大工具调用轮数（默认 50，一轮可能包含多个工具） */
    maxToolCalls?: number;
    /** 单次调用最大工具数量（默认 5，防止一次调用太多工具） */
    maxToolsPerCall?: number;
    /** 总工具调用次数限制（默认 200，累计所有轮次的所有工具） */
    maxTotalToolCalls?: number;
    /** 单次工具调用超时时间（秒，默认 60） */
    toolCallTimeout?: number;
    /** 总执行时间限制（秒，默认 600 = 10分钟） */
    maxExecutionTime?: number;
    /** 最大可操作文件大小（字节，默认 10MB） */
    maxFileSize?: number;
    /** 是否启用沙箱模式（限制危险操作） */
    sandboxMode?: boolean;
    /** 最大输出长度（字符数，防止无限输出） */
    maxOutputLength?: number;
    /** 按工具名称的特殊限制（可选） */
    toolSpecificLimits?: Record<string, {
        maxCalls?: number;      // 该工具最大调用次数
        timeout?: number;        // 该工具超时时间（秒）
        disabled?: boolean;      // 是否禁用该工具
    }>;
}

export interface AgentCreateInput {
    name: string;
    description: string;
    model: string;
    skills: string[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    // MCP 集成 (v2.1.0)
    mcpServers?: AgentMCPConfig[];  // 关联的 MCP 服务器
    enableToolUse?: boolean;         // 是否启用工具调用
    // 权限与安全配置 (v2.4.0)
    permissions?: AgentPermissions;  // 权限配置
    context?: AgentContext;          // 上下文配置
    limits?: AgentLimits;            // 执行限制
}

export interface AgentUpdateInput extends Partial<AgentCreateInput> {
    status?: 'active' | 'inactive';
}

// ==================== Skill Types (v2.0.0 - 提示词模板) ====================

/**
 * 技能分类
 */
export type SkillCategory =
    | 'writing'      // 写作
    | 'coding'       // 编程
    | 'analysis'     // 分析
    | 'translation'  // 翻译
    | 'creative'     // 创意
    | 'productivity' // 效率
    | 'custom';      // 自定义

/**
 * 技能颜色
 */
export type SkillColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan';

/**
 * 输出格式
 */
export type SkillOutputFormat =
    | 'markdown'  // Markdown 格式
    | 'json'      // JSON 格式（配合 outputSchema 使用）
    | 'code'      // 代码格式
    | 'table'     // 表格格式
    | 'free';     // 自由格式

/**
 * 触发条件
 */
export interface SkillTrigger {
    type: 'keyword' | 'regex' | 'intent';  // 触发类型
    pattern: string;                        // 匹配模式
    priority: number;                       // 优先级（多个匹配时使用，数值越大优先级越高）
}

/**
 * 可配置变量
 */
export interface SkillVariable {
    name: string;                              // 变量名（用于模板中 {{name}} 替换）
    label: string;                             // 显示标签
    type: 'string' | 'number' | 'boolean' | 'select';
    defaultValue: string | number | boolean;
    options?: string[];                        // type='select' 时的选项
    description?: string;                      // 变量说明
}

/**
 * Skill 技能 - 提示词模板 + 输出规范 (v2.0.0)
 *
 * 与 MCP 的区别：
 * - Skill: 思维层（怎么想）- 提示词注入
 * - MCP: 动作层（怎么做）- 工具调用
 */
export interface Skill {
    id: string;
    name: string | { zh: string; en: string };   // 技能名称（支持多语言）
    description: string | { zh: string; en: string }; // 技能描述（支持多语言）
    category: SkillCategory;                   // 技能分类
    icon: string;                              // 图标名称 (lucide-react)
    color: SkillColor;                         // 主题色
    enabled: boolean;                          // 是否启用

    // ===== 核心：提示词模板 =====
    promptTemplate: string;                    // 提示词模板（Markdown 格式，支持 {{变量}} 语法）

    // ===== 可选：输出规范 =====
    outputFormat?: SkillOutputFormat;          // 期望输出格式
    outputSchema?: string;                     // JSON Schema（outputFormat='json' 时使用）

    // ===== 可选：触发条件 =====
    triggers?: SkillTrigger[];                 // 自动触发条件

    // ===== 可选：变量定义 =====
    variables?: SkillVariable[];               // 可配置的变量

    // ===== 元数据 =====
    builtIn: boolean;                          // 是否为内置技能（内置技能不可编辑/删除）
    version: string;                           // 版本号
    author?: string;                           // 作者
    createdAt: Date;
    updatedAt: Date;

    // ===== v3.0.14: 附带文件 =====
    files?: SkillFile[];                       // 技能附带的文件列表（rules/、scripts/ 等）

    // ===== v3.0.22: 来源信息（用于后续升级） =====
    source?: SkillSource;                      // 技能来源信息
}

/**
 * 技能来源信息 (v3.0.22)
 * 记录技能的安装来源，便于后续升级
 */
export interface SkillSource {
    type: 'url' | 'skills.sh' | 'local';       // 来源类型
    repoUrl?: string;                          // GitHub 仓库 URL (如 https://github.com/expo/skills)
    repoOwner?: string;                        // 仓库所有者 (如 expo)
    repoName?: string;                         // 仓库名称 (如 skills)
    skillPath?: string;                        // 技能在仓库中的路径 (如 plugins/upgrading-expo/skills/upgrading-expo)
    branch?: string;                           // 分支名 (如 main)
    installCommand?: string;                   // 安装命令 (如 npx skills add https://github.com/expo/skills --skill upgrading-expo)
    installedAt?: Date;                        // 安装时间
    installedVersion?: string;                 // 安装时的版本（如果有）
}

/**
 * 技能创建输入
 */
export interface SkillCreateInput {
    name: string;
    description: string;
    category: SkillCategory;
    icon?: string;
    color?: SkillColor;
    promptTemplate: string;
    outputFormat?: SkillOutputFormat;
    outputSchema?: string;
    triggers?: SkillTrigger[];
    variables?: SkillVariable[];
    /** v3.0.14: 技能附带的文件列表（rules/、scripts/ 等） */
    files?: SkillFile[];
    /** v3.0.22: 技能来源信息（用于后续升级） */
    source?: SkillSource;
}

/**
 * 技能文件 (v3.0.14)
 * 用于存储技能目录下的所有文件（rules/*.md、scripts/*.sh 等）
 */
export interface SkillFile {
    /** 相对路径（如 rules/3d.md） */
    path: string;
    /** 文件名（如 3d.md） */
    name: string;
    /** 文件内容 */
    content: string;
    /** 文件类型（根据扩展名判断） */
    type: 'markdown' | 'json' | 'text' | 'other';
}

// ==================== Skill Install Types (v3.0.0) ====================

/**
 * 技能仓库索引 (v3.0.0)
 * 用于描述一个远程技能仓库的元信息和可用技能列表
 */
export interface SkillRegistry {
    /** 仓库名称 */
    name: string;
    /** 仓库描述 */
    description?: string;
    /** 索引格式版本 */
    version: string;
    /** 仓库主页 */
    homepage?: string;
    /** 仓库作者 */
    author?: string;
    /** 可用技能列表 */
    skills: SkillRegistryItem[];
}

/**
 * 仓库中的单个技能条目 (v3.0.0)
 */
export interface SkillRegistryItem {
    /** 技能唯一标识（在仓库内唯一） */
    id: string;
    /** 技能名称 */
    name: string;
    /** 技能描述 */
    description: string;
    /** 技能版本 */
    version: string;
    /** 分类标签 */
    tags: string[];
    /** 作者（可覆盖仓库作者） */
    author?: string;
    /** 技能定义（内联方式） */
    skill?: SkillCreateInput;
    /** 技能定义URL（外链方式，与 skill 二选一） */
    url?: string;
}

/**
 * 技能包格式 (v3.0.0)
 * 用于导入/导出和单个技能URL安装
 */
export interface SkillPackage {
    /** 包格式版本 */
    version: string;
    /** 技能列表 */
    skills: SkillCreateInput[];
    /** 元信息 */
    meta?: SkillPackageMeta;
}

/**
 * 技能包元信息 (v3.0.0)
 */
export interface SkillPackageMeta {
    /** 作者 */
    author?: string;
    /** 来源URL */
    source?: string;
    /** 导出时间 (ISO 8601 格式) */
    exportedAt?: string;
    /** 导出工具版本 */
    exportedBy?: string;
}

/**
 * 安装来源类型 (v3.0.0)
 */
export type InstallSourceType = 'url' | 'file' | 'official';

/**
 * 官方仓库配置 (v3.0.0)
 *
 * v3.0.1: 添加 isDemo 字段支持演示模式
 */
export interface OfficialRepository {
    id: string;
    name: string;
    description: string;
    url: string;
    icon: string;
    /** 是否为演示仓库（使用内置数据） */
    isDemo?: boolean;
}

/**
 * 重复技能检测结果 (v3.0.0)
 */
export interface DuplicateSkillResult {
    newSkill: SkillCreateInput;
    existingSkill: Skill;
    matchType: 'id' | 'name';
}

/**
 * 技能包验证结果 (v3.0.0)
 */
export interface SkillPackageValidation {
    valid: boolean;
    errors: string[];
    package?: SkillPackage;
}

/**
 * 技能安装选项 (v3.0.0)
 */
export interface SkillInstallOptions {
    /** 遇到重复技能时的处理方式 */
    onDuplicate?: 'skip' | 'overwrite' | 'rename';
    /** 来源信息（用于记录） */
    source?: string;
}

/**
 * 技能命令解析结果 (v3.0.2)
 *
 * 支持解析 npx skills add 等命令格式
 */
export interface SkillCommandParseResult {
    /** 解析出的 URL */
    url: string;
    /** 指定的技能 ID 列表（可选） */
    skillIds?: string[];
    /** 原始输入 */
    rawInput: string;
    /** 是否为命令格式 */
    isCommand: boolean;
}

/**
 * SKILL.md 文件解析结果 (v3.0.3)
 *
 * 用于解析使用 YAML frontmatter 格式的 SKILL.md 文件
 */
export interface SkillMdParseResult {
    /** 技能名称（从 frontmatter 解析） */
    name: string;
    /** 技能描述（从 frontmatter 解析） */
    description: string;
    /** 提示词内容（Markdown 正文） */
    promptTemplate: string;
    /** 原始 frontmatter 数据 */
    frontmatter: Record<string, unknown>;
}

/**
 * GitHub Contents API 返回的目录条目 (v3.0.3)
 */
export interface GitHubContentItem {
    /** 文件/目录名 */
    name: string;
    /** 相对路径 */
    path: string;
    /** 类型：文件或目录 */
    type: 'file' | 'dir';
    /** 文件下载 URL（目录为 null） */
    download_url: string | null;
}

// ==================== skills.sh Types (v3.0.5) ====================

/**
 * skills.sh API 返回的技能项 (v3.0.5, v3.0.23 更新字段名)
 */
export interface SkillsShItem {
    /** 技能唯一标识符（完整路径，如 vercel-labs/skills/find-skills） */
    id: string;
    /** 技能 ID（短名称，如 find-skills） */
    skillId: string;
    /** 技能名称 */
    name: string;
    /** 安装次数 */
    installs: number;
    /** 来源仓库（格式：owner/repo）v3.0.23: skills.sh API 将 topSource 改为 source */
    source: string;
}

/**
 * skills.sh API 响应 (v3.0.5)
 */
export interface SkillsShResponse {
    /** 技能列表 */
    skills: SkillsShItem[];
    /** 是否有更多数据 */
    hasMore: boolean;
}

/**
 * skills.sh 获取参数 (v3.0.5)
 */
export interface SkillsShFetchParams {
    /** 每页数量（默认20） */
    limit?: number;
    /** 偏移量（默认0） */
    offset?: number;
    /** 搜索关键词 */
    search?: string;
}

// ==================== MCP Types (v2.0.0 - 真实 MCP 协议支持) ====================

/**
 * MCP 传输类型
 * - stdio: 本地子进程通信 (stdin/stdout)
 * - http: Streamable HTTP 远程连接
 */
export type MCPTransportType = 'stdio' | 'http';

/**
 * MCP 服务器连接状态
 */
export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MCP 工具定义 (来自服务器 tools/list)
 */
export interface MCPTool {
    name: string;                    // 工具名称
    description?: string;            // 工具描述
    inputSchema: {                   // JSON Schema 输入定义
        type: 'object';
        properties?: Record<string, MCPJSONSchema>;
        required?: string[];
    };
}

/**
 * MCP JSON Schema 定义 (简化版)
 */
export interface MCPJSONSchema {
    type: string;
    description?: string;
    enum?: string[];
    items?: MCPJSONSchema;
    properties?: Record<string, MCPJSONSchema>;
    required?: string[];
}

/**
 * MCP 资源定义 (来自服务器 resources/list)
 */
export interface MCPResource {
    uri: string;                     // 资源 URI
    name: string;                    // 资源名称
    description?: string;            // 资源描述
    mimeType?: string;               // MIME 类型
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolResult {
    content: MCPToolContent[];       // 结果内容列表
    isError?: boolean;               // 是否为错误
}

/**
 * MCP 工具内容类型
 */
export interface MCPToolContent {
    type: 'text' | 'image' | 'resource';
    text?: string;                   // type='text' 时的文本内容
    data?: string;                   // type='image' 时的 base64 数据
    mimeType?: string;               // MIME 类型
    uri?: string;                    // type='resource' 时的资源 URI
}

/**
 * MCP 服务器能力 (来自 initialize 响应)
 */
export interface MCPCapabilities {
    tools?: Record<string, unknown>;      // 支持工具
    resources?: Record<string, unknown>;  // 支持资源
    prompts?: Record<string, unknown>;    // 支持提示模板
    logging?: Record<string, unknown>;    // 支持日志
}

/**
 * MCP 服务器信息 (来自 initialize 响应)
 */
export interface MCPServerInfo {
    name: string;                    // 服务器名称
    version: string;                 // 服务器版本
}

/**
 * MCP 服务器配置 (v2.2.0)
 *
 * v2.2.0: 添加 enabled/autoStart 字段
 */
export interface MCPServer {
    id: string;
    name: string;
    description: string;

    // ===== 启用与自启动配置 (v2.2.0) =====
    enabled: boolean;                    // 是否启用（false = 完全禁用，不参与任何操作）
    autoStart: boolean;                  // 是否自动启动（应用启动时自动连接）

    // ===== 传输配置 (v2.0.0) =====
    transportType: MCPTransportType;

    // stdio 传输配置
    command?: string;                // 启动命令 (如 "npx", "node")
    args?: string[];                 // 命令参数 (如 ["-y", "@modelcontextprotocol/server-filesystem"])
    env?: Record<string, string>;    // 环境变量

    // HTTP 传输配置 (兼容 v1.x endpoint 字段)
    endpoint?: string;               // HTTP 端点 URL

    // ===== 认证配置 =====
    authType: 'none' | 'apikey' | 'token';
    authValue?: string;

    // ===== 连接状态 =====
    status: MCPServerStatus;
    errorMessage?: string;           // 错误信息 (v1.1.0)

    // ===== 服务器能力 (连接后获取, v2.0.0) =====
    serverInfo?: MCPServerInfo;      // 服务器信息
    capabilities?: MCPCapabilities;  // 服务器能力
    tools?: MCPTool[];               // 已发现的工具列表
    resources?: MCPResource[];       // 已发现的资源列表

    // ===== 统计信息 =====
    lastActiveAt?: Date;
    requestCount: number;

    // ===== 元数据 =====
    createdAt: Date;
    updatedAt: Date;
}

/**
 * MCP 服务器创建输入 (v2.2.0)
 *
 * v2.2.0: 添加 enabled/autoStart 字段
 */
export interface MCPServerCreateInput {
    name: string;
    description: string;
    transportType: MCPTransportType;

    // 启用与自启动配置 (v2.2.0)
    enabled?: boolean;                   // 默认 true
    autoStart?: boolean;                 // 默认 false

    // stdio 配置
    command?: string;
    args?: string[];
    env?: Record<string, string>;

    // HTTP 配置
    endpoint?: string;

    // 认证配置
    authType: 'none' | 'apikey' | 'token';
    authValue?: string;
}

/**
 * MCP 连接结果 (来自 mcp_connect 命令)
 */
export interface MCPConnectionResult {
    success: boolean;
    serverInfo?: MCPServerInfo;
    capabilities?: MCPCapabilities;
    protocolVersion?: string;
    error?: string;
}

/**
 * MCP 统计信息
 */
export interface MCPStats {
    connected: number;
    disconnected: number;
    error: number;
    totalRequests: number;
}

// ==================== Stats Types ====================
export interface UsageStats {
    messages: number;
    tokens: number;
    cost: number;
}

export interface ModelUsage {
    model: string;
    usage: number;
    color: string;
}

export interface ActivityItem {
    id: string;
    action: string;
    details: string;
    time: Date;
    type: 'chat' | 'agent' | 'skill' | 'mcp';
}

export type TimeRange = 'today' | 'week' | 'month';

// ==================== Settings Types ====================
export interface AppNotification {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    createdAt: Date;
    read: boolean;
    // v2.5.3: 可展开的详情信息
    details?: string;
    statusCode?: number;
}

/**
 * 导出配置接口 (v2.6.5)
 * 定义可导出的数据类型选项
 * v2.6.5: 新增 roundtableChats 和 settings 导出支持
 */
export interface ExportConfig {
    models: boolean;           // v2.6.1: AI 模型配置导出
    agents: boolean;
    skills: boolean;
    mcp: boolean;
    chats: boolean;
    roundtableChats: boolean;  // v2.6.5: 圆桌对话导出
    settings: boolean;         // v2.6.5: 应用设置导出
}

export interface ImportOptions {
    merge: boolean;
    backup: boolean;
}

// ==================== Model Types ====================
export interface AIModel {
    id: string;
    name: string;
    provider: string;
    // v2.5.3: 添加 'error' 状态用于显示测试失败
    status: 'online' | 'offline' | 'error';
    apiKeySet: boolean;
    endpoint: string;
    maxTokens: number;
    pricing: {
        input: number;
        output: number;
    };
    // v4.2.5: 多模态支持标识
    supportsMultimodal?: boolean;
}

export interface AIModelConfig extends AIModel {
    modelId?: string;       // Model ID/接入点 ID (自定义提供商用，与显示名称分离)
    apiKey?: string;        // 敏感数据，前端仅显示掩码
    baseUrl?: string;       // 自定义端点
    temperature?: number;   // 默认温度
    contextWindow?: number; // 上下文窗口
    accountId?: string;     // v3.3.5: ChatGPT 账户 ID（用于 Codex API）
    projectId?: string;     // v3.4.3: GCP 项目 ID（用于 Google Cloud Code API）
    useProviderCredential?: boolean;  // v3.5.0: 是否使用已连接提供商的凭证（区分独立 API Key）
    protocol?: ProtocolType;  // v0.9.0: 通信协议类型（覆盖提供商默认协议）
    createdAt: Date;
    updatedAt: Date;
}

/**
 * v3.6.1: 模型配额信息（Google Cloud Code 专用）
 */
export interface ModelQuotaInfo {
    /** 剩余配额比例 (0.0 - 1.0) */
    remainingFraction: number;
    /** 配额重置时间 (ISO 8601) */
    resetTime?: string;
    /** 配额是否已耗尽 */
    isExhausted: boolean;
}

/**
 * v3.6.1: 扩展的模型信息（支持配额）
 */
export interface ProviderModelInfo {
    /** 模型 ID */
    id: string;
    /** 显示名称 */
    name: string;
    /** 最大输出 tokens */
    maxTokens: number;
    /** v3.6.1: 配额信息（Google 提供商专用） */
    quota?: ModelQuotaInfo;
}

export interface ModelProvider {
    id: string;
    name: string;
    icon: string;
    defaultEndpoint: string;
    models: ProviderModelInfo[];
    /** v3.2.0: 是否已连接（用于显示已连接标识和自动填充凭证） */
    connected?: boolean;
    /** v3.6.1: 是否支持动态模型列表（如 Google Cloud Code） */
    supportsDynamicModels?: boolean;
    /** v3.6.1: 动态模型加载状态 */
    modelsLoading?: boolean;
    /** v3.6.1: 动态模型加载错误信息 */
    modelsError?: string;
    /** v0.9.4: 默认通信协议类型 */
    protocol?: ProtocolType;
}

export interface ModelCreateInput {
    name: string;
    modelId?: string;       // Model ID/接入点 ID (自定义提供商用)
    provider: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    accountId?: string;     // v3.3.5: ChatGPT 账户 ID（用于 Codex API）
    projectId?: string;     // v3.4.3: GCP 项目 ID（用于 Google Cloud Code API）
    useProviderCredential?: boolean;  // v3.5.0: 是否使用已连接提供商的凭证
    protocol?: ProtocolType;  // v0.9.0: 通信协议类型
}

// ==================== Provider Types (v3.1.0) ====================

/**
 * 协议类型 (v0.9.0)
 * 定义支持的 AI 服务通信协议
 * - openai: OpenAI Chat Completions API（默认，适用于大多数兼容服务）
 * - anthropic: Anthropic Messages API
 * - google: Google Gemini / Cloud Code API
 * - aws: AWS Bedrock / Amazon Q API
 */
export type ProtocolType = 'openai' | 'anthropic' | 'google' | 'aws';

/**
 * Provider 认证类型
 * - api: API Key 认证
 * - oauth: OAuth 认证（如 GitHub Copilot）
 * - env: 环境变量认证
 * - none: 无需认证（本地服务如 Ollama）
 */
export type ProviderAuthType = 'api' | 'oauth' | 'env' | 'none';

/**
 * Provider 连接状态
 */
export type ProviderStatus = 'connected' | 'disconnected' | 'error';

/**
 * Provider 认证来源
 */
export type ProviderSource = 'api' | 'env' | 'config' | 'oauth';

/**
 * Provider 分类
 */
export type ProviderCategory = 'popular' | 'cloud' | 'local' | 'other';

/**
 * Provider 认证方法定义
 */
export interface ProviderAuthMethod {
    /** 认证类型 */
    type: ProviderAuthType;
    /** 显示标签，如 "API Key", "OAuth 登录" */
    label: string;
    /** 方法描述 */
    description?: string;
}

/**
 * Provider 模型定义
 */
export interface ProviderModel {
    /** 模型 ID */
    id: string;
    /** 显示名称 */
    name: string;
    /** 最大输出 tokens */
    maxTokens: number;
    /** 上下文窗口大小 */
    contextWindow?: number;
    /** 定价信息 ($/1M tokens) */
    pricing?: {
        input: number;
        output: number;
    };
    /** 模型能力 */
    capabilities?: {
        /** 支持图像输入 */
        vision?: boolean;
        /** 支持函数调用 */
        functionCalling?: boolean;
        /** 支持流式输出 */
        streaming?: boolean;
    };
}

/**
 * AI Provider 定义 (v3.1.0, v3.4.8: 添加 requiresEndpoint, v3.4.10: 添加 website)
 * 描述一个 AI 服务提供商的完整信息
 */
export interface AIProvider {
    /** 提供商 ID (如 'openai', 'anthropic') */
    id: string;
    /** 显示名称 */
    name: string;
    /** 图标 (emoji 或 lucide 图标名) */
    icon: string;
    /** 提供商描述（支持多语言） */
    description?: string | { zh: string; en: string };
    /** 简短说明（如 "需要 Copilot 订阅"） */
    note?: { zh: string; en: string };
    /** 官网地址（用于获取 API Key 链接） (v3.4.10) */
    website?: string;
    /** 默认 API 端点 */
    defaultEndpoint: string;
    /** 自定义 API 端点（用户配置的，覆盖 defaultEndpoint） (v3.4.8) */
    customEndpoint?: string;
    /** 是否需要用户输入自定义端点（如 Custom 提供商） (v3.4.8) */
    requiresEndpoint?: boolean;
    /** 支持的环境变量名称列表 */
    envKeys?: string[];
    /** 支持的认证方式列表 */
    authMethods: ProviderAuthMethod[];
    /** 可用模型列表 */
    models: ProviderModel[];
    /** 连接状态 */
    status: ProviderStatus;
    /** 认证来源 */
    source?: ProviderSource;
    /** 是否为热门提供商 */
    popular?: boolean;
    /** 分类 */
    category?: ProviderCategory;
    /** 错误信息（status='error' 时） */
    errorMessage?: string;
    /** 通信协议类型 (v0.9.0, 自定义提供商可选择) */
    protocol?: ProtocolType;
    /** 是否为自定义提供商 (v0.9.3) */
    isCustom?: boolean;
}

/**
 * 自定义提供商配置 (v0.9.3, v0.9.4: 添加 protocol, v4.2.7: 移除 models)
 * 用户添加的自定义 AI 服务提供商
 *
 * v4.2.7 重要变更：
 * - 移除 models 字段，模型配置统一在 Models 页面管理
 * - 保留 protocol 字段作为默认协议，用于配置导出
 */
export interface CustomProvider {
    /** 唯一 ID（格式：custom-{timestamp}） */
    id: string;
    /** 显示名称 */
    name: string;
    /** 图标（emoji 或 URL） */
    icon: string;
    /** 描述 */
    description?: { zh: string; en: string };
    /** API 端点 */
    endpoint: string;
    /** 认证方式（目前只支持 API Key） */
    authMethods: ProviderAuthMethod[];
    /** 默认通信协议类型 (v0.9.4) */
    protocol?: ProtocolType;
    /** 创建时间 */
    createdAt: Date;
    /** 更新时间 */
    updatedAt: Date;
}

/**
 * Provider 凭证存储 (v3.1.0, v3.3.5: 添加 accountId, v0.7.3: 添加 profileArn)
 * 存储提供商的认证凭证
 */
export interface ProviderCredential {
    /** 提供商 ID */
    providerId: string;
    /** 认证类型 */
    type: ProviderAuthType;
    /** API Key（API 认证时使用） */
    apiKey?: string;
    /** 访问令牌（OAuth 认证时使用） */
    accessToken?: string;
    /** 刷新令牌（OAuth 认证时使用） */
    refreshToken?: string;
    /** 令牌过期时间戳（毫秒） */
    expiresAt?: number;
    /** ChatGPT 账户 ID（OpenAI OAuth 时使用，用于 Codex API） (v3.3.5) */
    accountId?: string;
    /** GCP 项目 ID（Google OAuth 时使用，用于 Cloud Code API） (v3.4.3) */
    projectId?: string;
    /** Kiro Profile ARN（Kiro OAuth 时使用，用于获取模型列表和配额） (v0.7.3) */
    profileArn?: string;
    /** Kiro 认证方式 ("idc" | "aws")，用于选择正确的 User-Agent (v0.9.0) */
    authMethod?: 'idc' | 'aws';
    /** v0.9.1: Kiro 客户端 ID（AWS SSO OIDC 注册后获取，用于 token 刷新） */
    kiroClientId?: string;
    /** v0.9.1: Kiro 客户端密钥（AWS SSO OIDC 注册后获取，用于 token 刷新） */
    kiroClientSecret?: string;
    /** v0.9.1: Kiro SSO 区域（用于 token 刷新时构建正确的 endpoint） */
    kiroSsoRegion?: string;
    /** v0.9.1: Kiro IDC Start URL（IDC 认证时使用） */
    kiroStartUrl?: string;
    /** 创建时间 */
    createdAt: Date;
    /** 更新时间 */
    updatedAt: Date;
}

/**
 * OAuth 认证结果
 * 用于 Provider 连接时传递 OAuth 认证信息
 */
export interface OAuthResult {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    accountId?: string;
    projectId?: string;
    profileArn?: string;
    authMethod?: 'idc' | 'aws';
    kiroClientId?: string;
    kiroClientSecret?: string;
    kiroSsoRegion?: string;
    kiroStartUrl?: string;
}

/**
 * Chat 事件 Payload
 * 用于 Tauri 后端发送的流式聊天事件
 */
export interface ChatEventPayload {
    /** 消息 ID */
    id: string;
    /** 事件类型 */
    event: 'chunk' | 'reasoning_chunk' | 'done' | 'error' | 'tool_calls';
    /** 内容块（chunk 事件） */
    content?: string;
    /** 错误信息（error 事件） */
    error?: string;
    /** Token 使用情况（done 事件） */
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    /** 工具调用（tool_calls 事件） */
    tool_calls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
        thought_signature?: string;
    }>;
}

/**
 * OAuth 授权结果 (v3.1.0)
 * OAuth 认证流程的中间状态
 */
export interface OAuthAuthorization {
    /** 授权 URL */
    url: string;
    /** 回调方式: auto=自动回调, code=手动输入授权码 */
    method: 'auto' | 'code';
    /** 用户指引文本 */
    instructions?: string;
    /** Device Flow 的设备码 */
    deviceCode?: string;
    /** Device Flow 的用户码（显示给用户） */
    userCode?: string;
    /** 过期时间（秒） */
    expiresIn?: number;
    /** 轮询间隔（秒） */
    interval?: number;
}

/**
 * Provider 连接输入 (v3.1.0)
 */
export interface ProviderConnectInput {
    /** 提供商 ID */
    providerId: string;
    /** 认证方法索引 */
    authMethod: number;
    /** API Key（API 认证时使用） */
    apiKey?: string;
    /** OAuth 授权码 */
    code?: string;
}

// ==================== Agent Orchestration Types (v4.0.0) ====================

/**
 * 编排模式枚举
 * 定义多 Agent 协作的不同模式
 */
export type OrchestrationMode = 'single' | 'compare' | 'roundtable' | 'review' | 'pipeline' | 'debate';

/**
 * 圆桌会议状态
 */
export type RoundtableStatus = 'setup' | 'discussing' | 'summarizing' | 'completed';

/**
 * 圆桌发言模式
 * - sequential: 按顺序轮流发言
 * - free: 用户 @指定 Agent 发言
 *
 * v4.1.10: 移除 parallel 模式，因为流式响应无法正确区分来源
 */
export type RoundtableSpeakMode = 'sequential' | 'free';

/**
 * 圆桌参与者
 * 描述参与圆桌会议的单个 Agent 配置
 */
export interface RoundtableParticipant {
    /** 参与者唯一标识 */
    id: string;
    /** 关联的 Agent ID */
    agentId: string;
    /** 角色描述（如"架构师"、"产品经理"） */
    role: string;
    /** 发言顺序（1-based，用于顺序发言模式） */
    speakOrder: number;
    /** 头像（emoji 或图片 URL） */
    avatar?: string;
    /** 主题色（用于 UI 区分，如 'blue', 'green'） */
    color?: string;
    /** 已发言次数 */
    messageCount: number;
    /** 最后发言时间 */
    lastSpokeAt?: Date;
}

/**
 * 圆桌会议规则
 * 定义圆桌会议的行为规则
 */
export interface RoundtableRules {
    /** 最大讨论轮数（1-10） */
    maxRounds: number;
    /** 发言模式 */
    speakMode: RoundtableSpeakMode;
    /** 讨论结束后是否自动生成总结 */
    autoSummarize: boolean;
    /** 是否允许 Agent 互相引用观点（影响上下文构建） */
    allowCrossReference: boolean;
    /** 总结者 Agent ID（可选，不设置则使用第一个参与者） */
    summarizerAgentId?: string;
    /** 单次发言时间限制（秒，可选） */
    turnTimeLimit?: number;
    /** 是否要求所有参与者必须发言（可选） */
    requireResponse?: boolean;
}

/**
 * 圆桌会议配置
 * 圆桌会议模式的完整配置
 */
export interface RoundtableConfig {
    /** 讨论主题 */
    topic: string;
    /** v4.1.13: 内容背景/上下文（可选），帮助 Agent 理解讨论的前提和语境 */
    background?: string;
    /** v4.1.13: 讨论约束/边界（可选），限定讨论范围，避免 Agent 跑题 */
    constraints?: string;
    /** 参与者列表（2-6 个） */
    participants: RoundtableParticipant[];
    /** 讨论规则 */
    rules: RoundtableRules;
    /** 当前轮次（从 1 开始） */
    currentRound: number;
    /** 讨论状态 */
    status: RoundtableStatus;
}

/**
 * 引用内容
 * 用于记录消息中引用的其他 Agent 观点
 */
export interface QuotedContent {
    /** 被引用的消息 ID */
    messageId: string;
    /** 被引用的参与者 ID */
    participantId: string;
    /** 引用片段 */
    excerpt: string;
}

/**
 * 圆桌消息（扩展 Message）
 * 圆桌会议模式下的消息，包含额外的元数据
 */
export interface RoundtableMessage extends Message {
    /** 发言参与者 ID */
    participantId: string;
    /** 所属轮次 */
    round: number;
    /** 回复的消息 ID（可选） */
    replyToMessageId?: string;
    /** @提及的参与者 ID 列表 */
    mentionedParticipantIds?: string[];
    /** 引用的内容列表（用于 UI 高亮） */
    quotedContent?: QuotedContent[];
    /** v4.1.5: 是否为总结消息 */
    isSummary?: boolean;
}

/**
 * 圆桌对话（扩展 Chat）
 * 圆桌会议模式的对话数据结构
 */
export interface RoundtableChat extends Chat {
    /** 编排模式，固定为 'roundtable' */
    mode: 'roundtable';
    /** 圆桌配置 */
    roundtableConfig: RoundtableConfig;
    /** 消息列表（类型为 RoundtableMessage） */
    messages: RoundtableMessage[];
}

/**
 * 编排对话（通用）
 * 支持所有编排模式的对话类型
 */
export interface OrchestrationChat extends Chat {
    /** 编排模式 */
    mode: OrchestrationMode;
    /** 圆桌会议配置（mode='roundtable' 时使用） */
    roundtableConfig?: RoundtableConfig;
    // NOTE: 以下配置类型计划在后续版本实现
    // v1.4.0: compareConfig?: CompareConfig;    // 对比模式配置
    // v1.5.0: reviewConfig?: ReviewConfig;      // 审核模式配置
    // v1.6.0: pipelineConfig?: PipelineConfig;  // 工作流模式配置
    // v1.7.0: debateConfig?: DebateConfig;      // 辩论模式配置
}

/**
 * 编排消息元数据
 * 记录消息在编排上下文中的额外信息
 */
export interface OrchestrationMessageMeta {
    /** 编排模式 */
    mode: OrchestrationMode;
    /** 轮次（圆桌/辩论模式） */
    round?: number;
    /** 阶段名称（工作流模式） */
    stage?: string;
    /** 立场（辩论模式） */
    side?: 'pro' | 'con' | 'judge';
    /** 是否为修订版本（审核模式） */
    isRevision?: boolean;
    /** 修订版本号（审核模式） */
    revisionNumber?: number;
}

/**
 * 编排消息（扩展 Message）
 * 通用的编排消息类型
 */
export interface OrchestrationMessage extends Message {
    /** 来源 Agent ID */
    sourceAgentId?: string;
    /** 来源模型 ID（对比模式） */
    sourceModelId?: string;
    /** 回复的消息 ID */
    replyToMessageId?: string;
    /** @提及的 Agent ID 列表 */
    mentionedAgentIds?: string[];
    /** 编排元数据 */
    orchestrationMeta?: OrchestrationMessageMeta;
}

/**
 * 圆桌会议创建输入
 * 创建圆桌会议时的输入参数
 */
export interface RoundtableCreateInput {
    /** 讨论主题 */
    topic: string;
    /** v4.1.13: 内容背景/上下文（可选），帮助 Agent 理解讨论的前提和语境 */
    background?: string;
    /** v4.1.13: 讨论约束/边界（可选），限定讨论范围，避免 Agent 跑题 */
    constraints?: string;
    /** 参与者配置列表 */
    participants: Array<{
        agentId: string;
        role: string;
        avatar?: string;
        color?: string;
    }>;
    /** 讨论规则 */
    rules: Partial<RoundtableRules>;
}

/**
 * 圆桌会议错误码
 */
export const RoundtableErrorCodes = {
    /** 参与者数量不足（至少需要 2 个） */
    INSUFFICIENT_PARTICIPANTS: 'RT-001',
    /** 参与者数量超限（最多 6 个） */
    TOO_MANY_PARTICIPANTS: 'RT-002',
    /** 未设置讨论主题 */
    MISSING_TOPIC: 'RT-003',
    /** Agent 不存在或已被删除 */
    AGENT_NOT_FOUND: 'RT-004',
    /** 总结者 Agent 未配置 */
    SUMMARIZER_NOT_CONFIGURED: 'RT-005',
    /** 已达到最大讨论轮数 */
    MAX_ROUNDS_REACHED: 'RT-006',
    /** @提及的参与者不存在 */
    MENTIONED_PARTICIPANT_NOT_FOUND: 'RT-007',
} as const;

// ==================== Agent Template Types (v1.0.0) ====================

/**
 * Agent 模板包 (v1.0.0)
 * 一键安装 Agent 配置的完整包，包含 MCP 服务器、技能和 Agent 配置
 *
 * 类似 skills.sh 的体验，用户可以从模板市场选择预设模板，
 * 一键安装所有依赖组件
 */
export interface AgentTemplatePackage {
    // ===== 元信息 =====
    /** 唯一标识符，如 "developer-template" */
    id: string;
    /** 显示名称，如 "开发者模板" */
    name: string;
    /** 版本号，如 "1.0.0" */
    version: string;
    /** 模板描述 */
    description: string;
    /** 作者 */
    author?: string;
    /** 标签，用于搜索 */
    tags?: string[];
    /** 图标 URL 或 emoji */
    icon?: string;

    // ===== 组件定义 =====
    /** 模板包含的组件 */
    components: {
        /** MCP 服务器配置列表 */
        mcpServers?: MCPServerTemplate[];
        /** 技能配置列表 */
        skills?: SkillTemplate[];
        /** Agent 配置列表（含系统提示词） */
        agents?: AgentTemplate[];
    };
}

/**
 * MCP 服务器模板 (v1.0.0)
 * 模板中的 MCP 服务器配置
 */
export interface MCPServerTemplate {
    /** 服务器 ID */
    id: string;
    /** 显示名称 */
    name: string;
    /** 启动命令 */
    command: string;
    /** 命令参数 */
    args?: string[];
    /** 环境变量（敏感值用占位符如 ${GITHUB_TOKEN}） */
    env?: Record<string, string>;
    /** 描述 */
    description?: string;
}

/**
 * 技能模板 (v1.0.0)
 * 支持两种方式：从 URL 安装或内联定义
 */
export interface SkillTemplate {
    /** 从 URL 安装（如 skills.sh） */
    url?: string;
    /** 内联定义 */
    inline?: {
        id: string;
        name: string;
        content: string;
        description?: string;
    };
}

/**
 * Agent 模板 (v1.0.0)
 * 模板中的 Agent 配置，系统提示词嵌入其中
 */
export interface AgentTemplate {
    /** Agent ID */
    id: string;
    /** 显示名称 */
    name: string;
    /** 描述 */
    description?: string;
    /** 系统提示词（嵌入在 Agent 中） */
    systemPrompt: string;
    /** 推荐模型 */
    model?: string;
    /** 关联的 MCP 服务器 ID 列表 */
    mcpServerIds?: string[];
    /** 关联的技能 ID 列表 */
    skillIds?: string[];
    /** 温度参数 */
    temperature?: number;
    /** 最大 tokens */
    maxTokens?: number;
}

/**
 * 模板安装选项 (v1.0.0)
 */
export interface TemplateInstallOptions {
    /** 变量值映射，如 { GITHUB_TOKEN: "xxx", WORKSPACE_PATH: "/path" } */
    variables?: Record<string, string>;
    /** 是否跳过已存在的组件 */
    skipExisting?: boolean;
    /** 仅预览不实际安装 */
    dryRun?: boolean;
}

/**
 * 模板安装结果 (v1.0.0)
 */
export interface TemplateInstallResult {
    /** 是否成功 */
    success: boolean;
    /** 已安装的组件 */
    installed: {
        mcpServers: string[];
        skills: string[];
        agents: string[];
    };
    /** 跳过的组件（已存在） */
    skipped: {
        mcpServers: string[];
        skills: string[];
        agents: string[];
    };
    /** 安装错误 */
    errors: Array<{
        component: 'mcpServer' | 'skill' | 'agent';
        id: string;
        error: string;
    }>;
}

/**
 * 模板变量定义 (v1.0.0)
 * 用于描述模板中需要用户填写的变量
 */
export interface TemplateVariable {
    /** 变量名，如 "GITHUB_TOKEN" */
    name: string;
    /** 显示标签，如 "GitHub Token" */
    label: string;
    /** 变量描述 */
    description?: string;
    /** 是否必填 */
    required: boolean;
    /** 默认值 */
    defaultValue?: string;
    /** 变量类型 */
    type: 'string' | 'path' | 'secret';
}

/**
 * 模板解析错误 (v1.0.0)
 */
export class TemplateParseError extends Error {
    constructor(message: string, public details?: string[]) {
        super(message);
        this.name = 'TemplateParseError';
    }
}

/**
 * 已安装模板记录 (v1.0.0)
 * 用于记录已安装的模板信息，便于管理和升级
 */
export interface InstalledTemplateRecord {
    /** 模板 ID */
    templateId: string;
    /** 模板名称 */
    templateName: string;
    /** 安装的版本 */
    version: string;
    /** 安装时间 */
    installedAt: Date;
    /** 安装的组件 ID 列表 */
    installedComponents: {
        mcpServerIds: string[];
        skillIds: string[];
        agentIds: string[];
    };
}
