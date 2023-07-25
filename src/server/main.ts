//this must run before all imports and server start
//so open-telemetry can patch all libraries that we use
import { nodeSDKBuilder } from './tracing';
import { startServer, serverLogger } from '../server/apollo';
import config from '../config';

nodeSDKBuilder().then(async () => {
  const { url } = await startServer(config.app.port);
  serverLogger.info(
    `🚀 Public server ready at http://localhost:${config.app.port}${url}`
  );
});
