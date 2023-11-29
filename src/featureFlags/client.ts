import { initialize } from 'unleash-client';
import config from '../config';
import { serverLogger } from '../server/logger';

export function getClient() {
  if (config.app.environment.toLowerCase() === 'test') {
    // Local no-op client just to pass through
    // Use unleashMock in test utils for bootstrapping a non-global client instance
    return initialize({
      appName: config.serviceName,
      url: config.unleash.endpoint,
      refreshInterval: 0,
      disableMetrics: true,
      bootstrap: { data: [] },
    });
  } else {
    const unleash = initialize({
      url: config.unleash.endpoint,
      appName: config.serviceName,
      customHeaders: { Authorization: config.unleash.clientKey },
      timeout: 2000, // ms
      namePrefix: 'temp.backend',
      refreshInterval: 60000, //ms
    });
    unleash.on('error', (err) =>
      serverLogger.error('Unleash errror', { data: err })
    );
    return unleash;
  }
}
