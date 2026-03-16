/**
 * Agent 状态管理纯函数
 *
 * 职责：
 * - Agent CRUD 状态更新
 * - Agent 状态切换（active/inactive）
 * - Agent 查找
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/agents/agentState
 * @version 1.0.0
 */

import type { Agent, AgentCreateInput } from '../../types';

// ==================== 纯函数 ====================

/**
 * 创建 Agent
 *
 * @param agents - Agent 列表
 * @param data - 创建输入
 * @param id - Agent ID（外部生成）
 * @returns 更新后的 Agent 列表
 *
 * @example
 * ```ts
 * const updated = createAgent(agents, data, Date.now().toString());
 * ```
 */
export function createAgent(
  agents: Agent[],
  data: AgentCreateInput,
  id: string
): Agent[] {
  const newAgent: Agent = {
    id,
    ...data,
    systemPrompt: data.systemPrompt || '',
    temperature: data.temperature || 0.7,
    maxTokens: data.maxTokens || 4096,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    // MCP 配置
    enableToolUse: data.enableToolUse || false,
    mcpServers: data.mcpServers,
  };

  return [...agents, newAgent];
}

/**
 * 更新 Agent
 *
 * @param agents - Agent 列表
 * @param id - Agent ID
 * @param data - 更新数据
 * @returns 更新后的 Agent 列表
 *
 * @example
 * ```ts
 * const updated = updateAgent(agents, 'agent-1', data);
 * ```
 */
export function updateAgent(
  agents: Agent[],
  id: string,
  data: AgentCreateInput
): Agent[] {
  return agents.map(agent =>
    agent.id === id
      ? {
          ...agent,
          ...data,
          updatedAt: new Date(),
          // MCP 配置：使用 ?? 运算符保留旧值
          enableToolUse: data.enableToolUse ?? agent.enableToolUse,
          mcpServers: data.mcpServers ?? agent.mcpServers,
        }
      : agent
  );
}

/**
 * 删除 Agent
 *
 * @param agents - Agent 列表
 * @param id - Agent ID
 * @returns 更新后的 Agent 列表
 *
 * @example
 * ```ts
 * const updated = deleteAgent(agents, 'agent-1');
 * ```
 */
export function deleteAgent(
  agents: Agent[],
  id: string
): Agent[] {
  return agents.filter(a => a.id !== id);
}

/**
 * 切换 Agent 状态
 *
 * @param agents - Agent 列表
 * @param id - Agent ID
 * @returns 更新后的 Agent 列表
 *
 * @example
 * ```ts
 * const updated = toggleAgentStatus(agents, 'agent-1');
 * ```
 */
export function toggleAgentStatus(
  agents: Agent[],
  id: string
): Agent[] {
  return agents.map(agent =>
    agent.id === id
      ? {
          ...agent,
          status: agent.status === 'active' ? 'inactive' as const : 'active' as const,
          updatedAt: new Date(),
        }
      : agent
  );
}

/**
 * 查找 Agent
 *
 * @param agents - Agent 列表
 * @param id - Agent ID
 * @returns Agent 或 undefined
 *
 * @example
 * ```ts
 * const agent = findAgent(agents, 'agent-1');
 * ```
 */
export function findAgent(
  agents: Agent[],
  id: string
): Agent | undefined {
  return agents.find(a => a.id === id);
}
