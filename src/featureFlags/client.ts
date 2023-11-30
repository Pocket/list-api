import { initialize, Unleash } from 'unleash-client';
import config from '../config';
import { serverLogger } from '../server/logger';

export function getClient() {
  class InMemCache {
    data: Record<string, string>;
    constructor() {
      this.data = {};
    }
    async set(key: string, data: any) {
      this.data[key] = JSON.stringify(data);
    }
    async get(key: string) {
      const data = this.data[key];
      return JSON.parse(data);
    }
  }
  let unleash: Unleash;
  if (config.app.environment.toLowerCase() === 'test') {
    // Local no-op client just to ensure all dependencies (e.g. ContextManager)
    // are constructed correctly.
    // Use `./mockClient` for tests that need to access actual (fake) feature
    // flags toggles.
    // (will construct a non-global unleash instance)
    // This will default to any fallback that's passed to it due to some
    // convoluted logic about bootstraps. See `./mockClient` for more
    // info on ensuring local data is used.
    unleash = initialize({
      appName: config.serviceName,
      url: config.unleash.endpoint,
      refreshInterval: 0,
      disableMetrics: true,
      bootstrap: { data: [] },
      storageProvider: new InMemCache(),
    });
  } else {
    // The actual unleash client. Note that this is not a blocking
    // call, so it's possible that the application uses stale toggles
    // on startup (defaults to any fallback values provided to `isEnabled`,
    // etc. until client is marked as ready).
    unleash = initialize({
      url: config.unleash.endpoint,
      appName: config.serviceName,
      customHeaders: { Authorization: config.unleash.clientKey },
      timeout: 2000, // ms
      namePrefix: 'temp.backend',
      refreshInterval: 60000, //ms
    });
    unleash.on('error', (err) =>
      serverLogger.error('Unleash errror', { data: err }),
    );
  }
  return unleash;
}
