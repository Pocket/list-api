import { startUnleash } from 'unleash-client';
import config from '../config';

export async function getClient() {
  return await startUnleash({
    url: config.unleash.endpoint,
    appName: config.serviceName,
    customHeaders: { Authorization: config.unleash.clientKey },
  });
}
