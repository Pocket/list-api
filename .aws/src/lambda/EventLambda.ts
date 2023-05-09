import { SqsQueue } from '@cdktf/provider-aws/lib/sqs-queue';
import { ApplicationSqsSnsTopicSubscription } from '@pocket-tools/terraform-modules';
import { Construct } from 'constructs';
import { SqsLambda, SqsLambdaProps } from './base/SqsLambda';
import { config as stackConfig } from '../config';

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
