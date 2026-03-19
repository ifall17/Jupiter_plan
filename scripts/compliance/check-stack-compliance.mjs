#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const apiPkg = readJson(path.join(rootDir, 'apps/api/package.json'));
const webPkg = readJson(path.join(rootDir, 'apps/web/package.json'));
const calcReqPath = path.join(rootDir, 'apps/calc/requirements.txt');
const calcReq = fs.existsSync(calcReqPath) ? fs.readFileSync(calcReqPath, 'utf8') : '';

const findings = [];

function ensureDependency(pkg, depName, scope, owner) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (!deps[depName]) {
    findings.push(`${owner}: dépendance manquante (${scope}) -> ${depName}`);
  }
}

ensureDependency(apiPkg, '@nestjs/bullmq', 'cache/queue', 'apps/api');
ensureDependency(apiPkg, '@prisma/client', 'backend crud', 'apps/api');
ensureDependency(apiPkg, '@nestjs/websockets', 'temps réel', 'apps/api');
ensureDependency(webPkg, 'socket.io-client', 'temps réel', 'apps/web');
ensureDependency(webPkg, 'react-hook-form', 'forms', 'apps/web');
ensureDependency(webPkg, 'zod', 'forms', 'apps/web');
ensureDependency(webPkg, 'tailwindcss', 'frontend', 'apps/web');

if (!/fastapi/i.test(calcReq)) {
  findings.push('apps/calc: requirement manquante -> fastapi');
}
if (!/pandas/i.test(calcReq)) {
  findings.push('apps/calc: requirement manquante -> pandas');
}

if (findings.length > 0) {
  console.error('Stack compliance check failed.');
  findings.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

console.log('Stack compliance check passed: declared stack aligns with installed core dependencies.');
