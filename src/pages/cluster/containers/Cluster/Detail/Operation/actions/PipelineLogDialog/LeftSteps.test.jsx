/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LeftSteps from './LeftSteps';

let mockSteps = [];
jest.mock(
  'stores',
  () => ({
    useRootStore: () => ({ operationStore: { operationSteps: mockSteps } }),
  }),
  { virtual: true }
);
jest.mock('mobx-react', () => ({ observer: (component) => component }));
jest.mock('hooks', () => ({ useDeepCompareEffect: () => {} }), {
  virtual: true,
});
jest.mock('utils', () => ({ toLocalTime: (time) => time }), { virtual: true });
jest.mock('antd', () => ({
  Skeleton: ({ children }) => children,
  Tooltip: ({ children }) => children,
}));
jest.mock('components/Status', () => ({ hoverText }) => (
  <span>{hoverText}</span>
));

beforeEach(() => {
  global.t = (value) => value;
});

it('omits an empty start time and explains ignored failures', () => {
  mockSteps = [
    {
      stepID: 'step',
      name: 'render',
      stepStatus: 'failed',
      errIgnore: true,
      status: [{}],
    },
  ];
  const html = renderToStaticMarkup(<LeftSteps activeByStep={() => {}} />);
  expect(html).toContain('Failure ignored');
  expect(html).not.toContain('>-<');
});

it('shows the start time when the task has started', () => {
  mockSteps = [
    {
      stepID: 'step',
      name: 'render',
      stepStatus: 'success',
      status: [{ startAt: '2026-10-28' }],
    },
  ];
  expect(renderToStaticMarkup(<LeftSteps activeByStep={() => {}} />)).toContain(
    '2026-10-28'
  );
});
