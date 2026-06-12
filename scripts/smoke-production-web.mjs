import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const HOST = '127.0.0.1';
const DEFAULT_SCREENSHOT_PATH = join(tmpdir(), 'mobausstudio-production-smoke.png');
const DEFAULT_REPORT_PATH = join(tmpdir(), 'mobausstudio-production-smoke-report.json');

function log(message) {
  console.log(`[production-smoke] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function expectVisible(locator, label, timeout = 10_000) {
  await locator.waitFor({ state: 'visible', timeout }).catch((error) => {
    throw new Error(`Expected visible: ${label}\n${error.message}`);
  });
}

async function expectAbsent(locator, label, timeout = 2_000) {
  await locator.waitFor({ state: 'attached', timeout }).then(() => {
    throw new Error(`Expected absent: ${label}`);
  }).catch((error) => {
    if (!String(error.message).includes('Timeout')) {
      throw error;
    }
  });
}

function findChromeExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ];

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    fail('No Chrome or Chromium executable found. Set CHROME_PATH to run the production smoke test.');
  }

  return executable;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function getAvailablePort() {
  const { createServer } = await import('node:net');

  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForPreview(url, processOutput) {
  const startedAt = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Preview server is not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail(`Preview server did not become ready at ${url}.\n${processOutput()}`);
}

function startPreview(port) {
  const output = [];
  const child = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(port), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );

  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  const stop = () => {
    if (child.killed) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        child.kill('SIGTERM');
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      child.kill('SIGTERM');
    }
  };

  return {
    child,
    output: () => output.join(''),
    stop,
  };
}

async function runBrowserSmoke(url) {
  const executablePath = findChromeExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await expectVisible(page.getByText('Mobaus Studio'), 'app shell');
  await expectVisible(page.getByPlaceholder('搜索对话...'), 'chat search input');
  await expectAbsent(page.getByText('React 开发问题'), 'mock React chat on clean startup');
  await expectAbsent(page.getByText('Python 数据分析'), 'mock Python chat on clean startup');
  await expectAbsent(page.getByText('Agent 创建成功'), 'mock notification on clean startup');

  const chatInput = page.getByPlaceholder(/输入消息/);
  await expectVisible(chatInput, 'chat message input', 15_000);
  await chatInput.fill('生产烟测：验证输入框可编辑');
  await chatInput.fill('');
  await expectVisible(page.getByRole('button', { name: '新建对话' }), 'new chat button');
  await page.getByRole('button', { name: '新建对话' }).click();
  await expectVisible(chatInput, 'chat input after creating a chat');

  await page.getByText('Agent').first().click();
  await expectVisible(page.getByRole('heading', { name: 'Agent 管理' }), 'Agent page heading');
  await expectVisible(page.getByPlaceholder('搜索 Agent...'), 'Agent search input');

  await page.getByText('Skills').first().click();
  await expectVisible(page.getByRole('heading', { name: '技能管理' }), 'Skills page heading');
  await expectVisible(page.getByPlaceholder('搜索技能...').first(), 'Skills search input');
  await expectVisible(page.getByRole('button', { name: '安装技能' }), 'install skills button');

  await page.getByText('MCP').first().click();
  await expectVisible(page.getByRole('heading', { name: 'MCP 服务器' }), 'MCP page heading');
  await expectVisible(page.getByRole('button', { name: '添加服务器' }), 'MCP add server button');

  await page.getByText('模型').first().click();
  await expectVisible(page.getByPlaceholder('搜索模型...'), 'Models search input');

  await page.getByText('提供商').first().click();
  await expectVisible(page.getByPlaceholder('搜索提供商...'), 'Providers search input');

  await page.getByText('配置切换').first().click();
  await expectVisible(page.getByRole('heading', { name: '配置切换' }), 'Config switcher page heading');

  await page.getByText('统计').first().click();
  await expectVisible(page.getByRole('heading', { name: '使用统计' }), 'Stats page heading');
  await page.getByRole('button', { name: '关闭' }).click();
  await expectAbsent(page.getByRole('heading', { name: '使用统计' }), 'Stats modal after close');

  await page.getByText('设置').first().click();
  await expectVisible(page.getByText('外观设置'), 'Settings appearance section');
  await page.getByText('数据管理').first().click();
  await expectVisible(page.getByText('备份与恢复'), 'Settings backup and restore section');
  const backupSection = page.locator('section').filter({ hasText: '备份与恢复' });

  const seededState = {
    models: [
      {
        id: 'smoke-model-existing',
        name: 'Smoke Existing Model',
        provider: 'smoke-provider-existing',
        status: 'offline',
        apiKeySet: true,
        apiKey: 'smoke-api-key',
        endpoint: 'https://example.invalid/v1',
        maxTokens: 1024,
        pricing: { input: 0, output: 0 },
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    customProviders: [
      {
        id: 'smoke-provider-existing',
        name: 'Smoke Existing Provider',
        icon: '🧪',
        description: { zh: '生产烟测自定义提供商', en: 'Production smoke custom provider' },
        endpoint: 'https://example.invalid/v1',
        authMethods: [{ type: 'api', label: 'API Key', description: 'Smoke API key' }],
        protocol: 'openai',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    agents: [
      {
        id: 'smoke-agent-existing',
        name: 'Smoke Existing Agent',
        description: 'Production smoke export fixture',
        model: 'smoke-model-existing',
        skills: ['smoke-skill-existing'],
        systemPrompt: 'You are the existing production smoke agent.',
        temperature: 0.2,
        maxTokens: 1024,
        mcpServers: [{ serverId: 'smoke-mcp-existing', serverName: 'Smoke Existing MCP' }],
        enableToolUse: true,
        status: 'active',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
        usageCount: 0,
      },
    ],
    skills: [
      {
        id: 'smoke-skill-existing',
        name: 'Smoke Existing Skill',
        description: 'Production smoke export fixture',
        category: 'custom',
        icon: 'Wrench',
        color: 'purple',
        enabled: true,
        promptTemplate: 'Echo the production smoke fixture.',
        builtIn: false,
        version: '1.0.0',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    mcp: [
      {
        id: 'smoke-mcp-existing',
        name: 'Smoke Existing MCP',
        description: 'Production smoke export fixture',
        enabled: true,
        autoStart: false,
        transportType: 'stdio',
        command: 'node',
        args: [],
        authType: 'none',
        status: 'disconnected',
        requestCount: 0,
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    settings: {
      theme: 'system',
      language: 'zh',
    },
  };

  await page.evaluate((state) => {
    localStorage.setItem('mobaus_models', JSON.stringify(state.models));
    localStorage.setItem('mobaus_custom_providers', JSON.stringify(state.customProviders));
    localStorage.setItem('mobaus_agents', JSON.stringify(state.agents));
    localStorage.setItem('mobaus_skills', JSON.stringify(state.skills));
    localStorage.setItem('mobaus_mcp_servers', JSON.stringify(state.mcp));
    localStorage.setItem('mobaus_settings', JSON.stringify(state.settings));
  }, seededState);

  await backupSection.getByRole('button', { name: '导出配置' }).click();
  await expectVisible(page.getByText('Agents 配置'), 'export modal Agents option');
  await expectVisible(page.getByText('自定义提供商', { exact: true }), 'export modal custom providers option');
  await expectVisible(page.getByText('Skills 配置'), 'export modal Skills option');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出配置' }).last().click();
  const exportDownload = await downloadPromise;
  const exportedPath = join(tmpdir(), `mobaus-export-smoke-${Date.now()}.json`);
  await exportDownload.saveAs(exportedPath);
  const exportedData = JSON.parse(readFileSync(exportedPath, 'utf8'));
  if (!exportedData.models?.some((item) => item.id === 'smoke-model-existing')) {
    fail('Exported config did not include the seeded model.');
  }
  if (!exportedData.customProviders?.some((item) => item.id === 'smoke-provider-existing')) {
    fail('Exported config did not include the seeded custom provider.');
  }
  if (!exportedData.agents?.some((item) => item.id === 'smoke-agent-existing')) {
    fail('Exported config did not include the seeded agent.');
  }
  if (!exportedData.skills?.some((item) => item.id === 'smoke-skill-existing')) {
    fail('Exported config did not include the seeded skill.');
  }
  if (!exportedData.mcp?.some((item) => item.id === 'smoke-mcp-existing')) {
    fail('Exported config did not include the seeded MCP server.');
  }
  if (exportedData.chats !== undefined) {
    fail('Exported config unexpectedly included chat history when the default chat option is off.');
  }
  await expectVisible(page.getByText('备份与恢复'), 'backup and restore section after completed export');

  await backupSection.getByRole('button', { name: '导入配置' }).click();
  await expectVisible(page.getByText('合并现有配置'), 'import modal merge option');
  await expectVisible(page.getByText('导入前备份'), 'import modal backup option');

  const importPayload = {
    version: '1.0.0',
    models: [
      {
        id: 'smoke-model-imported',
        name: 'Smoke Imported Model',
        provider: 'smoke-provider-imported',
        status: 'offline',
        apiKeySet: true,
        apiKey: 'smoke-imported-api-key',
        endpoint: 'https://imported.example.invalid/v1',
        maxTokens: 2048,
        pricing: { input: 0, output: 0 },
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    customProviders: [
      {
        id: 'smoke-provider-imported',
        name: 'Smoke Imported Provider',
        icon: '🧪',
        description: { zh: '导入烟测自定义提供商', en: 'Imported smoke custom provider' },
        endpoint: 'https://imported.example.invalid/v1',
        authMethods: [{ type: 'api', label: 'API Key', description: 'Smoke imported API key' }],
        protocol: 'openai',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    agents: [
      {
        id: 'smoke-agent-imported',
        name: 'Smoke Imported Agent',
        description: 'Production smoke import fixture',
        model: 'smoke-model-imported',
        skills: ['smoke-skill-imported'],
        systemPrompt: 'You are the imported production smoke agent.',
        temperature: 0.2,
        maxTokens: 2048,
        mcpServers: [{ serverId: 'smoke-mcp-imported', serverName: 'Smoke Imported MCP' }],
        enableToolUse: true,
        status: 'active',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
        usageCount: 0,
      },
    ],
    skills: [
      {
        id: 'smoke-skill-imported',
        name: 'Smoke Imported Skill',
        description: 'Production smoke import fixture',
        category: 'custom',
        icon: 'Wrench',
        color: 'purple',
        enabled: true,
        promptTemplate: 'Echo the imported production smoke fixture.',
        builtIn: false,
        version: '1.0.0',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    mcp: [
      {
        id: 'smoke-mcp-imported',
        name: 'Smoke Imported MCP',
        description: 'Production smoke import fixture',
        enabled: true,
        autoStart: false,
        transportType: 'stdio',
        command: 'node',
        args: [],
        authType: 'none',
        status: 'disconnected',
        requestCount: 0,
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ],
    settings: {
      theme: 'system',
      language: 'zh',
    },
  };
  const importPath = join(tmpdir(), `mobaus-import-smoke-${Date.now()}.json`);
  writeFileSync(importPath, JSON.stringify(importPayload, null, 2));
  await page.locator('input[type="file"]').setInputFiles(importPath);
  await expectVisible(page.getByText(basename(importPath)), 'selected import file name');

  const backupCheckbox = page.getByLabel('导入前备份');
  if (await backupCheckbox.isChecked()) {
    await backupCheckbox.click();
  }

  await page.getByRole('button', { name: '开始导入' }).click();

  try {
    await page.waitForFunction(() => {
      const parse = (key) => JSON.parse(localStorage.getItem(key) || '[]');
      return (
        parse('mobaus_models').some((item) => item.id === 'smoke-model-existing') &&
        parse('mobaus_models').some((item) => item.id === 'smoke-model-imported') &&
        parse('mobaus_custom_providers').some((item) => item.id === 'smoke-provider-existing') &&
        parse('mobaus_custom_providers').some((item) => item.id === 'smoke-provider-imported') &&
        parse('mobaus_agents').some((item) => item.id === 'smoke-agent-imported') &&
        parse('mobaus_skills').some((item) => item.id === 'smoke-skill-imported') &&
        parse('mobaus_mcp_servers').some((item) => item.id === 'smoke-mcp-imported')
      );
    }, null, { timeout: 10_000 });
  } catch (error) {
    const importSnapshot = await page.evaluate(() => {
      const parse = (key) => {
        try {
          return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (parseError) {
          return { parseError: String(parseError), raw: localStorage.getItem(key) };
        }
      };
      return {
        bodyText: document.body.innerText.slice(0, 2000),
        models: parse('mobaus_models'),
        customProviders: parse('mobaus_custom_providers'),
        agents: parse('mobaus_agents'),
        skills: parse('mobaus_skills'),
        mcp: parse('mobaus_mcp_servers'),
      };
    });
    fail(`Import did not persist the expected merged data.\n${JSON.stringify(importSnapshot, null, 2)}\n${error.message}`);
  }
  await expectVisible(page.getByText('Mobaus Studio'), 'app shell after completed import');

  const screenshotPath = process.env.PRODUCTION_SMOKE_SCREENSHOT || DEFAULT_SCREENSHOT_PATH;
  mkdirSync(dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await context.close();
  await browser.close();

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    fail(JSON.stringify({ consoleErrors, pageErrors }, null, 2));
  }

  return {
    url,
    screenshotPath,
    checked: [
      'startup chat page',
      'clean startup without mock chats or notifications',
      'chat input editable',
      'new chat button',
      'Agent 管理',
      'Agent search input',
      '技能管理',
      'Skills search input',
      '安装技能 button',
      'MCP 服务器',
      'MCP add server button',
      'Models search input',
      'Providers search input',
      '配置切换 page heading',
      '使用统计 page heading',
      '关闭统计 modal',
      '外观设置',
      '数据管理',
      '导出配置 download with models/custom providers/agents/skills/MCP',
      '导入配置 file restore with merged persisted data',
    ],
    consoleErrors,
    pageErrors,
  };
}

async function main() {
  if (process.env.SMOKE_SKIP_BUILD !== '1') {
    log('Building production web bundle');
    await run('npm', ['run', 'build']);
  }

  const port = await getAvailablePort();
  const url = `http://${HOST}:${port}/`;
  const preview = startPreview(port);

  try {
    await waitForPreview(url, preview.output);
    log(`Running browser smoke against ${url}`);
    const result = await runBrowserSmoke(url);
    const report = { ok: true, ...result };
    const reportPath = process.env.PRODUCTION_SMOKE_REPORT || DEFAULT_REPORT_PATH;
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } finally {
    preview.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
