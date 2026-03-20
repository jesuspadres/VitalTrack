import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { StageConfig } from '../config/environments';

export interface AuthStackProps extends cdk.StackProps {
  readonly config: StageConfig;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { config } = props;

    const removalPolicy =
      config.removalPolicy === 'DESTROY'
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN;

    // --- Cognito MFA mapping ---
    const mfaMap: Record<string, cognito.Mfa> = {
      OFF: cognito.Mfa.OFF,
      OPTIONAL: cognito.Mfa.OPTIONAL,
      REQUIRED: cognito.Mfa.REQUIRED,
    };

    // --- User Pool ---
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `vitaltrack-users-${config.stage}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        tier: new cognito.StringAttribute({ mutable: true }),
        createdAt: new cognito.StringAttribute({ mutable: false }),
      },
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: mfaMap[config.cognitoMfa],
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy,
    });

    // --- App Client ---
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `vitaltrack-app-${config.stage}`,
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // --- CfnOutputs ---
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `vitaltrack-${config.stage}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: `vitaltrack-${config.stage}-user-pool-client-id`,
    });
  }
}
