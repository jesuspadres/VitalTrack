import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';
import { SecureTable } from '../constructs/secure-table';
import { SecureBucket } from '../constructs/secure-bucket';

export interface DataStackProps extends cdk.StackProps {
  readonly config: StageConfig;
}

export class DataStack extends cdk.Stack {
  public readonly biomarkersTable: dynamodb.Table;
  public readonly insightsTable: dynamodb.Table;
  public readonly auditLogTable: dynamodb.Table;
  public readonly dataBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- Biomarkers Table ---
    // PK=userId(S), SK=sk(S), GSI1: entityType(S)+createdAt(S), TTL attribute
    const biomarkersConstruct = new SecureTable(this, 'BiomarkersTable', {
      tableName: 'vitaltrack-biomarkers',
      config,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'entityType', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.ALL,
        },
      ],
    });
    this.biomarkersTable = biomarkersConstruct.table;

    // --- Insights Table ---
    // PK=userId(S), SK=insightId(S), GSI1: userId+createdAt(S)
    const insightsConstruct = new SecureTable(this, 'InsightsTable', {
      tableName: 'vitaltrack-insights',
      config,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'insightId', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.ALL,
        },
      ],
    });
    this.insightsTable = insightsConstruct.table;

    // --- Audit Log Table ---
    // PK=pk(S), SK=sk(S), TTL attribute (365 days)
    const auditLogConstruct = new SecureTable(this, 'AuditLogTable', {
      tableName: 'vitaltrack-audit-log',
      config,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
    });
    this.auditLogTable = auditLogConstruct.table;

    // --- S3 Data Bucket ---
    // CORS for presigned uploads, lifecycle: move to IA after 90 days
    const dataBucketConstruct = new SecureBucket(this, 'DataBucket', {
      bucketName: `vitaltrack-data-${config.stage}-${this.account}`,
      config,
      versioned: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag', 'x-amz-request-id'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });
    this.dataBucket = dataBucketConstruct.bucket;

    // --- CfnOutputs ---
    new cdk.CfnOutput(this, 'BiomarkersTableName', {
      value: this.biomarkersTable.tableName,
      description: 'Biomarkers DynamoDB table name',
      exportName: `vitaltrack-${config.stage}-biomarkers-table-name`,
    });

    new cdk.CfnOutput(this, 'InsightsTableName', {
      value: this.insightsTable.tableName,
      description: 'Insights DynamoDB table name',
      exportName: `vitaltrack-${config.stage}-insights-table-name`,
    });

    new cdk.CfnOutput(this, 'AuditLogTableName', {
      value: this.auditLogTable.tableName,
      description: 'Audit Log DynamoDB table name',
      exportName: `vitaltrack-${config.stage}-audit-log-table-name`,
    });

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: this.dataBucket.bucketName,
      description: 'Data S3 bucket name',
      exportName: `vitaltrack-${config.stage}-data-bucket-name`,
    });
  }
}
