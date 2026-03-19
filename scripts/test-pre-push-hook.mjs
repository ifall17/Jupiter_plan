#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = process.cwd();
const hookPath = path.join(rootDir, '.git', 'hooks', 'pre-push');

if (!fs.existsSync(hookPath)) {
  console.error('pre-push hook not found. Run: npm run hooks:install');
  process.exit(1);
}

const content = fs.readFileSync(hookPath, 'utf8');
if (!content.includes('JUPITER_COMPLIANCE_PRE_PUSH_START')) {
  console.error('pre-push hook found, but managed compliance block is missing.');
  process.exit(1);
}

const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run compliance:all'], {
      cwd: rootDir,
      stdio: 'inherit',
    })
  : spawnSync('npm', ['run', 'compliance:all'], {
      cwd: rootDir,
      stdio: 'inherit',
    });

if (result.error) {
  console.error(`pre-push simulation failed to execute npm: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('pre-push simulation failed: compliance checks would block the push.');
  process.exit(result.status ?? 1);
}

console.log('pre-push simulation passed: compliance checks would allow the push.');
