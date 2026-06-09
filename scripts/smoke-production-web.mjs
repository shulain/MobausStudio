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
  await page.getByText('Mobaus Studio').waitFor({ timeout: 15_000 });
  await page.getByPlaceholder('搜索对话...').waitFor({ timeout: 15_000 });

  await page.getByText('Agent').first().click();
  await page.getByRole('heading', { name: 'Agent 管理' }).waitFor({ timeout: 10_000 });

  await page.getByText('Skills').first().click();
  await page.getByRole('heading', { name: '技能管理' }).waitFor({ timeout: 10_000 });

  await page.getByText('MCP').first().click();
  await page.getByRole('heading', { name: 'MCP 服务器' }).waitFor({ timeout: 10_000 });

  await page.getByText('设置').first().click();
  await page.getByText('外观设置').waitFor({ timeout: 10_000 });

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
    checked: ['startup chat page', 'Agent 管理', '技能管理', 'MCP 服务器', '外观设置'],
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
