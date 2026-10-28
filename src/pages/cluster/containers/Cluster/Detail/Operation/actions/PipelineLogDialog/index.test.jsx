/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import PipelineLog from './index';

const mockStore = { list: {}, reset: jest.fn() };
jest.mock('containers/Action', () => ({ ViewAction: class {} }), {
  virtual: true,
});
jest.mock(
  'stores',
  () => ({
    rootStore: {
      get operationStore() {
        return mockStore;
      },
    },
  }),
  { virtual: true }
);
jest.mock(
  'stores/websocket',
  () =>
    class {
      close = jest.fn();
    }
);
jest.mock('utils/localStorage', () => ({ getToken: () => '' }));
jest.mock('./LeftSteps', () => () => null);
jest.mock('./RightLogContent', () => () => null);
jest.mock('utils/object.mapper', () => ({
  operations: (op, tasks) => ({
    status: op.status.phase,
    operationSteps: [{ stepID: 'one', nodes: [], status: tasks }],
    uid: op.metadata.uid,
  }),
}));

const operation = (uid, phase = 'Failed') => ({
  metadata: { uid },
  status: { phase },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  delete mockStore.currentOperation;
  delete mockStore.currentNodesByStep;
});

it('does not let an older Task query overwrite a new operation snapshot', async () => {
  const dialog = new PipelineLog({});
  const old = deferred();
  dialog.fetchTasks = jest
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(['new task']);
  const pending = dialog.updateOperation(operation('old'));
  await dialog.updateOperation(operation('new', 'Succeeded'));
  old.resolve(['old error']);
  await pending;
  expect(mockStore.currentOperation.uid).toBe('new');
  expect(mockStore.currentNodesByStep.status).toEqual(['new task']);
});

it('rejects an older concurrent query even when both use the same operation object', async () => {
  const dialog = new PipelineLog({});
  const op = operation('same');
  const old = deferred();
  dialog.fetchTasks = jest
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(['retry task']);
  const pending = dialog.updateOperation(op);
  await dialog.updateOperation(op);
  old.resolve(['previous attempt']);
  await pending;
  expect(mockStore.currentNodesByStep.status).toEqual(['retry task']);
});

it('does not combine an old refresh with a newer Operation from the watch', async () => {
  const dialog = new PipelineLog({});
  await dialog.updateOperation(operation('old'), ['old task']);
  const old = deferred();
  dialog.fetchTasks = jest.fn().mockReturnValueOnce(old.promise);
  const pending = dialog.refreshTasks();
  await dialog.updateOperation(operation('new'), ['new task']);
  old.resolve(['late old task']);
  await pending;
  expect(mockStore.currentOperation.uid).toBe('new');
  expect(mockStore.currentNodesByStep.status).toEqual(['new task']);
});

it('ignores responses after unmount and preserves the current shared store', async () => {
  const dialog = new PipelineLog({});
  const old = deferred();
  dialog.fetchTasks = jest.fn().mockReturnValueOnce(old.promise);
  const pending = dialog.updateOperation(operation('old'));
  dialog.componentWillUnmount();
  mockStore.currentOperation = { uid: 'next-dialog' };
  old.resolve(['late']);
  await pending;
  expect(mockStore.currentOperation.uid).toBe('next-dialog');
  expect(mockStore.currentNodesByStep).toBeUndefined();
});

it('ignores an initial Operation read after a newer watch snapshot arrives', async () => {
  const dialog = new PipelineLog({});
  Object.defineProperty(dialog, 'item', { value: { name: 'operation' } });
  const old = deferred();
  global.request = { get: jest.fn().mockReturnValueOnce(old.promise) };
  const pending = dialog.loadOperation();
  await dialog.updateOperation(operation('current', 'Succeeded'), ['current']);
  old.resolve(operation('old'));
  await pending;
  expect(mockStore.currentOperation.uid).toBe('current');
  delete global.request;
});
