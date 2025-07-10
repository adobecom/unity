#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);

const COVERAGE_THRESHOLD = 80; // 80% coverage threshold

function parseLcovFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    let totalLines = 0;
    let hitLines = 0;
    let totalFunctions = 0;
    let hitFunctions = 0;
    let totalBranches = 0;
    let hitBranches = 0;

    lines.forEach((line) => {
      if (line.startsWith('LF:')) {
        totalLines += parseInt(line.substring(3), 10);
      } else if (line.startsWith('LH:')) {
        hitLines += parseInt(line.substring(3), 10);
      } else if (line.startsWith('FNF:')) {
        totalFunctions += parseInt(line.substring(4), 10);
      } else if (line.startsWith('FNH:')) {
        hitFunctions += parseInt(line.substring(4), 10);
      } else if (line.startsWith('BRF:')) {
        totalBranches += parseInt(line.substring(4), 10);
      } else if (line.startsWith('BRH:')) {
        hitBranches += parseInt(line.substring(4), 10);
      }
    });

    return {
      lines: {
        total: totalLines,
        hit: hitLines,
        percentage: totalLines > 0 ? (hitLines / totalLines) * 100 : 0,
      },
      functions: {
        total: totalFunctions,
        hit: hitFunctions,
        percentage: totalFunctions > 0 ? (hitFunctions / totalFunctions) * 100 : 0,
      },
      branches: {
        total: totalBranches,
        hit: hitBranches,
        percentage: totalBranches > 0 ? (hitBranches / totalBranches) * 100 : 0,
      },
    };
  } catch (error) {
    console.error('Error reading coverage file:', error.message);
    process.exit(1);
  }
  return null;
}

function checkCoverage() {
  const coverageFile = path.join(__dirname, '..', 'coverage', 'lcov.info');

  if (!fs.existsSync(coverageFile)) {
    console.error('❌ Coverage file not found. Run tests with coverage first.');
    process.exit(1);
  }

  const coverage = parseLcovFile(coverageFile);

  console.log('📊 Coverage Report:');
  console.log(`  Lines: ${coverage.lines.hit}/${coverage.lines.total} (${coverage.lines.percentage.toFixed(2)}%)`);
  console.log(`  Functions: ${coverage.functions.hit}/${coverage.functions.total} (${coverage.functions.percentage.toFixed(2)}%)`);
  console.log(`  Branches: ${coverage.branches.hit}/${coverage.branches.total} (${coverage.branches.percentage.toFixed(2)}%)`);

  // Check if coverage meets threshold
  const overallCoverage = coverage.lines.percentage;

  if (overallCoverage >= COVERAGE_THRESHOLD) {
    console.log(`✅ Coverage ${overallCoverage.toFixed(2)}% meets the required ${COVERAGE_THRESHOLD}% threshold`);
    process.exit(0);
  } else {
    console.log(`❌ Coverage ${overallCoverage.toFixed(2)}% is below the required ${COVERAGE_THRESHOLD}% threshold`);
    console.log(`   Need ${(COVERAGE_THRESHOLD - overallCoverage).toFixed(2)}% more coverage to pass`);
    process.exit(1);
  }
}

checkCoverage();
