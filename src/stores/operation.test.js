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

import OperationStore from './operation';
import Retry from '../pages/cluster/containers/Cluster/Detail/Operation/actions/Retry';

jest.mock('utils/object.mapper', () => ({}));
jest.mock('containers/Action', () => ({ ConfirmAction: class {} }), {
  virtual: true,
});
jest.mock('stores', () => ({ rootStore: { operationStore: {} } }), {
  virtual: true,
});

const { operationStore } = require('stores').rootStore;

const clusterQuery = { labelSelector: 'kubeclipper.io/cluster=cluster-1' };
const latest = {
  id: 'latest',
  uid: 'latest-uid',
  resourceVersion: '42',
  phase: 'Failed',
  operationName: 'UpgradeCluster',
};
const older = {
  id: 'older',
  uid: 'older-uid',
  resourceVersion: '40',
  phase: 'Canceled',
  operationName: 'CreateCluster',
};

let store;
let retry;

beforeEach(() => {
  global.request = { get: jest.fn(), post: jest.fn() };
  store = new OperationStore();
  Object.setPrototypeOf(operationStore, store);
  retry = new Retry();
});

afterEach(() => {
  Object.setPrototypeOf(operationStore, Object.prototype);
  delete global.request;
});

it.each(['Failed', 'TimedOut', 'Canceled'])(
  'allows the latest %s upgrade to be retried',
  async (phase) => {
    const item = { ...latest, phase };
    request.get.mockResolvedValue({ items: [item, older] });
    await store.fetchList(clusterQuery);

    expect(retry.allowedCheckFunc(item)).toBe(true);
    expect(retry.allowedCheckFunc(older)).toBe(false);
  }
);

it('does not confuse a filtered historical failure with the latest operation', async () => {
  const item = { ...older, phase: 'Failed' };
  request.get.mockResolvedValue({ items: [latest, item] });
  await store.fetchList({ ...clusterQuery, operationName: 'CreateCluster' });

  expect(store.list.data.map(({ id }) => id)).toEqual(['older']);
  expect(retry.allowedCheckFunc(item)).toBe(false);
});

it('allows the actual latest upgrade when it matches the search', async () => {
  request.get.mockResolvedValue({ items: [latest, older] });
  await store.fetchList({ ...clusterQuery, operationName: 'UpgradeCluster' });

  expect(retry.allowedCheckFunc(latest)).toBe(true);
});

it('does not offer retry for the canceled first row on a later page', async () => {
  request.get
    .mockResolvedValueOnce({
      items: [latest],
      metadata: { continue: 'page-2' },
    })
    .mockResolvedValueOnce({ items: [older] });
  await store.fetchList({ ...clusterQuery, page: 2, limit: 1 });

  expect(store.list.page).toBe(2);
  expect(store.list.data[0].id).toBe('older');
  expect(retry.allowedCheckFunc(older)).toBe(false);
});

it.each(['Pending', 'Running', 'Succeeded'])(
  'does not retry a %s operation',
  async (phase) => {
    const item = { ...latest, phase };
    request.get.mockResolvedValue({ items: [item] });
    await store.fetchList(clusterQuery);
    expect(retry.allowedCheckFunc(item)).toBe(false);
  }
);

it.each(['BackupCluster', 'RecoveryCluster'])(
  'keeps the existing restriction on %s retry',
  async (operationName) => {
    const item = { ...latest, operationName };
    request.get.mockResolvedValue({ items: [item] });
    await store.fetchList(clusterQuery);
    expect(retry.allowedCheckFunc(item)).toBe(false);
  }
);

it.each(['BackupCluster', 'RecoveryCluster'])(
  'preserves retry for an already supported canceled %s operation',
  async (operationName) => {
    const item = { ...latest, operationName, phase: 'Canceled' };
    request.get.mockResolvedValue({ items: [item] });
    await store.fetchList(clusterQuery);
    expect(retry.allowedCheckFunc(item)).toBe(true);
  }
);

it('clears retry eligibility when the cluster list changes or fails to load', async () => {
  request.get.mockResolvedValueOnce({ items: [latest] });
  await store.fetchList(clusterQuery);
  request.get.mockRejectedValueOnce(new Error('unavailable'));
  await expect(
    store.fetchList({ labelSelector: 'kubeclipper.io/cluster=cluster-2' })
  ).rejects.toThrow('unavailable');
  expect(retry.allowedCheckFunc(latest)).toBe(false);
});

it('submits the original operation UID and resourceVersion on retry', async () => {
  store.submitting = (promise) => promise;
  request.post.mockResolvedValue({});
  await retry.onSubmit(latest);

  expect(request.post).toHaveBeenCalledWith(
    'api/operations.kubeclipper.io/v1alpha1/operations/latest/retry',
    { uid: 'latest-uid', resourceVersion: '42' }
  );
});

it.each(['uid', 'resourceVersion'])(
  'rejects retry without %s before sending a request',
  async (field) => {
    const item = { ...latest };
    delete item[field];
    await expect(retry.onSubmit(item)).rejects.toThrow(
      'operation UID and resourceVersion are required'
    );
    expect(request.post).not.toHaveBeenCalled();
  }
);

it('propagates server conflicts instead of reporting retry success', async () => {
  store.submitting = (promise) => promise;
  request.post.mockRejectedValue(
    new Error('only the latest operation may retry')
  );
  await expect(retry.onSubmit(latest)).rejects.toThrow(
    'only the latest operation may retry'
  );
});
