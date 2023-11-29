import { startUnleash, initialize } from 'unleash-client';
import config from '../config';

export async function getClient() {
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
    return await startUnleash({
      url: config.unleash.endpoint,
      appName: config.serviceName,
      customHeaders: { Authorization: config.unleash.clientKey },
    });
  }
}
