/*
 * Copyright 2021 KubeClipper Authors.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import LogStore from './log';

jest.mock('utils/object.mapper', () => ({}));

beforeEach(() => {
  global.request = { get: jest.fn() };
});

afterEach(() => {
  delete global.request;
});

it('ends loading and exposes an error when the initial log request fails', async () => {
  const store = new LogStore();
  store.isExpand = true;
  request.get.mockRejectedValue({
    reason: 'agent Task log endpoint is unavailable',
  });

  await store.fetchStepLog({ taskName: 'task-1' });

  expect(store.isLoading).toBe(false);
  expect(store.isExpand).toBe(true);
  expect(store.logError).toBe('agent Task log endpoint is unavailable');
  expect(store.logdata).toBe('');
  expect(store.cumulativeSize).toBe(0);
});

it('retries from the last received offset without losing or duplicating logs', async () => {
  const store = new LogStore();
  store.isStepFinished = true;
  request.get
    .mockResolvedValueOnce({ content: 'first', deliverySize: 5, logSize: 11 })
    .mockRejectedValueOnce(new Error('connection lost'));

  await store.getStepLog({ taskName: 'task-1' });
  expect(store.isLoading).toBe(false);
  expect(store.logError).toBe('connection lost');
  expect(store.logdata).toBe('first');
  expect(store.cumulativeSize).toBe(5);

  request.get.mockResolvedValueOnce({
    content: 'second',
    deliverySize: 6,
    logSize: 11,
  });
  await store.getStepLog({ taskName: 'task-1', offset: store.cumulativeSize });

  expect(request.get).toHaveBeenLastCalledWith(
    'api/operations.kubeclipper.io/v1alpha1/operationtasks/task-1/logs',
    { offset: 5 }
  );
  expect(store.logError).toBe('');
  expect(store.isLoading).toBe(false);
  expect(store.logdata).toBe('firstsecond');
  expect(store.cumulativeSize).toBe(11);
});

it('ends loading and allows retry when expanding a failed log request', async () => {
  const store = new LogStore();
  request.get.mockRejectedValue(new Error('request failed'));

  await store.getStepLog({ taskName: 'task-1' });

  expect(store.isLoading).toBe(false);
  expect(store.logError).toBe('request failed');
});

it.each(['resolve', 'reject'])(
  'ignores a late %s after reset without reopening the log',
  async (outcome) => {
    let finish;
    request.get.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish =
            outcome === 'resolve'
              ? () => resolve({ content: 'old', deliverySize: 3 })
              : () => reject(new Error('old error'));
        })
    );
    const store = new LogStore();
    store.isExpand = true;
    const oldRead = store.getStepLog({ taskName: 'old-task' });
    store.isExpand = false;
    store.logReset();
    finish();
    await oldRead;
    expect(store.logdata).toBe('');
    expect(store.logError).toBe('');
    expect(store.cumulativeSize).toBe(0);
    expect(store.isExpand).toBe(false);
    expect(store.isLoading).toBe(false);
  }
);

it('serializes a terminal read behind an in-flight poll using the delivered byte offset', async () => {
  let finish;
  request.get
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce({ content: 'tail', deliverySize: 4, logSize: 7 });
  const store = new LogStore();
  const poll = store.fetchStepLog({ taskName: 'task-1' });
  store.isStepFinished = true;
  const tail = store.fetchStepLog({ taskName: 'task-1' });
  expect(request.get).toHaveBeenCalledTimes(1);
  finish({ content: '中', deliverySize: 3, logSize: 3 });
  await Promise.all([poll, tail]);
  expect(request.get).toHaveBeenLastCalledWith(expect.any(String), {
    offset: 3,
  });
  expect(store.logdata).toBe('中tail');
  expect(store.cumulativeSize).toBe(7);
});

it('allows a fresh read after reset while the old request remains pending', async () => {
  let finish;
  request.get
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce({ content: 'new', deliverySize: 3, logSize: 3 });
  const store = new LogStore();
  const oldRead = store.getStepLog({ taskName: 'task-1' });
  store.logReset();
  await store.getStepLog({ taskName: 'task-2' });
  finish({ content: 'old', deliverySize: 3, logSize: 3 });
  await oldRead;
  expect(store.logdata).toBe('new');
  expect(store.cumulativeSize).toBe(3);
  expect(store.isLoading).toBe(false);
});
