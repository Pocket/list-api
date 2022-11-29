import process from 'process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
import { AWSXRayIdGenerator } from '@opentelemetry/id-generator-aws-xray';
//import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

/**
 * documentation:https://aws-otel.github.io/docs/getting-started/js-sdk/trace-manual-instr#instrumenting-the-aws-sdk
 * and https://github.com/open-telemetry/opentelemetry-js
 */
//todo: set to warn in prod
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

// const detectedResource = await detectResources({
//   detectors: [awsEcsDetector],
// });

const mergedResource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'list-api',
  })
);

// add OTLP exporter
const otlpExporter = new OTLPTraceExporter();

const tracerConfig = {
  idGenerator: new AWSXRayIdGenerator(),

  // any instrumentations can be declared here
  instrumentations: [
    getNodeAutoInstrumentations(),
    new AwsInstrumentation({
      // see the upstream documentation for available configuration
    }),
  ],

  // any resources can be declared here

  resource: mergedResource,
  spanProcessor: new BatchSpanProcessor(otlpExporter),
  propagator: new AWSXRayPropagator(),
};

const sdk = new NodeSDK(tracerConfig);

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
