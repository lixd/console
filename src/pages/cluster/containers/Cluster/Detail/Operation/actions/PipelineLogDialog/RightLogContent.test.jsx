/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import RightLogContent from './RightLogContent';

let mockView;
const mockLogStores = [];

jest.mock(
  'stores',
  () => ({
    useRootStore: () => ({ operationStore: mockView }),
  }),
  { virtual: true }
);
jest.mock('stores/log', () => ({
  __esModule: true,
  default: class {
    logdata = '';

    logError = '';

    isExpand = false;

    isLoading = false;

    cumulativeSize = 0;

    fetchStepLog = jest.fn(() => Promise.resolve());

    getStepLog = jest.fn(() => Promise.resolve());

    logReset = jest.fn(() => {
      this.logdata = '';
      this.logError = '';
      this.cumulativeSize = 0;
    });

    constructor() {
      mockLogStores.push(this);
    }
  },
}));
jest.mock('hooks', () => ({ useInterval: () => {} }), { virtual: true });
jest.mock('utils', () => ({ formatSeconds: () => '' }), { virtual: true });
jest.mock('mobx-react', () => ({ observer: (component) => component }));
jest.mock('antd', () => ({
  Spin: () => <span>loading</span>,
  Alert: ({ message, description, action, className }) => (
    <div role="alert" className={className}>
      {message}
      {description}
      {action}
    </div>
  ),
  Button: ({ children, onClick }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
jest.mock('@ant-design/icons', () => ({
  CaretRightOutlined: () => null,
  CaretDownOutlined: () => null,
  CheckCircleFilled: () => null,
  CloseCircleFilled: () => null,
}));

const view = (
  status,
  nodes = [{ id: 'node-1', uid: 'node-uid', ipv4: '10.0.0.1' }]
) => ({
  currentNodesByStep: { stepID: 'step-1', nodes, status },
  activeStepIndex: 0,
});

beforeEach(() => {
  global.t = (value) => value;
  mockLogStores.length = 0;
  Element.prototype.scrollIntoView = jest.fn();
});

it.each(['Failed', 'TimedOut', 'Canceled'])(
  'shows %s task reason and message with empty collapsed logs',
  (status) => {
    mockView = view([
      {
        status,
        taskName: 'task-1',
        reason: 'ExecutorFailed',
        message: 'connect: connection refused',
      },
    ]);
    const html = renderToStaticMarkup(<RightLogContent />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('ExecutorFailed');
    expect(html).toContain('connect: connection refused');
  }
);

it('supports reason-only failures, absent details and text escaping', () => {
  mockView = view([{ status: 'TimedOut', reason: 'DeadlineExceeded' }]);
  expect(renderToStaticMarkup(<RightLogContent />)).toContain(
    'DeadlineExceeded'
  );
  mockView = view([{ status: 'Failed' }]);
  expect(renderToStaticMarkup(<RightLogContent />)).not.toContain(
    'role="alert"'
  );
  mockView = view([{ status: 'Failed', message: '<script>alert(1)</script>' }]);
  const html = renderToStaticMarkup(<RightLogContent />);
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
});

it('explains a previous task that timed out before it started', () => {
  mockView = view([
    {
      status: 'Canceled',
      reason: 'OperationDeadlineExceededBeforeStart',
      previousAttempt: true,
    },
  ]);
  const html = renderToStaticMarkup(<RightLogContent />);
  expect(html).toContain('Operation timed out before this task started');
  expect(html).toContain('Task canceled');
  expect(html).toContain('Previous attempt');
  expect(html).not.toContain('OperationDeadlineExceededBeforeStart');
  expect(html).toContain('10.0.0.1');
});

it('keeps task failure and existing output visible while reading logs, separately from read errors', async () => {
  mockView = view([
    { status: 'Failed', taskName: 'task-1', message: 'executor failed' },
  ]);
  let wrapper;
  await act(async () => {
    wrapper = mount(<RightLogContent />);
  });
  const store = mockLogStores[0];
  store.isExpand = true;
  store.isLoading = true;
  store.logdata = 'already received output';
  store.logError = 'log endpoint unavailable';
  mockView = {
    ...mockView,
    currentNodesByStep: { ...mockView.currentNodesByStep },
  };
  wrapper.setProps({});
  expect(wrapper.text()).toContain('executor failed');
  expect(wrapper.text()).toContain('log endpoint unavailable');
  expect(wrapper.text()).toContain('already received output');
  wrapper.find('button').simulate('click');
  expect(store.getStepLog).toHaveBeenCalledWith({
    taskName: 'task-1',
    offset: 0,
  });
  expect(wrapper.text()).toContain('executor failed');
  wrapper.unmount();
});

it('clears the old error and log store when a retry creates a new Task UID', async () => {
  mockView = view([
    {
      status: 'Failed',
      taskName: 'same-name',
      taskUID: 'old-uid',
      message: 'old failure',
    },
  ]);
  let wrapper;
  await act(async () => {
    wrapper = mount(<RightLogContent />);
  });
  const oldStore = mockLogStores[0];
  oldStore.logdata = 'old logs';
  oldStore.isExpand = true;
  mockView = view([
    { status: 'Succeeded', taskName: 'same-name', taskUID: 'new-uid' },
  ]);
  await act(async () => {
    wrapper.setProps({});
  });
  expect(mockLogStores).toHaveLength(2);
  expect(oldStore.logReset).toHaveBeenCalled();
  expect(wrapper.text()).not.toContain('old failure');
  expect(wrapper.text()).not.toContain('old logs');
  wrapper.unmount();
});

it('keeps errors attached to their nodes after node order or step changes', async () => {
  const nodes = [
    { id: 'one', uid: 'one' },
    { id: 'two', uid: 'two' },
  ];
  const statuses = [
    { status: 'Failed', taskName: 'task-one', message: 'one failed' },
    { status: 'Failed', taskName: 'task-two', message: 'two failed' },
  ];
  mockView = view(statuses, nodes);
  let wrapper;
  await act(async () => {
    wrapper = mount(<RightLogContent />);
  });
  mockView = view([...statuses].reverse(), [...nodes].reverse());
  await act(async () => {
    wrapper.setProps({});
  });
  const alerts = wrapper.find('[role="alert"]');
  expect(alerts.at(0).text()).toContain('two failed');
  expect(alerts.at(0).text()).not.toContain('one failed');
  expect(mockLogStores[0].logReset).not.toHaveBeenCalled();
  mockView = {
    ...view([{ status: 'Running', taskName: 'other-step' }]),
    activeStepIndex: 1,
  };
  await act(async () => {
    wrapper.setProps({});
  });
  expect(wrapper.text()).not.toContain('failed');
  wrapper.unmount();
});

it('fetches the terminal tail after a running task completes', async () => {
  mockView = view([{ status: 'Running', taskName: 'task-1' }]);
  let wrapper;
  await act(async () => {
    wrapper = mount(<RightLogContent />);
  });
  const store = mockLogStores[0];
  store.isExpand = true;
  store.cumulativeSize = 12;
  mockView = view([
    { status: 'Failed', taskName: 'task-1', message: 'final failure' },
  ]);
  await act(async () => {
    wrapper.setProps({});
  });
  expect(store.fetchStepLog).toHaveBeenLastCalledWith({
    taskName: 'task-1',
    offset: 12,
  });
  expect(store.fetchStepLog).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});
