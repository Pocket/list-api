import { Unleash, UnleashConfig } from 'unleash-client';

const client = (bootstrap?: UnleashConfig['bootstrap']) => {
  const unleash = new Unleash({
    appName: 'test-app',
    url: 'https://whatever.com/api',
    refreshInterval: 0,
    disableMetrics: true,
    bootstrap,
  });
  return unleash;
};

export default client;
