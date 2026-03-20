import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly config: StageConfig;
  readonly apiName: string;
  readonly lambdaFunctionNames: string[];
  readonly biomarkersTableName: string;
  readonly insightsTableName: string;
  readonly auditLogTableName: string;
  readonly stateMachineName: string;
  readonly dlqName: string;
}

export class ObservabilityStack extends cdk.Stack {
  public readonly opsAlarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      config,
      apiName,
      lambdaFunctionNames,
      biomarkersTableName,
      insightsTableName,
      auditLogTableName,
      stateMachineName,
      dlqName,
    } = props;

    const tableNames = [biomarkersTableName, insightsTableName, auditLogTableName];

    // ---------------------------------------------------------------
    // SNS Topic for operational alarms
    // ---------------------------------------------------------------
    this.opsAlarmTopic = new sns.Topic(this, 'OpsAlarmTopic', {
      topicName: `vitaltrack-ops-alarms-${config.stage}`,
      displayName: `VitalTrack Ops Alarms (${config.stage})`,
    });

    NagSuppressions.addResourceSuppressions(
      this.opsAlarmTopic,
      [
        {
          id: 'AwsSolutions-SNS2',
          reason: 'Ops alarm topic uses CloudWatch alarm actions which publish over internal AWS channels; SSE not required for alarm metadata.',
        },
        {
          id: 'AwsSolutions-SNS3',
          reason: 'Ops alarm topic receives messages only from CloudWatch alarm actions (internal AWS service); SSL enforcement on publish is not needed.',
        },
      ],
      true,
    );

    const snsAction = new cloudwatch_actions.SnsAction(this.opsAlarmTopic);

    // ---------------------------------------------------------------
    // Alarm 1 — API Gateway 5xx Spike
    // ---------------------------------------------------------------
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `vitaltrack-api-5xx-${config.stage}`,
      alarmDescription: 'API Gateway 5XXError count exceeds 5 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: apiName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(snsAction);

    // ---------------------------------------------------------------
    // Alarm 2 — Lambda Errors (per function)
    // ---------------------------------------------------------------
    const lambdaErrorAlarms: cloudwatch.Alarm[] = [];
    for (const fnName of lambdaFunctionNames) {
      const alarm = new cloudwatch.Alarm(this, `LambdaErrorAlarm-${fnName}`, {
        alarmName: `vitaltrack-lambda-errors-${fnName}`,
        alarmDescription: `Lambda errors for ${fnName} exceed 3 in 5 minutes`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: fnName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 3,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(snsAction);
      lambdaErrorAlarms.push(alarm);
    }

    // ---------------------------------------------------------------
    // Alarm 3 — DynamoDB ThrottledRequests (per table)
    // ---------------------------------------------------------------
    for (const tableName of tableNames) {
      const alarm = new cloudwatch.Alarm(this, `DynamoThrottleAlarm-${tableName}`, {
        alarmName: `vitaltrack-dynamo-throttle-${tableName}`,
        alarmDescription: `DynamoDB throttled requests on ${tableName} exceed 0 in 1 minute`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ThrottledRequests',
          dimensionsMap: { TableName: tableName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(snsAction);
    }

    // ---------------------------------------------------------------
    // Alarm 4 — Insight Pipeline Failure (Step Functions)
    // ---------------------------------------------------------------
    const sfnFailAlarm = new cloudwatch.Alarm(this, 'SfnExecutionsFailedAlarm', {
      alarmName: `vitaltrack-sfn-failures-${config.stage}`,
      alarmDescription: 'Step Functions ExecutionsFailed exceed 1 in 15 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/States',
        metricName: 'ExecutionsFailed',
        dimensionsMap: { StateMachineArn: cdk.Arn.format({
          service: 'states',
          resource: 'stateMachine',
          resourceName: stateMachineName,
          arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
        }, this) },
        statistic: 'Sum',
        period: cdk.Duration.minutes(15),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    sfnFailAlarm.addAlarmAction(snsAction);

    // ---------------------------------------------------------------
    // Alarm 5 — DLQ Depth (SQS)
    // ---------------------------------------------------------------
    const dlqDepthAlarm = new cloudwatch.Alarm(this, 'DlqDepthAlarm', {
      alarmName: `vitaltrack-dlq-depth-${config.stage}`,
      alarmDescription: 'SQS DLQ has visible messages (should be 0)',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: dlqName },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqDepthAlarm.addAlarmAction(snsAction);

    // ---------------------------------------------------------------
    // CloudWatch Dashboard
    // ---------------------------------------------------------------
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `vitaltrack-dashboard-${config.stage}`,
    });

    // --- Row 1: API Gateway ---
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway — Request Count',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Request Count',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway — Latency (p50 / p95 / p99)',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p50',
            period: cdk.Duration.minutes(1),
            label: 'p50',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p95',
            period: cdk.Duration.minutes(1),
            label: 'p95',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p99',
            period: cdk.Duration.minutes(1),
            label: 'p99',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway — 4xx / 5xx Rates',
        width: 8,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: '4xx Errors',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: '5xx Errors',
          }),
        ],
      }),
    );

    // --- Row 2: Lambda ---
    const lambdaInvocationMetrics = lambdaFunctionNames.map(
      (fnName) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: fnName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: fnName,
        }),
    );

    const lambdaErrorMetrics = lambdaFunctionNames.map(
      (fnName) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: fnName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: fnName,
        }),
    );

    const lambdaDurationMetrics = lambdaFunctionNames.map(
      (fnName) =>
        new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: fnName },
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
          label: fnName,
        }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda — Invocation Count',
        width: 6,
        height: 6,
        left: lambdaInvocationMetrics,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda — Error Rate',
        width: 6,
        height: 6,
        left: lambdaErrorMetrics,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda — Duration (per function)',
        width: 6,
        height: 6,
        left: lambdaDurationMetrics,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Lambda — Concurrent Executions',
        width: 6,
        height: 6,
        metrics: lambdaFunctionNames.map(
          (fnName) =>
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'ConcurrentExecutions',
              dimensionsMap: { FunctionName: fnName },
              statistic: 'Maximum',
              period: cdk.Duration.minutes(1),
              label: fnName,
            }),
        ),
      }),
    );

    // --- Row 3: DynamoDB (per table) ---
    const dynamoRcuMetrics = tableNames.map(
      (tbl) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedReadCapacityUnits',
          dimensionsMap: { TableName: tbl },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: tbl,
        }),
    );

    const dynamoWcuMetrics = tableNames.map(
      (tbl) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ConsumedWriteCapacityUnits',
          dimensionsMap: { TableName: tbl },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: tbl,
        }),
    );

    const dynamoThrottleMetrics = tableNames.map(
      (tbl) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'ThrottledRequests',
          dimensionsMap: { TableName: tbl },
          statistic: 'Sum',
          period: cdk.Duration.minutes(1),
          label: tbl,
        }),
    );

    const dynamoLatencyMetrics = tableNames.map(
      (tbl) =>
        new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'SuccessfulRequestLatency',
          dimensionsMap: { TableName: tbl },
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
          label: tbl,
        }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Consumed Read Capacity',
        width: 6,
        height: 6,
        left: dynamoRcuMetrics,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Consumed Write Capacity',
        width: 6,
        height: 6,
        left: dynamoWcuMetrics,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Throttle Events',
        width: 6,
        height: 6,
        left: dynamoThrottleMetrics,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB — Request Latency',
        width: 6,
        height: 6,
        left: dynamoLatencyMetrics,
      }),
    );

    // --- Row 4: Step Functions ---
    const sfnArn = cdk.Arn.format({
      service: 'states',
      resource: 'stateMachine',
      resourceName: stateMachineName,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
    }, this);

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Step Functions — Executions Started / Succeeded / Failed',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsStarted',
            dimensionsMap: { StateMachineArn: sfnArn },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Started',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsSucceeded',
            dimensionsMap: { StateMachineArn: sfnArn },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Succeeded',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionsFailed',
            dimensionsMap: { StateMachineArn: sfnArn },
            statistic: 'Sum',
            period: cdk.Duration.minutes(1),
            label: 'Failed',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Step Functions — Execution Duration',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionTime',
            dimensionsMap: { StateMachineArn: sfnArn },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'Avg Duration',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/States',
            metricName: 'ExecutionTime',
            dimensionsMap: { StateMachineArn: sfnArn },
            statistic: 'p99',
            period: cdk.Duration.minutes(1),
            label: 'p99 Duration',
          }),
        ],
      }),
    );

    // --- Row 5: SQS DLQ ---
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'SQS DLQ — Approximate Message Count (should be 0)',
        width: 24,
        height: 4,
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfMessagesVisible',
            dimensionsMap: { QueueName: dlqName },
            statistic: 'Maximum',
            period: cdk.Duration.minutes(1),
            label: dlqName,
          }),
        ],
      }),
    );

    // ---------------------------------------------------------------
    // CfnOutputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'OpsAlarmTopicArn', {
      value: this.opsAlarmTopic.topicArn,
      description: 'SNS topic ARN for operational alarms',
      exportName: `vitaltrack-${config.stage}-ops-alarm-topic-arn`,
    });

    new cdk.CfnOutput(this, 'DashboardName', {
      value: this.dashboard.dashboardName,
      description: 'CloudWatch dashboard name',
      exportName: `vitaltrack-${config.stage}-dashboard-name`,
    });
  }
}
