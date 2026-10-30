const fs = require('node:fs');
const ts = require('typescript');

// Load an aliased TSX dependency while preserving each harness's explicit mocks.
function loadSourceModule(name, localRequire) {
  const filename = `src/${name.slice(2)}.tsx`;
  if (!name.startsWith('@/') || !fs.existsSync(filename)) return undefined;
  const child = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(localRequire, child, child.exports);
  return child.exports;
}
module.exports = { loadSourceModule };
