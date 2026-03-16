/**
 * @file agentState.test.ts
 * @description agentState 纯函数单元测试
 *
 * 测试用例：
 * - TC-AGENT-STATE-001: createAgent - 创建 Agent
 * - TC-AGENT-STATE-002: updateAgent - 更新 Agent
 * - TC-AGENT-STATE-003: updateAgent - MCP 配置保留
 * - TC-AGENT-STATE-004: deleteAgent - 删除 Agent
 * - TC-AGENT-STATE-005: toggleAgentStatus - 切换状态
 * - TC-AGENT-STATE-006: findAgent - 查找存在
 * - TC-AGENT-STATE-007: findAgent - 查找不存在
 * - TC-AGENT-STATE-008: deleteAgent - id 不存在
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  createAgent,
  updateAgent,
  deleteAgent,
  toggleAgentStatus,
  findAgent,
} from '../../../services/agents/agentState';
import type { Agent, AgentCreateInput } from '../../../types';

// ==================== 测试辅助 ====================

const createMockAgent = (id: string): Agent => ({
  id,
  name: `Agent ${id}`,
  description: '测试 Agent',
  model: 'gpt-4',
  skills: ['skill-1'],
  systemPrompt: '你是助手',
  temperature: 0.7,
  maxTokens: 4096,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  usageCount: 0,
  enableToolUse: false,
});

const createMockInput = (): AgentCreateInput => ({
  name: 'New Agent',
  description: '新 Agent',
  model: 'gpt-4o',
  skills: ['skill-1', 'skill-2'],
  systemPrompt: '你是专家',
  temperature: 0.9,
  maxTokens: 8192,
  enableToolUse: true,
  mcpServers: [{ serverId: 'mcp-1', serverName: 'MCP Server 1' }],
});

// ==================== 测试用例 ====================

describe('agentState 纯函数测试', () => {
  // ==================== TC-AGENT-STATE-001 ====================
  it('TC-AGENT-STATE-001: createAgent - 创建 Agent', () => {
    const agents: Agent[] = [createMockAgent('agent-1')];
    const data = createMockInput();

    const result = createAgent(agents, data, 'agent-2');

    // 列表长度增加
    expect(result).toHaveLength(2);

    // 新 Agent 字段正确
    const newAgent = result[1];
    expect(newAgent.id).toBe('agent-2');
    expect(newAgent.name).toBe('New Agent');
    expect(newAgent.description).toBe('新 Agent');
    expect(newAgent.model).toBe('gpt-4o');
    expect(newAgent.skills).toEqual(['skill-1', 'skill-2']);
    expect(newAgent.systemPrompt).toBe('你是专家');
    expect(newAgent.temperature).toBe(0.9);
    expect(newAgent.maxTokens).toBe(8192);
    expect(newAgent.status).toBe('active');
    expect(newAgent.usageCount).toBe(0);
    expect(newAgent.enableToolUse).toBe(true);
    expect(newAgent.mcpServers).toHaveLength(1);
    expect(newAgent.createdAt).toBeInstanceOf(Date);

    // 原有 Agent 不受影响
    expect(result[0].id).toBe('agent-1');
  });

  // ==================== TC-AGENT-STATE-002 ====================
  it('TC-AGENT-STATE-002: updateAgent - 更新 Agent', () => {
    const agents: Agent[] = [createMockAgent('agent-1')];
    const data = createMockInput();

    const result = updateAgent(agents, 'agent-1', data);

    expect(result[0].name).toBe('New Agent');
    expect(result[0].description).toBe('新 Agent');
    expect(result[0].model).toBe('gpt-4o');
    expect(result[0].skills).toEqual(['skill-1', 'skill-2']);
    expect(result[0].enableToolUse).toBe(true);
    expect(result[0].mcpServers).toHaveLength(1);
  });

  // ==================== TC-AGENT-STATE-003 ====================
  it('TC-AGENT-STATE-003: updateAgent - MCP 配置保留', () => {
    const agents: Agent[] = [{
      ...createMockAgent('agent-1'),
      enableToolUse: true,
      mcpServers: [{ serverId: 'mcp-old', serverName: 'Old MCP' }],
    }];
    const data: AgentCreateInput = {
      name: 'Updated',
      description: '更新',
      model: 'gpt-4',
      skills: [],
      // 不提供 MCP 配置，应保留旧值
    };

    const result = updateAgent(agents, 'agent-1', data);

    // 保留旧的 MCP 配置
    expect(result[0].enableToolUse).toBe(true);
    expect(result[0].mcpServers).toHaveLength(1);
    expect(result[0].mcpServers?.[0].serverId).toBe('mcp-old');
  });

  // ==================== TC-AGENT-STATE-004 ====================
  it('TC-AGENT-STATE-004: deleteAgent - 删除 Agent', () => {
    const agents: Agent[] = [
      createMockAgent('agent-1'),
      createMockAgent('agent-2'),
    ];

    const result = deleteAgent(agents, 'agent-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('agent-2');
  });

  // ==================== TC-AGENT-STATE-005 ====================
  it('TC-AGENT-STATE-005: toggleAgentStatus - 切换状态', () => {
    const agents: Agent[] = [createMockAgent('agent-1')]; // status = 'active'

    const result = toggleAgentStatus(agents, 'agent-1');

    expect(result[0].status).toBe('inactive');

    // 再次切换
    const result2 = toggleAgentStatus(result, 'agent-1');
    expect(result2[0].status).toBe('active');
  });

  // ==================== TC-AGENT-STATE-006 ====================
  it('TC-AGENT-STATE-006: findAgent - 查找存在', () => {
    const agents: Agent[] = [
      createMockAgent('agent-1'),
      createMockAgent('agent-2'),
    ];

    const agent = findAgent(agents, 'agent-1');

    expect(agent).toBeDefined();
    expect(agent?.id).toBe('agent-1');
  });

  // ==================== TC-AGENT-STATE-007 ====================
  it('TC-AGENT-STATE-007: findAgent - 查找不存在', () => {
    const agents: Agent[] = [createMockAgent('agent-1')];

    const agent = findAgent(agents, 'non-existent');

    expect(agent).toBeUndefined();
  });

  // ==================== TC-AGENT-STATE-008 ====================
  it('TC-AGENT-STATE-008: deleteAgent - id 不存在', () => {
    const agents: Agent[] = [createMockAgent('agent-1')];

    const result = deleteAgent(agents, 'non-existent');

    // 列表不变
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('agent-1');
  });
});
