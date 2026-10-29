/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { Form, Select } from 'antd';
import Cluster from './Cluster';

jest.mock('mobx-react', () => ({ observer: (component) => component }));
jest.mock('components/Form', () => {
  const ReactModule = require('react');
  return class BaseForm extends ReactModule.Component {};
});
jest.mock('stores', () => ({ rootStore: {} }));

const registryField = (offline, registries = []) => {
  const form = new Cluster({ context: { offline } });
  form.state = {};
  form.registryStore = { list: { data: registries } };
  form.backupPointStore = { list: { data: [] } };
  return form.formItems[0].find((item) => item.name === 'imageRegistry');
};

const validate = async (field, value) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ref = React.createRef();
  ReactDOM.render(
    <Form ref={ref} initialValues={{ imageRegistry: value }}>
      <Form.Item name={field.name} rules={field.rules}>
        <Select options={field.options} />
      </Form.Item>
    </Form>,
    container
  );
  try {
    let result;
    let error;
    await act(async () => {
      try {
        result = await ref.current.validateFields();
      } catch (err) {
        error = err;
      }
    });
    if (error) throw error;
    return result;
  } finally {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  }
};

beforeEach(() => {
  global.t = (value) => value;
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
});

it('requires a registry before proceeding', async () => {
  const field = registryField(true, [
    { name: 'mirror', scheme: 'https', host: 'example.test' },
  ]);
  await expect(validate(field, '')).rejects.toMatchObject({
    errorFields: [
      {
        name: ['imageRegistry'],
        errors: ['Please select a Registry resource'],
      },
    ],
  });
  await expect(validate(field, 'mirror')).resolves.toMatchObject({
    imageRegistry: 'mirror',
  });
});

it('requires a registry and explains an empty list', async () => {
  await expect(validate(registryField(false), '')).rejects.toHaveProperty(
    'errorFields'
  );
  expect(registryField(true).extra).toBe(
    'Please configure a Registry resource first'
  );
});

it('shows one image source control and disables invalid legacy registry addresses', async () => {
  const field = registryField(false, [
    { name: 'legacy', scheme: 'http', host: 'registry.test/offline' },
  ]);
  expect(field.options[0].disabled).toBe(true);
  expect(field.options[0].label).toContain(
    'legacy — Invalid registry address (http://'
  );
  expect(field.options[0].title).toBe(
    'Invalid registry address. Check the registry configuration.'
  );
  await expect(validate(field, 'legacy')).rejects.toMatchObject({
    errorFields: [
      {
        errors: ['Invalid registry address. Check the registry configuration.'],
      },
    ],
  });
  await expect(validate(field, 'removed')).rejects.toMatchObject({
    errorFields: [
      {
        errors: [
          'The selected image registry no longer exists. Select another source.',
        ],
      },
    ],
  });
});

it('changes image source without resetting versions', () => {
  const form = new Cluster({
    context: {
      kubernetesVersion: 'v1.37.0',
      packageRegistry: 'packages.test/release',
    },
  });
  form.updateContext = jest.fn();
  form.updateFormVersions = jest.fn();
  form.onImageRegistryChange('mirror');
  expect(form.updateContext).toHaveBeenLastCalledWith({
    imageRegistry: 'mirror',
  });
  form.onImageRegistryChange('');
  expect(form.updateContext).toHaveBeenLastCalledWith({
    imageRegistry: '',
  });
  expect(form.updateFormVersions).not.toHaveBeenCalled();
});

it('retains versions and source selections when revisiting the cluster step', async () => {
  const form = new Cluster({
    context: {
      kubernetesVersion: 'v1.35.8',
      containerdVersion: '1.7.29',
      imageRegistry: 'mirror',
    },
  });
  form.store = {
    versions: [
      { version: 'v1.37.0', version_control: {}, archs: ['amd64'] },
      { version: 'v1.35.8', version_control: {}, archs: ['amd64'] },
    ],
  };
  form.updateContext = jest.fn();
  form.updateFormVersions = jest.fn();
  form.updateFormValue = jest.fn();
  await form.initVersions();
  expect(form.updateContext.mock.calls[0][0]).toMatchObject({
    kubernetesVersion: 'v1.35.8',
    containerdVersion: '1.7.29',
  });
  expect(form.updateContext.mock.calls[0][0]).not.toHaveProperty(
    'imageRegistry'
  );
  expect(form.updateContext.mock.calls[0][0]).not.toHaveProperty('offline');
});

it('selects the platform default without replacing an existing source', async () => {
  const form = new Cluster({ context: {} });
  form.store = {
    defaultImageRegistry: 'platform',
    fetchCreationMetadata: jest.fn(),
  };
  form.initVersions = jest.fn();
  form.setState = jest.fn();
  form.updateContext = jest.fn();
  form.updateFormValue = jest.fn();
  await form.loadCreationMetadata();
  expect(form.updateFormValue).toHaveBeenCalledWith(
    'imageRegistry',
    'platform'
  );
  form.props.context.imageRegistry = 'custom';
  form.updateFormValue.mockClear();
  await form.loadCreationMetadata();
  expect(form.updateFormValue).not.toHaveBeenCalled();
});
