import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const errors = [];
for (const file of walk('src').map(path => path.replaceAll('\\', '/')).filter(path => /\.tsx?$/.test(path))) {
  const source = readFileSync(file, 'utf8');
  const imports = [...source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)].map(match => match[1]);
  for (const specifier of imports) {
    if (/^@\/(lib|components|types)(\/|$)/.test(specifier)) errors.push(`${file}: ruta anterior ${specifier}`);
    const base = specifier.startsWith('@/') ? resolve('src', specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(file), specifier) : null;
    if (base && !['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.css'].some(suffix => existsSync(base + suffix))) errors.push(`${file}: importación inexistente ${specifier}`);
    const normalizedBase = base?.replaceAll('\\', '/');
    const pure = file.includes('/domain/') || file.includes('/application/');
    if (pure && (specifier.startsWith('firebase') || specifier === 'react' || specifier.startsWith('next/') || (base && /\/(infrastructure|components|hooks|providers)\//.test(normalizedBase)))) errors.push(`${file}: la lógica de negocio depende de ${specifier}`);
    if (file.startsWith('src/shared/') && normalizedBase?.includes('/features/')) errors.push(`${file}: shared depende de un módulo funcional`);
    if (/^src\/app\/.*page\.tsx$/.test(file) && specifier.startsWith('firebase')) errors.push(`${file}: una ruta no debe acceder directamente a Firebase`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Arquitectura válida: importaciones resueltas y reglas de dependencia respetadas.');
