import process from 'process';
import opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
import { AWSXRayIdGenerator } from '@opentelemetry/id-generator-aws-xray';
// configure the SDK to export telemetry data to the console
// enable all auto-instrumentations from the meta package
const traceExporter = new ConsoleSpanExporter();

const tracerConfig = {
  idGenerator: new AWSXRayIdGenerator(),
};

const provider = new NodeTracerProvider(tracerConfig);

// Set the global trace context propagator to use X-Ray formatted trace header
provider.register({
  propagator: new AWSXRayPropagator(),
});

const sdk = new opentelemetry.NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'list-api',
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

export const initTracing = () => {
  // initialize the SDK and register with the OpenTelemetry API
  // this enables the API to record telemetry
  sdk
    .start()
    .then(() => console.log('Tracing initialized'))
    .catch((error) => console.log('Error initializing tracing', error));

  // gracefully shut down the SDK on process exit
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};
