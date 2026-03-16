import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { en } from '../../i18n/en';
import { zh } from '../../i18n/zh';

function collectLeafKeys(
  obj: Record<string, unknown>,
  prefix = ''
): Set<string> {
  const keys = new Set<string>();

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      keys.add(currentPath);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of collectLeafKeys(value as Record<string, unknown>, currentPath)) {
        keys.add(nested);
      }
    }
  }

  return keys;
}

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test' || entry.name === 'i18n' || entry.name === 'dist') {
        continue;
      }
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectUsedI18nKeys(sourceCode: string): Set<string> {
  const keys = new Set<string>();

  // translate('a.b.c', t, ...)
  const translateRegex = /translate\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g;
  let translateMatch: RegExpExecArray | null = null;
  while ((translateMatch = translateRegex.exec(sourceCode)) !== null) {
    keys.add(translateMatch[1]);
  }

  // t.xxx.yyy (at least one nested level)
  const tPathRegex = /\bt\.([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)/g;
  let tPathMatch: RegExpExecArray | null = null;
  while ((tPathMatch = tPathRegex.exec(sourceCode)) !== null) {
    keys.add(tPathMatch[1]);
  }

  return keys;
}

function normalizeToExistingLeafKey(
  candidate: string,
  leafKeys: Set<string>,
  rootKeys: Set<string>
): string | null {
  const firstSegment = candidate.split('.')[0];
  if (!rootKeys.has(firstSegment)) {
    return null;
  }

  if (leafKeys.has(candidate)) {
    return candidate;
  }

  // 支持 t.xxx.replace(...) 等字符串方法链场景
  const allowedStringMethodSegments = new Set([
    'replace',
    'trim',
    'toLowerCase',
    'toUpperCase',
    'includes',
    'startsWith',
    'endsWith',
    'slice',
    'substring',
  ]);

  let current = candidate;
  while (current.includes('.')) {
    const segments = current.split('.');
    const tail = segments[segments.length - 1];
    if (!allowedStringMethodSegments.has(tail)) {
      break;
    }
    segments.pop();
    current = segments.join('.');
    if (leafKeys.has(current)) {
      return current;
    }
  }

  return null;
}

describe('i18n usage coverage gate', () => {
  it('should ensure every used i18n key exists in zh and en', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const files = walkFiles(srcRoot);

    const rawUsedKeys = new Set<string>();
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const key of collectUsedI18nKeys(content)) {
        rawUsedKeys.add(key);
      }
    }

    const zhKeys = collectLeafKeys(zh as Record<string, unknown>);
    const enKeys = collectLeafKeys(en as Record<string, unknown>);
    const rootKeys = new Set(Object.keys(zh as Record<string, unknown>));

    const usedKeys = new Set<string>();
    const unresolvedCandidates: string[] = [];
    for (const candidate of rawUsedKeys) {
      const normalized = normalizeToExistingLeafKey(candidate, zhKeys, rootKeys);
      if (normalized) {
        usedKeys.add(normalized);
      } else if (rootKeys.has(candidate.split('.')[0])) {
        unresolvedCandidates.push(candidate);
      }
    }

    expect(unresolvedCandidates, `Unresolved i18n key candidates: ${unresolvedCandidates.join(', ')}`).toEqual([]);
    // Sanity check: gate should actually scan meaningful keys
    expect(usedKeys.size).toBeGreaterThan(50);

    const missingInZh: string[] = [];
    const missingInEn: string[] = [];

    for (const key of usedKeys) {
      if (!zhKeys.has(key)) {
        missingInZh.push(key);
      }
      if (!enKeys.has(key)) {
        missingInEn.push(key);
      }
    }

    expect(missingInZh, `Missing keys in zh: ${missingInZh.join(', ')}`).toEqual([]);
    expect(missingInEn, `Missing keys in en: ${missingInEn.join(', ')}`).toEqual([]);
  });
});
