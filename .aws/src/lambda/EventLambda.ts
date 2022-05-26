import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { ApplicationSqsSnsTopicSubscription } from '@pocket-tools/terraform-modules';
import { sqs } from '@cdktf/provider-aws';
import { SqsLambda, SqsLambdaProps } from './base/SqsLambda';
import { config as stackConfig } from '../config';

export class EventLambda extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    config: Pick<SqsLambdaProps, 'vpc'>
  ) {
    super(scope, name.toLowerCase());

    const sqsLambda = new SqsLambda(this, 'Sqs-Event-Consumer', {
      vpc: config.vpc,
      batchSize: 10,
    });
    const lambda = sqsLambda.lambda;

    new ApplicationSqsSnsTopicSubscription(
      this,
      'user-events-sns-subscription',
      {
        name: stackConfig.prefix,
        snsTopicArn: `arn:aws:sns:${config.vpc.region}:${config.vpc.accountId}:${stackConfig.lambda.snsTopicName.userEvents}`,
        sqsQueue: lambda.sqsQueueResource,
        tags: stackConfig.tags,
        dependsOn: [lambda.sqsQueueResource as sqs.SqsQueue],
      }
    );
  }
}
