#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const findings = [];

function rel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dirPath, predicate, output = []) {
  if (!fs.existsSync(dirPath)) {
    return output;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, predicate, output);
      continue;
    }
    if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function assertDtoValidation() {
  const dtoFiles = listFiles(
    path.join(rootDir, 'apps/api/src/modules'),
    (file) => file.endsWith('.dto.ts'),
  );

  const skippedByConvention = new Set(['approve-budget.dto.ts']);

  for (const filePath of dtoFiles) {
    const base = path.basename(filePath);
    if (base.includes('response.dto') || skippedByConvention.has(base)) {
      continue;
    }

    const content = read(filePath);
    const hasDtoClass = /class\s+\w+Dto\s*\{/.test(content);
    if (!hasDtoClass) {
      continue;
    }

    const emptyDtoClass = /class\s+\w+Dto\s*\{\s*\}/.test(content);
    if (emptyDtoClass) {
      continue;
    }

    const hasClassValidatorImport = /from\s+['"]class-validator['"]/.test(content);
    if (!hasClassValidatorImport) {
      findings.push({
        rule: 'SBD_DTO_VALIDATION',
        file: filePath,
        message: 'DTO d\'entrée sans class-validator',
      });
    }
  }
}

function assertOrgScopeOnSensitivePrismaAccess() {
  const sensitiveModules = [
    'budgets',
    'transactions',
    'imports',
    'cash-flow',
    'scenarios',
    'kpis',
    'dashboard',
    'alerts',
    'bank-accounts',
    'comments',
    'reports',
  ];

  for (const moduleName of sensitiveModules) {
    const modulePath = path.join(rootDir, `apps/api/src/modules/${moduleName}`);
    const files = listFiles(
      modulePath,
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.integration.spec.ts') &&
        !file.includes('/dto/'),
    );

    for (const filePath of files) {
      const content = read(filePath);
      if (!/this\.prisma\./.test(content)) {
        continue;
      }

      const hasOrgGuard = /org_id|orgId/.test(content);
      if (!hasOrgGuard) {
        findings.push({
          rule: 'SBD_ORG_SCOPE',
          file: filePath,
          message: 'Accès Prisma sensible sans marqueur org_id/orgId détecté',
        });
      }
    }
  }
}

function assertImportMimeControls() {
  const controllerPath = path.join(rootDir, 'apps/api/src/modules/imports/imports.controller.ts');
  const servicePath = path.join(rootDir, 'apps/api/src/modules/imports/imports.service.ts');

  if (!fs.existsSync(controllerPath) || !fs.existsSync(servicePath)) {
    findings.push({
      rule: 'SBD_IMPORT_GUARD',
      file: controllerPath,
      message: 'Module import introuvable',
    });
    return;
  }

  const controller = read(controllerPath);
  const service = read(servicePath);

  const controllerChecks = [/FileInterceptor\(/, /fileFilter:/, /mimetype/, /ParseFilePipeBuilder/];
  const serviceChecks = [/ALLOWED_IMPORT_MIME_TYPES/, /hasXlsxZipSignature/, /IMPORT_FILE_SIGNATURE_INVALID/];

  for (const check of controllerChecks) {
    if (!check.test(controller)) {
      findings.push({
        rule: 'SBD_IMPORT_MIME',
        file: controllerPath,
        message: `Contrôle import manquant (controller): ${check}`,
      });
    }
  }

  for (const check of serviceChecks) {
    if (!check.test(service)) {
      findings.push({
        rule: 'SBD_IMPORT_MIME',
        file: servicePath,
        message: `Contrôle import manquant (service): ${check}`,
      });
    }
  }
}

function assertNoHardcodedSecrets() {
  const scanRoots = [
    path.join(rootDir, 'apps/api/src'),
    path.join(rootDir, 'apps/web/src'),
    path.join(rootDir, 'apps/calc'),
  ];

  const fileRegex = /\.(ts|tsx|js|jsx|py|env|ya?ml|json)$/i;
  const patterns = [
    { rule: 'SBD_SECRET_HARDCODED', regex: /AKIA[0-9A-Z]{16}/, message: 'AWS key hardcodée' },
    { rule: 'SBD_SECRET_HARDCODED', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, message: 'Clé privée hardcodée' },
    { rule: 'SBD_SECRET_HARDCODED', regex: /(JWT_SECRET|JWT_REFRESH_SECRET|SECRET_KEY)\s*[:=]\s*['"][^'"\n]{8,}['"]/i, message: 'Secret hardcodé' },
  ];

  for (const scanRoot of scanRoots) {
    const files = listFiles(scanRoot, (file) => fileRegex.test(file));
    for (const filePath of files) {
      const content = read(filePath);
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        for (const pattern of patterns) {
          if (pattern.regex.test(line)) {
            findings.push({
              rule: pattern.rule,
              file: filePath,
              line: index + 1,
              message: pattern.message,
            });
          }
        }
      });
    }
  }
}

assertDtoValidation();
assertOrgScopeOnSensitivePrismaAccess();
assertImportMimeControls();
assertNoHardcodedSecrets();

if (findings.length > 0) {
  console.error('Compliance check failed: SBD mechanical controls violations found.');
  for (const finding of findings) {
    const location = finding.line ? `${rel(finding.file)}:${finding.line}` : rel(finding.file);
    console.error(`- [${finding.rule}] ${location} - ${finding.message}`);
  }
  process.exit(1);
}

console.log('Compliance check passed: SBD mechanical controls validated.');
