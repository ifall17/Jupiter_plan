#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const hooksDir = path.join(rootDir, '.git', 'hooks');
const prePushPath = path.join(hooksDir, 'pre-push');

const blockStart = '# JUPITER_COMPLIANCE_PRE_PUSH_START';
const blockEnd = '# JUPITER_COMPLIANCE_PRE_PUSH_END';
const managedBlock = `${blockStart}\nif [ -x \"$(command -v npm)\" ]; then\n  npm run compliance:all\nelse\n  npm.cmd run compliance:all\nfi\nstatus=$?\nif [ $status -ne 0 ]; then\n  echo \"pre-push blocked: compliance checks failed\"\n  exit $status\nfi\n${blockEnd}`;

if (!fs.existsSync(hooksDir)) {
  console.warn('No .git/hooks directory found, skipping hook installation.');
  process.exit(0);
}

let current = '';
if (fs.existsSync(prePushPath)) {
  current = fs.readFileSync(prePushPath, 'utf8');
}

if (current.includes(blockStart) && current.includes(blockEnd)) {
  const updated = current.replace(new RegExp(`${blockStart}[\\s\\S]*?${blockEnd}`), managedBlock);
  fs.writeFileSync(prePushPath, updated, 'utf8');
} else if (current.trim().length > 0) {
  const separator = current.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(prePushPath, `${current}${separator}\n${managedBlock}\n`, 'utf8');
} else {
  const content = `#!/bin/sh\n${managedBlock}\n`;
  fs.writeFileSync(prePushPath, content, 'utf8');
}

try {
  fs.chmodSync(prePushPath, 0o755);
} catch {
  // Best effort on Windows.
}

console.log('Git pre-push hook installed/updated (compliance:all).');
