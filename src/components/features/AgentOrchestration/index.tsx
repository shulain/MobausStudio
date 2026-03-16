/**
 * Agent 编排模块入口
 *
 * 提供多 Agent 协作交互能力，支持多种编排模式：
 * - 圆桌会议 (Roundtable) - 多个 Agent 角色轮流发言，互相引用讨论
 * - 并排对比 (Compare) - 同一问题发送给多个模型/Agent，并排显示回答 [待实现]
 * - 审核纠错 (Review) - 一个 Agent 生成，另一个 Agent 审核纠错 [待实现]
 * - 工作流编排 (Pipeline) - 多个 Agent 串行处理 [待实现]
 * - 辩论模式 (Debate) - 正反方 Agent 围绕议题进行多轮辩论 [待实现]
 *
 * @module components/features/AgentOrchestration
 * @version 4.0.0
 */

// 导出圆桌会议组件
export { RoundtableView } from './RoundtableView';
export { RoundtableSetupModal } from './RoundtableSetupModal';
export { RoundtableMessageBubble } from './RoundtableMessageBubble';

// 导出模式选择器
export { OrchestrationModeSelector } from './OrchestrationModeSelector';

// 导出工具函数
export {
    createRoundtableChat,
    buildRoundtableContext,
    parseMentions,
    validateRoundtableConfig,
} from './utils';

// 导出类型（从 types/index.ts 重新导出）
export type {
    OrchestrationMode,
    RoundtableStatus,
    RoundtableSpeakMode,
    RoundtableParticipant,
    RoundtableRules,
    RoundtableConfig,
    RoundtableMessage,
    RoundtableChat,
    RoundtableCreateInput,
    OrchestrationChat,
    OrchestrationMessage,
    OrchestrationMessageMeta,
} from '../../../types';
