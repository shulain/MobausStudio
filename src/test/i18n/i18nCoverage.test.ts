import { describe, it, expect } from 'vitest';
import { en } from '../../i18n/en';
import { zh } from '../../i18n/zh';

type NodeValue = string | Record<string, unknown>;

function collectLeafKeys(
  obj: Record<string, unknown>,
  prefix = ''
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result.set(path, value);
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = collectLeafKeys(value as Record<string, unknown>, path);
      for (const [nestedPath, nestedValue] of nested.entries()) {
        result.set(nestedPath, nestedValue);
      }
    }
  }

  return result;
}

function collectNodeTypes(
  obj: Record<string, unknown>,
  prefix = ''
): Map<string, 'string' | 'object'> {
  const result = new Map<string, 'string' | 'object'>();

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result.set(path, 'string');
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.set(path, 'object');
      const nested = collectNodeTypes(value as Record<string, unknown>, path);
      for (const [nestedPath, nestedType] of nested.entries()) {
        result.set(nestedPath, nestedType);
      }
    }
  }

  return result;
}

function getMissing(
  source: Map<string, NodeValue>,
  target: Map<string, NodeValue>
): string[] {
  return [...source.keys()].filter((key) => !target.has(key));
}

describe('i18n coverage', () => {
  it('should have identical leaf translation keys between zh and en', () => {
    const zhLeaves = collectLeafKeys(zh as Record<string, unknown>);
    const enLeaves = collectLeafKeys(en as Record<string, unknown>);

    const missingInEn = getMissing(zhLeaves as Map<string, NodeValue>, enLeaves as Map<string, NodeValue>);
    const missingInZh = getMissing(enLeaves as Map<string, NodeValue>, zhLeaves as Map<string, NodeValue>);

    expect(missingInEn, `Missing keys in en: ${missingInEn.join(', ')}`).toEqual([]);
    expect(missingInZh, `Missing keys in zh: ${missingInZh.join(', ')}`).toEqual([]);
  });

  it('should keep zh/en node types consistent for each translation path', () => {
    const zhTypes = collectNodeTypes(zh as Record<string, unknown>);
    const enTypes = collectNodeTypes(en as Record<string, unknown>);

    const allPaths = new Set([...zhTypes.keys(), ...enTypes.keys()]);
    const mismatches: string[] = [];

    for (const path of allPaths) {
      const zhType = zhTypes.get(path);
      const enType = enTypes.get(path);
      if (zhType !== enType) {
        mismatches.push(`${path} (zh=${zhType ?? 'missing'}, en=${enType ?? 'missing'})`);
      }
    }

    expect(mismatches, `Type mismatches: ${mismatches.join('; ')}`).toEqual([]);
  });

  it('should ensure all leaf translations are non-empty strings', () => {
    const zhLeaves = collectLeafKeys(zh as Record<string, unknown>);
    const enLeaves = collectLeafKeys(en as Record<string, unknown>);

    const emptyZh = [...zhLeaves.entries()]
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    const emptyEn = [...enLeaves.entries()]
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(emptyZh, `Empty zh values: ${emptyZh.join(', ')}`).toEqual([]);
    expect(emptyEn, `Empty en values: ${emptyEn.join(', ')}`).toEqual([]);
  });
});

