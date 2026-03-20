import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { StageConfig } from '../config/environments';

export interface SecureBucketProps {
  readonly bucketName?: string;
  readonly config: StageConfig;
  readonly versioned?: boolean;
  readonly cors?: s3.CorsRule[];
  readonly lifecycleRules?: s3.LifecycleRule[];
}

export class SecureBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SecureBucketProps) {
    super(scope, id);

    const removalPolicy =
      props.config.removalPolicy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN;

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: props.versioned ?? true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy,
      autoDeleteObjects: props.config.removalPolicy === 'DESTROY',
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      cors: props.cors,
      lifecycleRules: props.lifecycleRules,
    });
  }
}
