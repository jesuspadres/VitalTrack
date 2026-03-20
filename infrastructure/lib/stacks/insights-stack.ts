import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';
import { SecureLambda } from '../constructs/secure-lambda';

export interface InsightsStackProps extends cdk.StackProps {
  readonly config: StageConfig;
  readonly biomarkersTable: dynamodb.Table;
  readonly insightsTable: dynamodb.Table;
  readonly eventBus: events.EventBus;
}

export class InsightsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InsightsStackProps) {
    super(scope, id, props);

    const { config, biomarkersTable, insightsTable, eventBus } = props;

    // --- SNS Topic for user notifications ---
    const notificationTopic = new sns.Topic(this, 'NotificationTopic', {
      topicName: `vitaltrack-notifications-${config.stage}`,
      displayName: 'VitalTrack Insight Notifications',
    });

    // --- Insight Lambda Functions ---

    const fetchHistoryLambda = new SecureLambda(this, 'FetchHistoryLambda', {
      functionName: 'vitaltrack-insight-fetch-history',
      handler: 'handlers.insight_fetch_history.handler',
      codePath: '../backend/src',
      description: 'Fetches biomarker history for insight generation',
      config,
      environment: {
        BIOMARKERS_TABLE_NAME: biomarkersTable.tableName,
      },
    });
    biomarkersTable.grantReadData(fetchHistoryLambda.function);

    const generateLambda = new SecureLambda(this, 'GenerateLambda', {
      functionName: 'vitaltrack-insight-generate',
      handler: 'handlers.insight_generate.handler',
      codePath: '../backend/src',
      description: 'Invokes Bedrock to generate AI health insights',
      config,
      timeout: cdk.Duration.seconds(90),
      memorySize: 512,
      environment: {
        BEDROCK_MODEL_ID: config.bedrockModelId,
      },
    });
    generateLambda.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:*::foundation-model/${config.bedrockModelId}`],
      }),
    );

    const storeLambda = new SecureLambda(this, 'StoreLambda', {
      functionName: 'vitaltrack-insight-store',
      handler: 'handlers.insight_store.handler',
      codePath: '../backend/src',
      description: 'Stores generated insights in DynamoDB',
      config,
      environment: {
        INSIGHTS_TABLE_NAME: insightsTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
    });
    insightsTable.grantReadWriteData(storeLambda.function);
    eventBus.grantPutEventsTo(storeLambda.function);

    const notifyLambda = new SecureLambda(this, 'NotifyLambda', {
      functionName: 'vitaltrack-insight-notify',
      handler: 'handlers.insight_notify.handler',
      codePath: '../backend/src',
      description: 'Sends notification when insight is ready',
      config,
      environment: {
        NOTIFICATION_TOPIC_ARN: notificationTopic.topicArn,
      },
    });
    notificationTopic.grantPublish(notifyLambda.function);

    // --- Step Functions Definition ---

    const fetchHistory = new tasks.LambdaInvoke(this, 'FetchHistory', {
      lambdaFunction: fetchHistoryLambda.function,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    fetchHistory.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const generateInsight = new tasks.LambdaInvoke(this, 'GenerateInsight', {
      lambdaFunction: generateLambda.function,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    generateInsight.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2,
    });

    const fallback = new sfn.Pass(this, 'Fallback', {
      result: sfn.Result.fromObject({
        status: 'GENERATION_FAILED',
        message: 'Insight generation failed after retries.',
      }),
    });
    generateInsight.addCatch(fallback, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    const storeInsight = new tasks.LambdaInvoke(this, 'StoreInsight', {
      lambdaFunction: storeLambda.function,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    storeInsight.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 2,
      backoffRate: 2,
    });

    const notifyUser = new tasks.LambdaInvoke(this, 'NotifyUser', {
      lambdaFunction: notifyLambda.function,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });
    notifyUser.addRetry({
      errors: ['States.TaskFailed'],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 2,
      backoffRate: 2,
    });
    const notifyFallback = new sfn.Pass(this, 'NotifyFallback', {
      result: sfn.Result.fromObject({
        notified: false,
        message: 'Notification failed but insight was stored successfully.',
      }),
    });
    notifyUser.addCatch(notifyFallback, {
      errors: ['States.ALL'],
      resultPath: '$.notifyError',
    });

    const insufficientData = new sfn.Pass(this, 'InsufficientData', {
      result: sfn.Result.fromObject({
        status: 'INSUFFICIENT_DATA',
        message: 'At least 3 biomarkers are required for meaningful insight generation.',
      }),
    });

    // Chain: FetchHistory → Choice → (Generate → Store → Notify) | InsufficientData
    const definition = fetchHistory.next(
      new sfn.Choice(this, 'ValidateData')
        .when(
          sfn.Condition.booleanEquals('$.insufficientData', true),
          insufficientData,
        )
        .otherwise(
          generateInsight
            .next(storeInsight)
            .next(notifyUser),
        ),
    );

    const stateMachine = new sfn.StateMachine(this, 'InsightWorkflow', {
      stateMachineName: `vitaltrack-insight-workflow-${config.stage}`,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
    });

    // CDK auto-generates IAM policies with wildcards for Step Functions Lambda invoke,
    // DynamoDB GSI access, EventBridge put, and X-Ray tracing permissions.
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'CDK-generated IAM policies include wildcards for Lambda:InvokeFunction versions/aliases, DynamoDB GSI indexes, and X-Ray PutTelemetryRecords. All are scoped to specific resources in the stack.',
      },
    ]);

    // --- EventBridge Rule: BiomarkersIngested → Step Functions ---
    new events.Rule(this, 'BiomarkersIngestedRule', {
      ruleName: `vitaltrack-biomarkers-ingested-${config.stage}`,
      description: 'Triggers insight generation when biomarkers are ingested',
      eventBus,
      eventPattern: {
        source: ['vitaltrack.csv-parser'],
        detailType: ['BiomarkersIngested'],
      },
      targets: [new targets.SfnStateMachine(stateMachine)],
    });

    // --- CfnOutputs ---
    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Insight generation Step Functions state machine ARN',
      exportName: `vitaltrack-${config.stage}-insight-workflow-arn`,
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: notificationTopic.topicArn,
      description: 'SNS topic for user notifications',
      exportName: `vitaltrack-${config.stage}-notification-topic-arn`,
    });
  }
}
