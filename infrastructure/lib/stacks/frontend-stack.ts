import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';
import { SecureBucket } from '../constructs/secure-bucket';

export interface FrontendStackProps extends cdk.StackProps {
  readonly config: StageConfig;
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { config } = props;

    // --- S3 Bucket for static frontend assets ---
    const siteBucketConstruct = new SecureBucket(this, 'SiteBucket', {
      bucketName: `vitaltrack-frontend-${config.stage}-${this.account}`,
      config,
      versioned: false,
    });
    this.siteBucket = siteBucketConstruct.bucket;

    // --- CloudFront Origin Access Control ---
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      originAccessControlName: `vitaltrack-oac-${config.stage}`,
      description: `OAC for VitalTrack frontend S3 bucket (${config.stage})`,
      signing: cloudfront.Signing.SIGV4_NO_OVERRIDE,
    });

    // --- Map config string to CloudFront PriceClass enum ---
    const priceClassMap: Record<string, cloudfront.PriceClass> = {
      PriceClass_100: cloudfront.PriceClass.PRICE_CLASS_100,
      PriceClass_200: cloudfront.PriceClass.PRICE_CLASS_200,
      PriceClass_All: cloudfront.PriceClass.PRICE_CLASS_ALL,
    };
    const priceClass = priceClassMap[config.cloudFrontPriceClass] ?? cloudfront.PriceClass.PRICE_CLASS_100;

    // --- Response Headers Policy with security headers ---
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `vitaltrack-security-headers-${config.stage}`,
      comment: `Security response headers for VitalTrack frontend (${config.stage})`,
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com; font-src 'self' data:; frame-ancestors 'none';",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000), // 2 years
          includeSubdomains: true,
          preload: true,
          override: true,
        },
      },
    });

    // --- CloudFront Distribution ---
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `VitalTrack frontend (${config.stage})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
      priceClass,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // --- cdk-nag suppressions for known false positives ---
    // CloudFront distribution uses the default CloudFront certificate (*.cloudfront.net)
    // rather than a custom ACM certificate — acceptable for a portfolio project without a custom domain.
    NagSuppressions.addResourceSuppressions(
      this.distribution,
      [
        {
          id: 'AwsSolutions-CFR4',
          reason: 'Using default CloudFront certificate (*.cloudfront.net); custom domain with ACM cert will be added when a domain is configured.',
        },
        {
          id: 'AwsSolutions-CFR1',
          reason: 'Geo restrictions not required for this portfolio application.',
        },
        {
          id: 'AwsSolutions-CFR2',
          reason: 'WAF integration will be added in a future iteration when custom domain is configured.',
        },
      ],
      true, // apply to children
    );

    // CloudFront access logging requires an S3 bucket — suppress for now.
    NagSuppressions.addResourceSuppressions(
      this.distribution,
      [
        {
          id: 'AwsSolutions-CFR3',
          reason: 'Access logging will be enabled when an access-log bucket is provisioned.',
        },
      ],
    );

    // Frontend bucket does not need server access logs (CloudFront access logging is separate)
    NagSuppressions.addResourceSuppressions(
      siteBucketConstruct,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'Frontend static asset bucket does not require server access logs; CloudFront logging covers access patterns.',
        },
      ],
      true,
    );

    // --- CfnOutputs ---
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `vitaltrack-${config.stage}-distribution-domain`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `vitaltrack-${config.stage}-distribution-id`,
    });

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: this.siteBucket.bucketName,
      description: 'Frontend S3 bucket name',
      exportName: `vitaltrack-${config.stage}-site-bucket-name`,
    });
  }
}
