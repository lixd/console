/* Copyright 2026 KubeClipper Authors. Licensed under the Apache License, Version 2.0. */
export const registryAddress = ({
  scheme = 'https',
  host = '',
  repositoryPrefix = '',
} = {}) =>
  `${scheme}://${host}${repositoryPrefix ? `/${repositoryPrefix}` : ''}`;

export const parseRegistryAddress = (value = '') => {
  if (!/^https?:\/\//.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.search || url.hash)
      return null;
    const repositoryPrefix = url.pathname.replace(/^\//, '');
    if (
      repositoryPrefix &&
      !repositoryPrefix
        .split('/')
        .every((part) => /^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*$/.test(part))
    )
      return null;
    if (value.split('/').some((part) => part === '.' || part === '..'))
      return null;
    return {
      scheme: url.protocol.slice(0, -1),
      host: url.host,
      repositoryPrefix,
    };
  } catch (error) {
    return null;
  }
};

export const registryAddressError = (registry = {}) => {
  const parsed = parseRegistryAddress(registryAddress(registry));
  return parsed && !registry.host?.includes('/')
    ? ''
    : 'Invalid registry address. Check the registry configuration.';
};
