import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { getStageConfig } from '../lib/config/environments';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ApiStack } from '../lib/stacks/api-stack';

const devConfig = getStageConfig('dev');

// ---------------------------------------------------------------------------
// Helper: create a fresh CDK App with deterministic account/region
// ---------------------------------------------------------------------------
function makeApp(): cdk.App {
  return new cdk.App();
}

const env: cdk.Environment = {
  account: '123456789012',
  region: 'us-east-1',
};

// ===========================================================================
// DataStack
// ===========================================================================
describe('DataStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const stack = new DataStack(app, 'TestDataStack', {
      config: devConfig,
      env,
    });
    template = Template.fromStack(stack);
  });

  test('snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('creates 3 DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 3);
  });

  test('creates 1 S3 bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('biomarkers table has correct key schema', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: `vitaltrack-biomarkers-${devConfig.stage}`,
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    });
  });

  test('insights table has correct key schema', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: `vitaltrack-insights-${devConfig.stage}`,
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'insightId', KeyType: 'RANGE' },
      ],
    });
  });

  test('audit log table has correct key schema', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: `vitaltrack-audit-log-${devConfig.stage}`,
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    });
  });

  test('S3 bucket has SSE enabled and public access blocked', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('all tables use PAY_PER_REQUEST billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });
});

// ===========================================================================
// AuthStack
// ===========================================================================
describe('AuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();
    const stack = new AuthStack(app, 'TestAuthStack', {
      config: devConfig,
      env,
    });
    template = Template.fromStack(stack);
  });

  test('snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('creates a Cognito User Pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });

  test('creates a Cognito User Pool Client', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  });

  test('password policy requires minimum length of 12', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    });
  });

  test('user pool has email sign-in enabled', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  test('account recovery is email only', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AccountRecoverySetting: {
        RecoveryMechanisms: [
          {
            Name: 'verified_email',
            Priority: 1,
          },
        ],
      },
    });
  });
});

// ===========================================================================
// ApiStack
// ===========================================================================
describe('ApiStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = makeApp();

    const dataStack = new DataStack(app, 'TestDataStackForApi', {
      config: devConfig,
      env,
    });

    const authStack = new AuthStack(app, 'TestAuthStackForApi', {
      config: devConfig,
      env,
    });

    const apiStack = new ApiStack(app, 'TestApiStack', {
      config: devConfig,
      env,
      biomarkersTable: dataStack.biomarkersTable,
      insightsTable: dataStack.insightsTable,
      auditLogTable: dataStack.auditLogTable,
      dataBucket: dataStack.dataBucket,
      userPool: authStack.userPool,
    });

    template = Template.fromStack(apiStack);
  });

  test('snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  test('creates 2 Lambda functions', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
  });

  test('creates 1 REST API', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  test('REST API has correct name', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: `vitaltrack-api-${devConfig.stage}`,
    });
  });

  test('Lambda functions use Python 3.12 runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.12',
    });
  });

  test('Lambda functions use ARM64 architecture', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
    });
  });

  test('Lambda functions have X-Ray tracing enabled', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      TracingConfig: {
        Mode: 'Active',
      },
    });
  });

  test('biomarker-crud Lambda has correct environment variables', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: `vitaltrack-biomarker-crud-${devConfig.stage}`,
      Environment: {
        Variables: {
          STAGE: devConfig.stage,
          POWERTOOLS_LOG_LEVEL: 'DEBUG',
        },
      },
    });
  });

  test('API Gateway has a Cognito authorizer', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'COGNITO_USER_POOLS',
    });
  });

  test('API Gateway deployment stage matches config', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: devConfig.stage,
    });
  });
});

// ===========================================================================
// All stacks synthesize successfully with dev config
// ===========================================================================
describe('Full synthesis with dev config', () => {
  test('all stacks can be synthesized without errors', () => {
    const app = makeApp();

    const dataStack = new DataStack(app, 'SynthDataStack', {
      config: devConfig,
      env,
    });

    const authStack = new AuthStack(app, 'SynthAuthStack', {
      config: devConfig,
      env,
    });

    const apiStack = new ApiStack(app, 'SynthApiStack', {
      config: devConfig,
      env,
      biomarkersTable: dataStack.biomarkersTable,
      insightsTable: dataStack.insightsTable,
      auditLogTable: dataStack.auditLogTable,
      dataBucket: dataStack.dataBucket,
      userPool: authStack.userPool,
    });

    // Synthesize the entire app --- should not throw
    const assembly = app.synth();

    expect(assembly.stacks).toHaveLength(3);

    // Verify each stack produced a valid CloudFormation template
    for (const stackArtifact of assembly.stacks) {
      expect(stackArtifact.template).toBeDefined();
      expect(stackArtifact.template.Resources).toBeDefined();
    }
  });
});
