#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { getStageConfig, Stage } from '../lib/config/environments';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { EventsStack } from '../lib/stacks/events-stack';
import { InsightsStack } from '../lib/stacks/insights-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { ObservabilityStack } from '../lib/stacks/observability-stack';

const app = new cdk.App();

// Read stage from CDK context, default to 'dev'
const stage = (app.node.tryGetContext('stage') as Stage) ?? 'dev';
const config = getStageConfig(stage);

// --- Data Stack ---
const dataStack = new DataStack(app, `VitalTrack-Data-${config.stage}`, {
  config,
  description: `VitalTrack data layer — DynamoDB tables and S3 bucket (${config.stage})`,
});

// --- Auth Stack ---
const authStack = new AuthStack(app, `VitalTrack-Auth-${config.stage}`, {
  config,
  description: `VitalTrack authentication — Cognito User Pool (${config.stage})`,
});

// --- Events Stack ---
const eventsStack = new EventsStack(app, `VitalTrack-Events-${config.stage}`, {
  config,
  biomarkersTable: dataStack.biomarkersTable,
  dataBucket: dataStack.dataBucket,
  description: `VitalTrack event processing — EventBridge, CSV parser, SQS DLQ (${config.stage})`,
});

// --- API Stack ---
const apiStack = new ApiStack(app, `VitalTrack-Api-${config.stage}`, {
  config,
  biomarkersTable: dataStack.biomarkersTable,
  insightsTable: dataStack.insightsTable,
  auditLogTable: dataStack.auditLogTable,
  dataBucket: dataStack.dataBucket,
  userPool: authStack.userPool,
  eventBus: eventsStack.eventBus,
  description: `VitalTrack API — API Gateway and Lambda functions (${config.stage})`,
});

// --- Insights Stack ---
const insightsStack = new InsightsStack(app, `VitalTrack-Insights-${config.stage}`, {
  config,
  biomarkersTable: dataStack.biomarkersTable,
  insightsTable: dataStack.insightsTable,
  eventBus: eventsStack.eventBus,
  description: `VitalTrack AI insights — Step Functions, Bedrock, SNS (${config.stage})`,
});

// --- Frontend Stack ---
const frontendStack = new FrontendStack(app, `VitalTrack-Frontend-${config.stage}`, {
  config,
  description: `VitalTrack frontend — S3 + CloudFront static site hosting (${config.stage})`,
});

// --- Observability Stack ---
const observabilityStack = new ObservabilityStack(app, `VitalTrack-Observability-${config.stage}`, {
  config,
  apiName: `vitaltrack-api-${config.stage}`,
  lambdaFunctionNames: [
    `vitaltrack-biomarker-crud-${config.stage}`,
    `vitaltrack-upload-presign-${config.stage}`,
    `vitaltrack-csv-parser-${config.stage}`,
    `vitaltrack-insights-api-${config.stage}`,
    `vitaltrack-insight-fetch-history-${config.stage}`,
    `vitaltrack-insight-generate-${config.stage}`,
    `vitaltrack-insight-store-${config.stage}`,
    `vitaltrack-insight-notify-${config.stage}`,
  ],
  biomarkersTableName: `vitaltrack-biomarkers-${config.stage}`,
  insightsTableName: `vitaltrack-insights-${config.stage}`,
  auditLogTableName: `vitaltrack-audit-log-${config.stage}`,
  stateMachineName: `vitaltrack-insight-workflow-${config.stage}`,
  dlqName: `vitaltrack-dlq-${config.stage}`,
  description: `VitalTrack observability — CloudWatch dashboard and alarms (${config.stage})`,
});

// Explicit dependency ordering
apiStack.addDependency(dataStack);
apiStack.addDependency(authStack);
apiStack.addDependency(eventsStack);
eventsStack.addDependency(dataStack);
insightsStack.addDependency(dataStack);
insightsStack.addDependency(eventsStack);
frontendStack.addDependency(dataStack);
observabilityStack.addDependency(dataStack);
observabilityStack.addDependency(authStack);
observabilityStack.addDependency(apiStack);
observabilityStack.addDependency(eventsStack);
observabilityStack.addDependency(insightsStack);

// --- cdk-nag AwsSolutionsChecks ---
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// --- Tag all resources ---
cdk.Tags.of(app).add('project', 'vitaltrack');
cdk.Tags.of(app).add('stage', config.stage);
