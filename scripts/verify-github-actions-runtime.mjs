import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WORKFLOWS_DIR = process.env.GITHUB_WORKFLOWS_DIR || '.github/workflows';

const deprecatedRefs = [
  {
    pattern: /\buses:\s*actions\/upload-artifact@v4\b/i,
    description: 'actions/upload-artifact@v4 uses the deprecated Node.js 20 action runtime',
    replacement: 'actions/upload-artifact@v7',
  },
];

function fail(message) {
  console.error(`GitHub Actions runtime verification failed: ${message}`);
  process.exitCode = 1;
}

function listWorkflowFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...listWorkflowFiles(fullPath));
    } else if (/\.(ya?ml)$/i.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!existsSync(WORKFLOWS_DIR)) {
  fail(`workflow directory '${WORKFLOWS_DIR}' is missing`);
} else {
  const workflowFiles = listWorkflowFiles(WORKFLOWS_DIR);

  if (workflowFiles.length === 0) {
    fail(`workflow directory '${WORKFLOWS_DIR}' does not contain any YAML workflows`);
  }

  for (const filePath of workflowFiles) {
    const content = readFileSync(filePath, 'utf8');
    const displayPath = relative(process.cwd(), filePath) || filePath;

    for (const deprecatedRef of deprecatedRefs) {
      if (deprecatedRef.pattern.test(content)) {
        fail(`${displayPath} uses ${deprecatedRef.description}; use ${deprecatedRef.replacement} instead`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit();
}

console.log('GitHub Actions runtime verification passed');
