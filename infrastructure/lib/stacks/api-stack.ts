import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';
import { SecureLambda } from '../constructs/secure-lambda';

export interface ApiStackProps extends cdk.StackProps {
  readonly config: StageConfig;
  readonly biomarkersTable: dynamodb.Table;
  readonly insightsTable: dynamodb.Table;
  readonly auditLogTable: dynamodb.Table;
  readonly dataBucket: s3.Bucket;
  readonly userPool: cognito.UserPool;
  readonly eventBus?: events.EventBus;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { config, biomarkersTable, insightsTable, auditLogTable, dataBucket, userPool, eventBus } = props;

    // --- Cognito Authorizer ---
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `vitaltrack-authorizer-${config.stage}`,
      identitySource: 'method.request.header.Authorization',
    });

    // --- Biomarker CRUD Lambda ---
    const biomarkerCrudLambda = new SecureLambda(this, 'BiomarkerCrudLambda', {
      functionName: 'vitaltrack-biomarker-crud',
      handler: 'handlers.biomarker_crud.handler',
      codePath: '../backend/src',
      description: 'Handles biomarker CRUD operations and profile management',
      config,
      environment: {
        BIOMARKERS_TABLE_NAME: biomarkersTable.tableName,
        INSIGHTS_TABLE_NAME: insightsTable.tableName,
        AUDIT_LOG_TABLE_NAME: auditLogTable.tableName,
      },
    });

    // --- Upload Presign Lambda ---
    const uploadPresignLambda = new SecureLambda(this, 'UploadPresignLambda', {
      functionName: 'vitaltrack-upload-presign',
      handler: 'handlers.upload_presign.handler',
      codePath: '../backend/src',
      description: 'Generates presigned S3 URLs for file uploads and tracks batch status',
      config,
      environment: {
        DATA_BUCKET_NAME: dataBucket.bucketName,
        BIOMARKERS_TABLE_NAME: biomarkersTable.tableName,
        AUDIT_LOG_TABLE_NAME: auditLogTable.tableName,
      },
    });

    // --- Insights Lambda ---
    const insightsLambda = new SecureLambda(this, 'InsightsLambda', {
      functionName: 'vitaltrack-insights-api',
      handler: 'handlers.insights_api.handler',
      codePath: '../backend/src',
      description: 'Handles insight listing, retrieval, and manual generation trigger',
      config,
      environment: {
        INSIGHTS_TABLE_NAME: insightsTable.tableName,
        BIOMARKERS_TABLE_NAME: biomarkersTable.tableName,
        AUDIT_LOG_TABLE_NAME: auditLogTable.tableName,
        ...(eventBus ? { EVENT_BUS_NAME: eventBus.eventBusName } : {}),
      },
    });

    // --- IAM Grants ---
    // biomarker-crud: DynamoDB read/write on all tables
    biomarkersTable.grantReadWriteData(biomarkerCrudLambda.function);
    insightsTable.grantReadWriteData(biomarkerCrudLambda.function);
    auditLogTable.grantReadWriteData(biomarkerCrudLambda.function);

    // upload-presign: S3 write + DynamoDB read/write
    dataBucket.grantWrite(uploadPresignLambda.function);
    biomarkersTable.grantReadWriteData(uploadPresignLambda.function);
    auditLogTable.grantReadWriteData(uploadPresignLambda.function);

    // insights-api: read insights + audit write + EventBridge put
    insightsTable.grantReadData(insightsLambda.function);
    biomarkersTable.grantReadData(insightsLambda.function);
    auditLogTable.grantReadWriteData(insightsLambda.function);
    if (eventBus) {
      eventBus.grantPutEventsTo(insightsLambda.function);
    }

    // --- API Gateway access log group ---
    const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/vitaltrack-api-${config.stage}`,
      retention: config.logRetentionDays === 7
        ? logs.RetentionDays.ONE_WEEK
        : config.logRetentionDays === 30
          ? logs.RetentionDays.ONE_MONTH
          : logs.RetentionDays.THREE_MONTHS,
      removalPolicy: config.removalPolicy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    // --- REST API ---
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `vitaltrack-api-${config.stage}`,
      description: `VitalTrack REST API (${config.stage})`,
      deployOptions: {
        stageName: config.stage,
        throttlingBurstLimit: 1000,
        throttlingRateLimit: 500,
        tracingEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
      },
    });

    // Lambda integrations
    const biomarkerIntegration = new apigateway.LambdaIntegration(biomarkerCrudLambda.function);
    const uploadIntegration = new apigateway.LambdaIntegration(uploadPresignLambda.function);
    const insightsIntegration = new apigateway.LambdaIntegration(insightsLambda.function);

    // Auth method options (reusable)
    const authorizedMethodOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- Route wiring ---

    // /v1
    const v1 = this.api.root.addResource('v1');

    // /v1/biomarkers
    const biomarkers = v1.addResource('biomarkers');
    biomarkers.addMethod('POST', biomarkerIntegration, authorizedMethodOptions);
    biomarkers.addMethod('GET', biomarkerIntegration, authorizedMethodOptions);

    // /v1/biomarkers/batch
    const biomarkersBatch = biomarkers.addResource('batch');
    biomarkersBatch.addMethod('POST', biomarkerIntegration, authorizedMethodOptions);

    // /v1/biomarkers/{sk}
    const biomarkerItem = biomarkers.addResource('{sk}');
    biomarkerItem.addMethod('GET', biomarkerIntegration, authorizedMethodOptions);
    biomarkerItem.addMethod('PUT', biomarkerIntegration, authorizedMethodOptions);
    biomarkerItem.addMethod('DELETE', biomarkerIntegration, authorizedMethodOptions);

    // /v1/upload
    const upload = v1.addResource('upload');

    // /v1/upload/presign
    const uploadPresign = upload.addResource('presign');
    uploadPresign.addMethod('POST', uploadIntegration, authorizedMethodOptions);

    // /v1/upload/{batchId}/status
    const uploadBatch = upload.addResource('{batchId}');
    const uploadBatchStatus = uploadBatch.addResource('status');
    uploadBatchStatus.addMethod('GET', uploadIntegration, authorizedMethodOptions);

    // /v1/insights
    const insights = v1.addResource('insights');
    insights.addMethod('GET', insightsIntegration, authorizedMethodOptions);

    // /v1/insights/generate
    const insightsGenerate = insights.addResource('generate');
    insightsGenerate.addMethod('POST', insightsIntegration, authorizedMethodOptions);

    // /v1/insights/{insightId}
    const insightItem = insights.addResource('{insightId}');
    insightItem.addMethod('GET', insightsIntegration, authorizedMethodOptions);

    // /v1/profile
    const profile = v1.addResource('profile');
    profile.addMethod('GET', biomarkerIntegration, authorizedMethodOptions);
    profile.addMethod('PUT', biomarkerIntegration, authorizedMethodOptions);

    // /health (no auth)
    const health = this.api.root.addResource('health');
    health.addMethod('GET', biomarkerIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // --- CfnOutput ---
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'VitalTrack API Gateway URL',
      exportName: `vitaltrack-${config.stage}-api-url`,
    });
  }
}
