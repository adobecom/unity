#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { createHtmlReport } from 'axe-html-reporter';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const DEFAULT_VIEWPORTS = ['1360x900', '375x812'];
const MAX_LOGGED_NODES = 3;

function parseArgs(argv) {
  const args = { url: process.env.LOCAL_TEST_LIVE_URL || 'http://localhost:3000', viewport: DEFAULT_VIEWPORTS.join(',') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function parseViewport(spec) {
  const [width, height] = spec.split('x').map(Number);
  return { width, height };
}

function logResults(results, viewportLabel) {
  console.log(`\n--- ${viewportLabel} ---`);
  console.log(`Violations: ${results.violations.length}  Incomplete: ${results.incomplete.length}`);
  results.violations.forEach((v) => {
    console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
    v.nodes.slice(0, MAX_LOGGED_NODES).forEach((n) => console.log(`    - ${n.target.join(' ')}`));
    if (v.nodes.length > MAX_LOGGED_NODES) console.log(`    ... and ${v.nodes.length - MAX_LOGGED_NODES} more node(s)`);
  });
  results.incomplete.forEach((i) => {
    console.log(`  [incomplete] ${i.id}: ${i.description}`);
    i.nodes.slice(0, MAX_LOGGED_NODES).forEach((n) => console.log(`    - ${n.target.join(' ')}`));
    if (i.nodes.length > MAX_LOGGED_NODES) console.log(`    ... and ${i.nodes.length - MAX_LOGGED_NODES} more node(s)`);
  });
}

async function scanAtViewport(page, url, selector, viewportSpec) {
  await page.setViewportSize(parseViewport(viewportSpec));
  await page.goto(url, { waitUntil: 'networkidle' });
  if (selector) await page.waitForSelector(selector, { timeout: 15000 }).catch(() => {});
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (selector) builder.include(selector);
  return builder.analyze();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.selector) {
    console.warn('⚠️  No --selector given — scanning the full page. Results may include unrelated page issues; scope with --selector ".component-root" for a focused scan.');
  }

  const outDir = path.join(__dirname, '..', 'test-results', 'a11y');
  fs.mkdirSync(outDir, { recursive: true });
  // axe-html-reporter joins outputDir onto process.cwd() itself, so pass a relative path.
  const outDirRelative = path.relative(process.cwd(), outDir);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let violationCount = 0;

  try {
    const viewports = args.viewport.split(',');
    for (let i = 0; i < viewports.length; i += 1) {
      const viewportSpec = viewports[i];
      console.log(`Scanning ${args.url} [${args.selector || 'full page'}] at ${viewportSpec}...`);
      // eslint-disable-next-line no-await-in-loop
      const results = await scanAtViewport(page, args.url, args.selector, viewportSpec);
      logResults(results, viewportSpec);
      violationCount += results.violations.length;
      createHtmlReport({
        results,
        options: {
          projectKey: `a11y-${viewportSpec}`,
          outputDir: outDirRelative,
          reportFileName: `a11y-${viewportSpec}.html`,
        },
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`\nReports written to ${path.relative(process.cwd(), outDir)}/`);
  if (violationCount > 0) {
    console.log(`❌ ${violationCount} violation(s) found`);
    process.exit(1);
  } else {
    console.log('✅ No violations found');
  }
}

main().catch((error) => {
  console.error('Error running a11y scan:', error.message);
  process.exit(1);
});
