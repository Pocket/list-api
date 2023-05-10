import { Construct } from 'constructs';
import { SqsLambda, SqsLambdaProps } from './base/SqsLambda';

export class EventLambda extends Construct {
  constructor(
    scope: Construct,
    private name: string,
    config: Pick<SqsLambdaProps, 'vpc'>
  ) {
    super(scope, name.toLowerCase());

    new SqsLambda(this, 'Sqs-Event-Consumer', {
      vpc: config.vpc,
      batchSize: 10,
    });
  }
}
