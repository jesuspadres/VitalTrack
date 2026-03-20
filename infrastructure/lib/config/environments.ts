export type Stage = 'dev' | 'staging' | 'prod';

export interface StageConfig {
  readonly stage: Stage;
  readonly lambdaMemoryMb: number;
  readonly lambdaTimeoutSec: number;
  readonly xraySamplingPercent: number;
  readonly logRetentionDays: number;
  readonly cloudFrontPriceClass: string;
  readonly cognitoMfa: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  readonly bedrockModelId: string;
  readonly removalPolicy: 'DESTROY' | 'RETAIN';
}

const configs: Record<Stage, StageConfig> = {
  dev: {
    stage: 'dev',
    lambdaMemoryMb: 256,
    lambdaTimeoutSec: 15,
    xraySamplingPercent: 100,
    logRetentionDays: 7,
    cloudFrontPriceClass: 'PriceClass_100',
    cognitoMfa: 'OFF',
    bedrockModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    removalPolicy: 'DESTROY',
  },
  staging: {
    stage: 'staging',
    lambdaMemoryMb: 512,
    lambdaTimeoutSec: 30,
    xraySamplingPercent: 50,
    logRetentionDays: 30,
    cloudFrontPriceClass: 'PriceClass_100',
    cognitoMfa: 'OPTIONAL',
    bedrockModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    removalPolicy: 'RETAIN',
  },
  prod: {
    stage: 'prod',
    lambdaMemoryMb: 512,
    lambdaTimeoutSec: 30,
    xraySamplingPercent: 10,
    logRetentionDays: 90,
    cloudFrontPriceClass: 'PriceClass_All',
    cognitoMfa: 'OPTIONAL',
    bedrockModelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    removalPolicy: 'RETAIN',
  },
};

export function getStageConfig(stage: Stage): StageConfig {
  return configs[stage];
}
