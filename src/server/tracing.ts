import process from 'process';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';
import { AWSXRayIdGenerator } from '@opentelemetry/id-generator-aws-xray';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import config from '../config/index';
import { KnexInstrumentation } from '@opentelemetry/instrumentation-knex';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

/**
 * documentation:https://aws-otel.github.io/docs/getting-started/js-sdk/trace-manual-instr#instrumenting-the-aws-sdk
 * and https://github.com/open-telemetry/opentelemetry-js
 * sample apps: https://github.com/aws-observability/aws-otel-community/blob/master/sample-apps/javascript-sample-app/nodeSDK.js
 */

//todo: export trace object for custom tracing
//todo: set to error in prod
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const _resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'list-api',
  })
);

const _traceExporter = new OTLPTraceExporter({
  //collector url
  url: `http://${config.tracing.host}:4317`,
});
const _spanProcessor = new BatchSpanProcessor(_traceExporter);

const _tracerConfig = {
  idGenerator: new AWSXRayIdGenerator(),
};
// const _metricReader = new PeriodicExportingMetricReader({
//   exporter: new OTLPMetricExporter(),
//   exportIntervalMillis: 1000,
// });

export async function nodeSDKBuilder() {
  const sdk = new NodeSDK({
    textMapPropagator: new AWSXRayPropagator(),
    //metricReader: _metricReader,
    instrumentations: [
      //todo: enable auto instrumentation
      //after enabling sampling
      // getNodeAutoInstrumentations(),
      // new AwsInstrumentation({
      //   suppressInternalInstrumentation: true,
      // }),
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new MySQLInstrumentation(),
      new KnexInstrumentation({
        maxQueryLength: 200,
      }),
      new GraphQLInstrumentation({
        // optional params
        depth: 2, //query depth
        mergeItems: true, //instrumentation for first item in list instead of all items
        ignoreTrivialResolveSpans: true, //ignore resolvers that are not in graphQL schema
      }),
    ],
    resource: _resource,
    spanProcessor: _spanProcessor,
    traceExporter: _traceExporter,
  });
  sdk.configureTracerProvider(_tracerConfig, _spanProcessor);

  // this enables the API to record telemetry
  await sdk.start();

  // gracefully shut down the SDK on process exit
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Tracing and Metrics terminated'))
      .catch((error) =>
        console.log('Error terminating tracing and metrics', error)
      )
      .finally(() => process.exit(0));
  });
}
module.exports = { nodeSDKBuilder };
