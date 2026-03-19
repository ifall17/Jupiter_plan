#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const targets = ['apps/web/src', 'apps/api/src'];
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

const testFilePattern = /\.(spec|test)\.(ts|tsx|js|jsx)$/i;
const strictTodoTicketPattern = /TODO\(JP-\d+\)/;
const consolePattern = /\bconsole\.(log|error|warn|info|debug|trace)\s*\(/;
const alertPattern = /\b(?:window\.)?alert\s*\(/;

const findings = [];

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!allowedExtensions.has(extension)) {
      continue;
    }

    if (testFilePattern.test(entry.name)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      if (consolePattern.test(line)) {
        findings.push({
          rule: 'NO_CONSOLE',
          file: fullPath,
          line: lineNumber,
          message: 'console.* interdit dans le code applicatif',
        });
      }

      if (alertPattern.test(line)) {
        findings.push({
          rule: 'NO_ALERT',
          file: fullPath,
          line: lineNumber,
          message: 'alert/window.alert interdit dans le code applicatif',
        });
      }

      if (/TODO/i.test(line) && !strictTodoTicketPattern.test(line)) {
        findings.push({
          rule: 'TODO_TICKET_REQUIRED',
          file: fullPath,
          line: lineNumber,
          message: 'TODO non conforme. Format obligatoire: TODO(JP-123)',
        });
      }
    });
  }
}

for (const target of targets) {
  const absoluteTarget = path.join(rootDir, target);
  if (fs.existsSync(absoluteTarget)) {
    walk(absoluteTarget);
  }
}

if (findings.length > 0) {
  console.error('Compliance check failed: app code policy violations found.');
  for (const finding of findings) {
    const relative = path.relative(rootDir, finding.file).replace(/\\/g, '/');
    console.error(`- [${finding.rule}] ${relative}:${finding.line} - ${finding.message}`);
  }
  process.exit(1);
}

console.log('Compliance check passed: no console/alert and TODO format is compliant (TODO(JP-123)).');
