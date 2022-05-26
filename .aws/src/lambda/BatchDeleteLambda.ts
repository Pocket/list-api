import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { SqsLambda, SqsLambdaProps } from './base/SqsLambda';

export class BatchDeleteLambda extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    config: Pick<SqsLambdaProps, 'vpc'>
  ) {
    super(scope, name.toLowerCase());

    new SqsLambda(this, 'Sqs-Batch-Delete-Consumer', {
      vpc: config.vpc,
      batchSize: 1,
    });
  }
}
