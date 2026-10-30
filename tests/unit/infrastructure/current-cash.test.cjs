const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createOperations } = require('../../../.test-build/features/operations/application/core.js');
const model = require('../../../.test-build/features/operations/domain/model.js');

function harness() {
  let state, cleanup;
  const subscriptions = [];
  const localRequire = name => {
    if (name === 'react') return {
      useState: initial => { state = initial; return [state, value => { state = value; }]; },
      useEffect: effect => { cleanup = effect(); },
    };
    if (name === '../../../infrastructure/firebase/client') return { db: {} };
    if (name === '../../operations/domain/model') return model;
    if (name === 'firebase/firestore') return {
      doc: (_, collection, id) => `${collection}/${id}`,
      onSnapshot: (path, next, error) => {
        const sub = { path, next, error, stopped: false };
        subscriptions.push(sub);
        return () => { sub.stopped = true; };
      },
    };
    throw new Error(name);
  };
  const code = ts.transpileModule(fs.readFileSync('src/features/cash/hooks/useCurrentCash.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports);
  compiled.exports.useCurrentCash();
  const emit = (sub, data, id = 'c') => sub.next({ data: () => data, id });
  return { subscriptions, emit, state: () => state, cleanup: () => cleanup() };
}

// Feed the listener snapshots produced by the same operations that Caja uses.
test('current cash listener shows $12 then $7 after an actual $5 cash tip expense, safely retried', async () => {
  const docs = new Map();
  const api = createOperations(async work => {
    const writes = [];
    const result = await work({
      get: async path => docs.has(path) ? structuredClone(docs.get(path)) : undefined,
      set: (path, value, merge) => writes.push([path, value, merge]),
    });
    for (const [path, value, merge] of writes) docs.set(path, { ...(merge ? docs.get(path) : {}), ...value });
    return result;
  }, () => ({ seconds: 1 }), () => 'movement');
  await api.openCash(12, 'c');
  const h = harness();
  h.emit(h.subscriptions[0], docs.get('cashControl/current'));
  const session = h.subscriptions[1];
  h.emit(session, docs.get('cashSessions/c'));
  assert.equal(h.state().session.balances.Efectivo, 12);
  await api.cashMove(5, 'Efectivo', 'expense', 'Pago de propinas', 'tip-payment');
  await api.cashMove(5, 'Efectivo', 'expense', 'Pago de propinas', 'tip-payment');
  h.emit(session, docs.get('cashSessions/c'));
  assert.equal(h.state().session.balances.Efectivo, 7);
  assert.equal(h.state().session.expenses, 5);
  h.cleanup();
  assert.ok(h.subscriptions.every(s => s.stopped));
});

test('switching and closing cash clears old balances and ignores obsolete callbacks', () => {
  const h = harness();
  const control = h.subscriptions[0];
  h.emit(control, { sessionId: 'one' });
  const old = h.subscriptions[1];
  h.emit(control, { sessionId: 'two' });
  assert.ok(old.stopped);
  assert.equal(h.state().loading, true);
  h.emit(old, { status: 'open', balances: model.emptyBalances(), openingAmount: 0, receipts: 0, tips: 0, expenses: 0 });
  assert.equal(h.state().session, null);
  old.error();
  assert.equal(h.state().error, '');
  const current = h.subscriptions[2];
  h.emit(current, { status: 'closed', balances: model.emptyBalances(), openingAmount: 0, receipts: 0, tips: 0, expenses: 0 });
  assert.equal(h.state().session, null);
  h.emit(control, { sessionId: null });
  assert.ok(current.stopped);
  assert.equal(h.state().loading, false);
  h.cleanup();
});

test('invalid cash data and denied reads never display an invented zero or stale balance', () => {
  const h = harness();
  const control = h.subscriptions[0];
  h.emit(control, { sessionId: 'c' });
  h.emit(h.subscriptions[1], { status: 'open' });
  assert.ok(h.state().error);
  assert.equal(h.state().session, null);
  control.error();
  assert.ok(h.subscriptions[1].stopped);
  assert.equal(h.state().loading, false);
  h.emit(control, { sessionId: 'invalid/path' });
  assert.equal(h.subscriptions.length, 2);
  h.cleanup();
});
