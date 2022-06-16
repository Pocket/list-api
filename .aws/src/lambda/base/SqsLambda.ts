import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { config as stackConfig } from '../../config';
import { PocketVPC } from '@pocket-tools/terraform-modules';
import { PocketSQSWithLambdaTarget } from '@pocket-tools/terraform-modules';
import { LAMBDA_RUNTIMES } from '@pocket-tools/terraform-modules';
import { ssm } from '@cdktf/provider-aws';
import { PocketPagerDuty } from '@pocket-tools/terraform-modules';
import { PocketVersionedLambdaProps } from '@pocket-tools/terraform-modules';

export interface SqsLambdaProps {
  vpc: PocketVPC;
  batchSize: number;
  pagerDuty?: PocketPagerDuty;
  alarms?: PocketVersionedLambdaProps['lambda']['alarms'];
}

export class SqsLambda extends Resource {
  public readonly lambda: PocketSQSWithLambdaTarget;

  constructor(scope: Construct, private name: string, config: SqsLambdaProps) {
    super(scope, name.toLowerCase());

    const { sentryDsn, gitSha } = this.getEnvVariableValues();

    this.lambda = new PocketSQSWithLambdaTarget(this, name.toLowerCase(), {
      name: `${stackConfig.prefix}-${name}`,
      batchSize: config.batchSize,
      batchWindow: 60,
      sqsQueue: {
        maxReceiveCount: 3,
        visibilityTimeoutSeconds: 300,
      },
      functionResponseTypes: ['ReportBatchItemFailures'],
      lambda: {
        runtime: LAMBDA_RUNTIMES.NODEJS16,
        handler: 'index.handler',
        timeout: 120,
        environment: {
          SENTRY_DSN: sentryDsn,
          GIT_SHA: gitSha,
          ENVIRONMENT:
            stackConfig.environment === 'Prod' ? 'production' : 'development',
          LIST_API_URI:
            stackConfig.environment === 'Prod'
              ? 'https://list-api.readitlater.com'
              : 'https://list-api.getpocket.dev',
        },
        vpcConfig: {
          securityGroupIds: config.vpc.defaultSecurityGroups.ids,
          subnetIds: config.vpc.privateSubnetIds,
        },
        codeDeploy: {
          region: config.vpc.region,
          accountId: config.vpc.accountId,
        },
        alarms: config.alarms,
      },
      tags: stackConfig.tags,
    });
  }

  private getEnvVariableValues() {
    const sentryDsn = new ssm.DataAwsSsmParameter(this, 'sentry-dsn', {
      name: `/${stackConfig.name}/${stackConfig.environment}/SENTRY_DSN`,
    });

    const serviceHash = new ssm.DataAwsSsmParameter(this, 'service-hash', {
      name: `${stackConfig.circleCIPrefix}/SERVICE_HASH`,
    });

    return { sentryDsn: sentryDsn.value, gitSha: serviceHash.value };
  }
}
