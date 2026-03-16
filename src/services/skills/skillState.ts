/**
 * Skill 状态管理纯函数
 *
 * 职责：
 * - 技能 CRUD 状态更新
 * - 技能启用/禁用切换
 * - 技能批量安装
 * - 内置技能保护（不可编辑/删除）
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/skills/skillState
 * @version 1.0.0
 */

import type { Skill, SkillCreateInput } from '../../types';

// ==================== 纯函数 ====================

/**
 * 添加自定义技能
 *
 * @param skills - 技能列表
 * @param data - 创建输入
 * @param id - 技能 ID（外部生成）
 * @returns 更新后的技能列表
 *
 * @example
 * ```ts
 * const updated = addSkill(skills, data, Date.now().toString());
 * ```
 */
export function addSkill(
  skills: Skill[],
  data: SkillCreateInput,
  id: string
): Skill[] {
  const newSkill: Skill = {
    id,
    name: data.name,
    description: data.description,
    category: data.category,
    icon: data.icon || 'code',
    color: data.color || 'blue',
    enabled: true,
    promptTemplate: data.promptTemplate,
    outputFormat: data.outputFormat,
    triggers: data.triggers,
    variables: data.variables,
    builtIn: false,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    files: data.files,
    source: data.source,
  };

  return [...skills, newSkill];
}

/**
 * 更新技能
 *
 * 内置技能不可编辑，返回原列表
 *
 * @param skills - 技能列表
 * @param id - 技能 ID
 * @param data - 更新数据
 * @returns 更新后的技能列表
 *
 * @example
 * ```ts
 * const updated = updateSkill(skills, 'skill-1', data);
 * ```
 */
export function updateSkill(
  skills: Skill[],
  id: string,
  data: SkillCreateInput
): Skill[] {
  return skills.map(skill => {
    if (skill.id === id) {
      // 内置技能不可编辑
      if (skill.builtIn) {
        return skill;
      }
      return {
        ...skill,
        ...data,
        updatedAt: new Date(),
      };
    }
    return skill;
  });
}

/**
 * 删除技能
 *
 * 内置技能不可删除，返回原列表
 *
 * @param skills - 技能列表
 * @param id - 技能 ID
 * @returns 更新后的技能列表
 *
 * @example
 * ```ts
 * const updated = deleteSkill(skills, 'skill-1');
 * ```
 */
export function deleteSkill(
  skills: Skill[],
  id: string
): Skill[] {
  const skillToDelete = skills.find(s => s.id === id);
  // 内置技能不可删除
  if (skillToDelete?.builtIn) {
    return skills;
  }
  return skills.filter(s => s.id !== id);
}

/**
 * 切换技能启用状态
 *
 * @param skills - 技能列表
 * @param id - 技能 ID
 * @param enabled - 是否启用
 * @returns 更新后的技能列表
 *
 * @example
 * ```ts
 * const updated = toggleSkill(skills, 'skill-1', false);
 * ```
 */
export function toggleSkill(
  skills: Skill[],
  id: string,
  enabled: boolean
): Skill[] {
  return skills.map(skill =>
    skill.id === id
      ? { ...skill, enabled, updatedAt: new Date() }
      : skill
  );
}

/**
 * 批量安装技能
 *
 * @param skills - 现有技能列表
 * @param dataList - 技能创建输入列表
 * @param baseId - 基础 ID（用于生成唯一 ID）
 * @returns 更新后的技能列表
 *
 * @example
 * ```ts
 * const updated = installSkills(skills, dataList, Date.now());
 * ```
 */
export function installSkills(
  skills: Skill[],
  dataList: SkillCreateInput[],
  baseId: number
): Skill[] {
  const newSkills: Skill[] = dataList.map((data, index) => ({
    id: `${baseId}-${index}`,
    name: data.name,
    description: data.description,
    category: data.category,
    icon: data.icon || 'code',
    color: data.color || 'blue',
    enabled: true,
    promptTemplate: data.promptTemplate,
    outputFormat: data.outputFormat,
    triggers: data.triggers,
    variables: data.variables,
    builtIn: false,
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    files: data.files,
    source: data.source,
  }));

  return [...skills, ...newSkills];
}

/**
 * 查找技能
 *
 * @param skills - 技能列表
 * @param id - 技能 ID
 * @returns 技能或 undefined
 *
 * @example
 * ```ts
 * const skill = findSkill(skills, 'skill-1');
 * ```
 */
export function findSkill(
  skills: Skill[],
  id: string
): Skill | undefined {
  return skills.find(s => s.id === id);
}
