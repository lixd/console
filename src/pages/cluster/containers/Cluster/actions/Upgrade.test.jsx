/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import Upgrade from './Upgrade';

jest.mock('mobx-react', () => ({ observer: (component) => component }));
jest.mock('containers/Action', () => ({
  ModalAction: class {
    constructor(props) {
      this.props = props;
      this.item = props.item;
      this.state = { targetVersions: [] };
    }
  },
}));
jest.mock('stores', () => ({ rootStore: {} }));

beforeEach(() => {
  global.t = (value) => value;
});

const action = (workers = []) => {
  const form = new Upgrade({
    item: {
      name: 'cluster',
      kubernetesVersion: 'v1.36.4',
      masters: [{ id: 'master' }],
      workers,
    },
  });
  form.store = { upgrade: jest.fn() };
  return form;
};

it('requires explicit maintenance consent and explains application PDB impact', async () => {
  const form = action();
  const field = form.formItems.find(
    ({ name }) => name === 'singleNodeMaintenance'
  );
  expect(field.hidden).toBe(false);
  expect(field.content).toContain('including application workloads');
  await expect(field.rules[0].validator(null, false)).rejects.toBeDefined();
  await expect(field.rules[0].validator(null, true)).resolves.toBeUndefined();
  form.onSubmit({ version: 'v1.37.0', singleNodeMaintenance: true });
  expect(form.store.upgrade).toHaveBeenCalledWith(
    { version: 'v1.37.0', singleNodeMaintenance: true },
    { cluster: 'cluster' }
  );
});

it('keeps normal PDB protection for multiple nodes', () => {
  const form = action([{ id: 'worker' }]);
  expect(
    form.formItems.find(({ name }) => name === 'singleNodeMaintenance').hidden
  ).toBe(true);
  form.onSubmit({ version: 'v1.37.0', singleNodeMaintenance: true });
  expect(form.store.upgrade).toHaveBeenCalledWith(
    { version: 'v1.37.0', singleNodeMaintenance: false },
    { cluster: 'cluster' }
  );
});

it('explains the minimum source version before submission', async () => {
  const form = action();
  form.item.kubernetesVersion = 'v1.35.8';
  const field = form.formItems.find(({ name }) => name === 'version');
  await expect(field.rules[1].validator(null, 'v1.36.4')).rejects.toContain(
    'starting from v1.36.4'
  );
});
