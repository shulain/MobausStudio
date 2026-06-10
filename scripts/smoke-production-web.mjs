import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';

const HOST = '127.0.0.1';
const DEFAULT_SCREENSHOT_PATH = join(tmpdir(), 'mobausstudio-production-smoke.png');

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

  await page.getByText('设置').first().click();
  await expectVisible(page.getByText('外观设置'), 'Settings appearance section');
  await page.getByText('数据管理').first().click();
  await expectVisible(page.getByText('备份与恢复'), 'Settings backup and restore section');
  const backupSection = page.locator('section').filter({ hasText: '备份与恢复' });

  await backupSection.getByRole('button', { name: '导出配置' }).click();
  await expectVisible(page.getByText('Agents 配置'), 'export modal Agents option');
  await expectVisible(page.getByText('Skills 配置'), 'export modal Skills option');
  await page.getByRole('button', { name: '取消' }).click();
  await expectVisible(page.getByText('备份与恢复'), 'backup and restore section after closing export modal');

  await backupSection.getByRole('button', { name: '导入配置' }).click();
  await expectVisible(page.getByText('合并现有配置'), 'import modal merge option');
  await expectVisible(page.getByText('导入前备份'), 'import modal backup option');
  await page.getByRole('button', { name: '取消' }).click();
  await expectVisible(page.getByText('备份与恢复'), 'backup and restore section after closing import modal');

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
      'chat input editable',
      'new chat button',
      'Agent 管理',
      'Agent search input',
      '技能管理',
      'Skills search input',
      '安装技能 button',
      'MCP 服务器',
      'MCP add server button',
      '外观设置',
      '数据管理',
      '导出配置 modal',
      '导入配置 modal',
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
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    preview.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
