import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const sources = [
  'src/features/operations/domain/model.ts',
  'src/features/operations/application/core.ts',
  'src/features/migration/domain/audit.ts',
  'src/features/migration/domain/target-contract.ts',
  'src/shared/config/runtime.ts',
  'src/shared/config/contracts-runtime.ts',
  'src/features/access/application/load-context.ts',
  'src/features/access/application/read-baseline.ts',
  'src/features/reports/domain/activity.ts',
  'src/features/reports/domain/cash.ts',
  'src/features/reports/exports/pdf.ts',
  'src/features/reports/exports/excel.ts',
];
const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', ...sources, '--rootDir', 'src', '--outDir', '.test-build', '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck', '--strict', '--esModuleInterop'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const tests = walk('tests/unit').filter(path => path.endsWith('.test.cjs')).sort();
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
process.exit(result.status ?? 1);
