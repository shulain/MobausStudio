/**
 * @file skillState.test.ts
 * @description skillState 纯函数单元测试
 *
 * 测试用例：
 * - TC-SKILL-STATE-001: addSkill - 创建技能
 * - TC-SKILL-STATE-002: updateSkill - 更新自定义技能
 * - TC-SKILL-STATE-003: updateSkill - 内置技能不可编辑
 * - TC-SKILL-STATE-004: deleteSkill - 删除自定义技能
 * - TC-SKILL-STATE-005: deleteSkill - 内置技能不可删除
 * - TC-SKILL-STATE-006: toggleSkill - 切换启用状态
 * - TC-SKILL-STATE-007: installSkills - 批量安装
 * - TC-SKILL-STATE-008: findSkill - 查找存在
 * - TC-SKILL-STATE-009: findSkill - 查找不存在
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  addSkill,
  updateSkill,
  deleteSkill,
  toggleSkill,
  installSkills,
  findSkill,
} from '../../../services/skills/skillState';
import type { Skill, SkillCreateInput } from '../../../types';

// ==================== 测试辅助 ====================

const createMockSkill = (id: string, builtIn = false): Skill => ({
  id,
  name: `Skill ${id}`,
  description: '测试技能',
  category: 'coding',
  icon: 'code',
  color: 'blue',
  enabled: true,
  promptTemplate: '这是提示词模板',
  builtIn,
  version: '1.0.0',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockInput = (): SkillCreateInput => ({
  name: 'New Skill',
  description: '新技能',
  category: 'writing',
  icon: 'pen',
  color: 'green',
  promptTemplate: '新的提示词模板',
});

// ==================== 测试用例 ====================

describe('skillState 纯函数测试', () => {
  // ==================== TC-SKILL-STATE-001 ====================
  it('TC-SKILL-STATE-001: addSkill - 创建技能', () => {
    const skills: Skill[] = [createMockSkill('skill-1')];
    const data = createMockInput();

    const result = addSkill(skills, data, 'skill-2');

    // 列表长度增加
    expect(result).toHaveLength(2);

    // 新技能字段正确
    const newSkill = result[1];
    expect(newSkill.id).toBe('skill-2');
    expect(newSkill.name).toBe('New Skill');
    expect(newSkill.description).toBe('新技能');
    expect(newSkill.category).toBe('writing');
    expect(newSkill.icon).toBe('pen');
    expect(newSkill.color).toBe('green');
    expect(newSkill.enabled).toBe(true);
    expect(newSkill.builtIn).toBe(false);
    expect(newSkill.version).toBe('1.0.0');
    expect(newSkill.createdAt).toBeInstanceOf(Date);

    // 原有技能不受影响
    expect(result[0].id).toBe('skill-1');
  });

  // ==================== TC-SKILL-STATE-002 ====================
  it('TC-SKILL-STATE-002: updateSkill - 更新自定义技能', () => {
    const skills: Skill[] = [createMockSkill('skill-1', false)];
    const data = createMockInput();

    const result = updateSkill(skills, 'skill-1', data);

    expect(result[0].name).toBe('New Skill');
    expect(result[0].description).toBe('新技能');
    expect(result[0].category).toBe('writing');
    expect(result[0].promptTemplate).toBe('新的提示词模板');
  });

  // ==================== TC-SKILL-STATE-003 ====================
  it('TC-SKILL-STATE-003: updateSkill - 内置技能不可编辑', () => {
    const builtInSkill = createMockSkill('builtin-1', true);
    const skills: Skill[] = [builtInSkill];
    const data = createMockInput();

    const result = updateSkill(skills, 'builtin-1', data);

    // 内置技能不变
    expect(result[0].name).toBe('Skill builtin-1');
    expect(result[0].promptTemplate).toBe('这是提示词模板');
  });

  // ==================== TC-SKILL-STATE-004 ====================
  it('TC-SKILL-STATE-004: deleteSkill - 删除自定义技能', () => {
    const skills: Skill[] = [
      createMockSkill('skill-1', false),
      createMockSkill('skill-2', false),
    ];

    const result = deleteSkill(skills, 'skill-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('skill-2');
  });

  // ==================== TC-SKILL-STATE-005 ====================
  it('TC-SKILL-STATE-005: deleteSkill - 内置技能不可删除', () => {
    const skills: Skill[] = [
      createMockSkill('builtin-1', true),
      createMockSkill('skill-1', false),
    ];

    const result = deleteSkill(skills, 'builtin-1');

    // 内置技能保留
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('builtin-1');
  });

  // ==================== TC-SKILL-STATE-006 ====================
  it('TC-SKILL-STATE-006: toggleSkill - 切换启用状态', () => {
    const skills: Skill[] = [createMockSkill('skill-1')]; // enabled = true

    const result = toggleSkill(skills, 'skill-1', false);

    expect(result[0].enabled).toBe(false);

    // 再次切换
    const result2 = toggleSkill(result, 'skill-1', true);
    expect(result2[0].enabled).toBe(true);
  });

  // ==================== TC-SKILL-STATE-007 ====================
  it('TC-SKILL-STATE-007: installSkills - 批量安装', () => {
    const skills: Skill[] = [createMockSkill('skill-1')];
    const dataList: SkillCreateInput[] = [
      { name: 'Skill A', description: 'A', category: 'coding', promptTemplate: 'A' },
      { name: 'Skill B', description: 'B', category: 'writing', promptTemplate: 'B' },
    ];

    const result = installSkills(skills, dataList, 1000);

    // 总共 3 个
    expect(result).toHaveLength(3);

    // ID 格式正确
    expect(result[1].id).toBe('1000-0');
    expect(result[2].id).toBe('1000-1');

    // 字段正确
    expect(result[1].name).toBe('Skill A');
    expect(result[2].name).toBe('Skill B');
    expect(result[1].builtIn).toBe(false);
    expect(result[2].builtIn).toBe(false);

    // 默认值
    expect(result[1].icon).toBe('code');
    expect(result[1].color).toBe('blue');
    expect(result[1].enabled).toBe(true);
  });

  // ==================== TC-SKILL-STATE-008 ====================
  it('TC-SKILL-STATE-008: findSkill - 查找存在', () => {
    const skills: Skill[] = [
      createMockSkill('skill-1'),
      createMockSkill('skill-2'),
    ];

    const skill = findSkill(skills, 'skill-1');

    expect(skill).toBeDefined();
    expect(skill?.id).toBe('skill-1');
  });

  // ==================== TC-SKILL-STATE-009 ====================
  it('TC-SKILL-STATE-009: findSkill - 查找不存在', () => {
    const skills: Skill[] = [createMockSkill('skill-1')];

    const skill = findSkill(skills, 'non-existent');

    expect(skill).toBeUndefined();
  });
});
