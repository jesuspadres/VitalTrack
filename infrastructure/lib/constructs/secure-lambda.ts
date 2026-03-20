import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { StageConfig } from '../config/environments';

export interface SecureLambdaProps {
  readonly functionName: string;
  readonly handler: string;
  readonly codePath: string;
  readonly description: string;
  readonly config: StageConfig;
  readonly environment?: Record<string, string>;
  readonly layers?: lambda.ILayerVersion[];
  readonly timeout?: cdk.Duration;
  readonly memorySize?: number;
}

export class SecureLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: SecureLambdaProps) {
    super(scope, id);

    const removalPolicy =
      props.config.removalPolicy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN;

    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${props.functionName}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${props.functionName}-${props.config.stage}`,
      retention: this.getLogRetention(props.config.logRetentionDays),
      removalPolicy,
    });

    this.function = new lambda.Function(this, 'Function', {
      functionName: `${props.functionName}-${props.config.stage}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: props.handler,
      code: lambda.Code.fromAsset(props.codePath),
      memorySize: props.memorySize ?? props.config.lambdaMemoryMb,
      timeout: props.timeout ?? cdk.Duration.seconds(props.config.lambdaTimeoutSec),
      role: this.role,
      tracing: lambda.Tracing.ACTIVE,
      description: props.description,
      environment: {
        STAGE: props.config.stage,
        POWERTOOLS_SERVICE_NAME: props.functionName,
        POWERTOOLS_LOG_LEVEL: props.config.stage === 'prod' ? 'INFO' : 'DEBUG',
        ...props.environment,
      },
      layers: props.layers,
      logGroup,
    });

    // Suppress known cdk-nag findings that apply to all Lambda functions
    NagSuppressions.addResourceSuppressions(this.role, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWSLambdaBasicExecutionRole is required for CloudWatch Logs access. Custom policies are added per-function for specific resources.',
        appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.function, [
      {
        id: 'AwsSolutions-L1',
        reason: 'Python 3.12 is the latest stable runtime supported by our dependencies. Will upgrade when 3.13 is validated.',
      },
    ]);
  }

  private getLogRetention(days: number): logs.RetentionDays {
    const mapping: Record<number, logs.RetentionDays> = {
      7: logs.RetentionDays.ONE_WEEK,
      30: logs.RetentionDays.ONE_MONTH,
      90: logs.RetentionDays.THREE_MONTHS,
    };
    return mapping[days] ?? logs.RetentionDays.ONE_MONTH;
  }
}
