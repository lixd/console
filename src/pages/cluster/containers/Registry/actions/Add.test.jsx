/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import Add from './Add';

jest.mock('mobx-react', () => ({ observer: (component) => component }));
jest.mock('containers/Action', () => ({ ModalAction: class {} }));
jest.mock('stores', () => ({ rootStore: {} }));
jest.mock('utils/form.templates', () => ({
  __esModule: true,
  default: { registries: () => ({ kind: 'Registry', metadata: {} }) },
}));

beforeEach(() => {
  global.t = (value) => value;
});

const form = () => {
  const item = new Add();
  item.store = {
    list: {
      data: [
        { scheme: 'https', host: 'registry.test', repositoryPrefix: 'old' },
      ],
    },
    create: jest.fn((data) => data),
  };
  item.formRef = {
    current: {
      getFieldValue: () => ({ prefix: 'https', ip: 'registry.test' }),
    },
  };
  return item;
};

it('accepts a complete address with a path and rejects duplicates and invalid paths', async () => {
  const item = form();
  await expect(
    item.checkAddress(null, 'https://registry.test/new')
  ).resolves.toBeUndefined();
  await expect(
    item.checkAddress(null, 'https://registry.test/old')
  ).rejects.toBe('Registry Repeat');
  await Promise.all(
    [
      'registry.test/new',
      'https://registry.test/new/',
      'https://registry.test/../new',
      'https://user:pass@registry.test/new',
    ].map((address) =>
      expect(item.checkAddress(null, address)).rejects.toBeDefined()
    )
  );
});

it('submits the repository path and only includes enabled authentication', () => {
  const item = form();
  const values = {
    name: 'mirror',
    address: 'https://registry.test/offline',
    tlsCheck: true,
    authEnabled: true,
    registryUsername: 'test-user',
    registryPassword: 'test-token',
  };
  expect(item.onSubmit(values)).toMatchObject({
    host: 'registry.test',
    repositoryPrefix: 'offline',
    auth: { username: 'test-user', password: 'test-token' },
  });
  expect(item.onSubmit({ ...values, authEnabled: false })).not.toHaveProperty(
    'auth'
  );
});
