import { describe, it, expect } from 'vitest';
import {
  BiomarkerRecordSchema,
  InsightRecordSchema,
  UserProfileSchema,
  PresignResponseSchema,
  BiomarkerTypeEnum,
  BiomarkerStatusEnum,
} from './api';

describe('BiomarkerRecordSchema', () => {
  const validRecord = {
    userId: 'user-123',
    sk: 'BIOMARKER#2026-03-19T12:00:00Z#abc',
    biomarkerType: 'LDL_CHOLESTEROL',
    value: 110,
    unit: 'mg/dL',
    referenceRangeLow: 0,
    referenceRangeHigh: 100,
    status: 'BORDERLINE',
    source: 'CSV_UPLOAD',
    createdAt: '2026-03-19T12:00:00Z',
  };

  it('parses a valid biomarker record', () => {
    const result = BiomarkerRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('accepts optional batchId', () => {
    const result = BiomarkerRecordSchema.safeParse({
      ...validRecord,
      batchId: 'batch-456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid biomarker type', () => {
    const result = BiomarkerRecordSchema.safeParse({
      ...validRecord,
      biomarkerType: 'INVALID_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = BiomarkerRecordSchema.safeParse({
      ...validRecord,
      status: 'UNKNOWN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric value', () => {
    const result = BiomarkerRecordSchema.safeParse({
      ...validRecord,
      value: 'high',
    });
    expect(result.success).toBe(false);
  });
});

describe('BiomarkerTypeEnum', () => {
  it('contains all 14 biomarker types', () => {
    expect(BiomarkerTypeEnum.options).toHaveLength(14);
  });

  it('includes key clinical markers', () => {
    const types = BiomarkerTypeEnum.options;
    expect(types).toContain('LDL_CHOLESTEROL');
    expect(types).toContain('HEMOGLOBIN_A1C');
    expect(types).toContain('TSH');
    expect(types).toContain('VITAMIN_D');
    expect(types).toContain('HSCRP');
  });
});

describe('BiomarkerStatusEnum', () => {
  it('contains exactly 4 status values', () => {
    expect(BiomarkerStatusEnum.options).toEqual([
      'OPTIMAL',
      'NORMAL',
      'BORDERLINE',
      'OUT_OF_RANGE',
    ]);
  });
});

describe('InsightRecordSchema', () => {
  const validInsight = {
    userId: 'user-123',
    insightId: 'insight-456',
    createdAt: '2026-03-19T12:00:00Z',
    sourceBatchId: 'batch-789',
    category: 'CARDIOVASCULAR',
    summary: 'Your cardiovascular markers show improvement.',
    fullAnalysis: 'Detailed analysis text here.',
    actionPlan: [
      {
        priority: 1,
        category: 'DIET',
        title: 'Reduce saturated fat',
        description: 'Limit intake of saturated fats to less than 10% of calories.',
        relevantBiomarkers: ['LDL_CHOLESTEROL'],
        timeframe: '3 months',
      },
    ],
    riskFlags: [
      {
        biomarker: 'LDL_CHOLESTEROL',
        severity: 'MODERATE',
        message: 'LDL slightly elevated above optimal range.',
      },
    ],
    overallScore: 78,
    categoryScores: {
      CARDIOVASCULAR: { score: 72, trend: 'IMPROVING' },
    },
  };

  it('parses a valid insight record', () => {
    const result = InsightRecordSchema.safeParse(validInsight);
    expect(result.success).toBe(true);
  });

  it('accepts insight without optional fields', () => {
    const { overallScore, categoryScores, ...minimal } = validInsight;
    const result = InsightRecordSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects overallScore outside 0-100', () => {
    const result = InsightRecordSchema.safeParse({
      ...validInsight,
      overallScore: 150,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = InsightRecordSchema.safeParse({
      ...validInsight,
      category: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('UserProfileSchema', () => {
  it('parses a valid profile', () => {
    const result = UserProfileSchema.safeParse({
      userId: 'user-123',
      email: 'test@example.com',
      tier: 'free',
      unitsPreference: 'metric',
      notificationsEnabled: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('defaults unitsPreference to metric', () => {
    const result = UserProfileSchema.parse({
      userId: 'user-123',
      email: 'test@example.com',
      tier: 'premium',
      notificationsEnabled: false,
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.unitsPreference).toBe('metric');
  });

  it('rejects invalid email', () => {
    const result = UserProfileSchema.safeParse({
      userId: 'user-123',
      email: 'not-an-email',
      tier: 'free',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('PresignResponseSchema', () => {
  it('parses a valid presign response', () => {
    const result = PresignResponseSchema.safeParse({
      uploadUrl: 'https://s3.amazonaws.com/bucket/key?signed=true',
      key: 'uploads/user-123/file.csv',
      batchId: 'batch-abc',
      expiresIn: 3600,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-URL uploadUrl', () => {
    const result = PresignResponseSchema.safeParse({
      uploadUrl: 'not-a-url',
      key: 'uploads/file.csv',
      batchId: 'batch-abc',
      expiresIn: 3600,
    });
    expect(result.success).toBe(false);
  });
});
