import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { StageConfig } from '../config/environments';

export interface SecureTableProps {
  readonly tableName: string;
  readonly partitionKey: dynamodb.Attribute;
  readonly sortKey?: dynamodb.Attribute;
  readonly config: StageConfig;
  readonly globalSecondaryIndexes?: dynamodb.GlobalSecondaryIndexProps[];
  readonly timeToLiveAttribute?: string;
}

export class SecureTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: SecureTableProps) {
    super(scope, id);

    const removalPolicy =
      props.config.removalPolicy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN;

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `${props.tableName}-${props.config.stage}`,
      partitionKey: props.partitionKey,
      sortKey: props.sortKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy,
      timeToLiveAttribute: props.timeToLiveAttribute,
    });

    if (props.globalSecondaryIndexes) {
      for (const gsi of props.globalSecondaryIndexes) {
        this.table.addGlobalSecondaryIndex(gsi);
      }
    }

    new cloudwatch.Alarm(this, 'ThrottleAlarm', {
      metric: this.table.metricThrottledRequestsForOperations({
        operations: [
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.GET_ITEM,
          dynamodb.Operation.QUERY,
        ],
        period: cdk.Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: `DynamoDB throttle alarm for ${props.tableName}`,
    });
  }
}
