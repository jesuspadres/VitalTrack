import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';
import { SecureLambda } from '../constructs/secure-lambda';

export interface EventsStackProps extends cdk.StackProps {
  readonly config: StageConfig;
  readonly biomarkersTable: dynamodb.Table;
  readonly dataBucket: s3.Bucket;
}

export class EventsStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: EventsStackProps) {
    super(scope, id, props);

    const { config, biomarkersTable, dataBucket } = props;

    // --- Custom EventBridge Bus ---
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `vitaltrack-events-${config.stage}`,
    });

    // --- SQS Dead-Letter Queue for failed CSV parse jobs ---
    const csvParserDlq = new sqs.Queue(this, 'CsvParserDlq', {
      queueName: `vitaltrack-csv-parser-dlq-${config.stage}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    // --- CSV Parser Lambda ---
    const csvParserLambda = new SecureLambda(this, 'CsvParserLambda', {
      functionName: 'vitaltrack-csv-parser',
      handler: 'handlers.csv_parser.handler',
      codePath: '../backend/src',
      description: 'Parses uploaded CSV files and ingests biomarker records',
      config,
      timeout: cdk.Duration.seconds(60),
      environment: {
        BIOMARKERS_TABLE_NAME: biomarkersTable.tableName,
        EVENT_BUS_NAME: this.eventBus.eventBusName,
      },
    });

    // IAM grants: S3 read, DynamoDB write, EventBridge put
    dataBucket.grantRead(csvParserLambda.function);
    biomarkersTable.grantReadWriteData(csvParserLambda.function);
    this.eventBus.grantPutEventsTo(csvParserLambda.function);

    // --- EventBridge Rule: S3 PutObject → CSV Parser ---
    // Matches S3 object-created events for CSV files in the uploads/ prefix
    new events.Rule(this, 'S3CsvUploadRule', {
      ruleName: `vitaltrack-csv-upload-${config.stage}`,
      description: 'Routes S3 CSV uploads to the CSV parser Lambda',
      eventBus: events.EventBus.fromEventBusName(this, 'DefaultBus', 'default'),
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [dataBucket.bucketName],
          },
          object: {
            key: [{ prefix: 'uploads/' }],
          },
        },
      },
      targets: [
        new targets.LambdaFunction(csvParserLambda.function, {
          deadLetterQueue: csvParserDlq,
          retryAttempts: 2,
          maxEventAge: cdk.Duration.hours(1),
        }),
      ],
    });

    // --- Enable S3 EventBridge notifications ---
    // Required so S3 sends events to EventBridge (default bus)
    dataBucket.enableEventBridgeNotification();

    // --- CfnOutputs ---
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'VitalTrack custom EventBridge bus name',
      exportName: `vitaltrack-${config.stage}-event-bus-name`,
    });

    new cdk.CfnOutput(this, 'CsvParserDlqUrl', {
      value: csvParserDlq.queueUrl,
      description: 'CSV parser dead-letter queue URL',
      exportName: `vitaltrack-${config.stage}-csv-parser-dlq-url`,
    });

    new cdk.CfnOutput(this, 'CsvParserDlqArn', {
      value: csvParserDlq.queueArn,
      description: 'CSV parser dead-letter queue ARN',
      exportName: `vitaltrack-${config.stage}-csv-parser-dlq-arn`,
    });
  }
}
