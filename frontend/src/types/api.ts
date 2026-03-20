import { z } from 'zod';

// ─── Response Envelope ─────────────────────────────────────────
export const PaginationSchema = z.object({
  nextToken: z.string().nullable(),
  limit: z.number(),
});

export const MetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
  pagination: PaginationSchema.optional(),
});

export const ApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: MetaSchema,
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), issue: z.string() }))
      .optional(),
  }),
  meta: MetaSchema,
});

// ─── Biomarker ─────────────────────────────────────────────────
export const BiomarkerTypeEnum = z.enum([
  'LDL_CHOLESTEROL',
  'HDL_CHOLESTEROL',
  'TOTAL_CHOLESTEROL',
  'TRIGLYCERIDES',
  'APOB',
  'HEMOGLOBIN_A1C',
  'FASTING_GLUCOSE',
  'HSCRP',
  'TSH',
  'FREE_T4',
  'TESTOSTERONE_TOTAL',
  'VITAMIN_D',
  'FERRITIN',
  'VITAMIN_B12',
]);

export const BiomarkerStatusEnum = z.enum([
  'OPTIMAL',
  'NORMAL',
  'BORDERLINE',
  'OUT_OF_RANGE',
]);

export const BiomarkerRecordSchema = z.object({
  userId: z.string(),
  sk: z.string(),
  biomarkerType: BiomarkerTypeEnum,
  value: z.number(),
  unit: z.string(),
  referenceRangeLow: z.number(),
  referenceRangeHigh: z.number(),
  status: BiomarkerStatusEnum,
  source: z.enum(['MANUAL', 'CSV_UPLOAD', 'API_IMPORT']),
  batchId: z.string().optional(),
  createdAt: z.string(),
});

export type BiomarkerRecord = z.infer<typeof BiomarkerRecordSchema>;
export type BiomarkerType = z.infer<typeof BiomarkerTypeEnum>;
export type BiomarkerStatus = z.infer<typeof BiomarkerStatusEnum>;

// ─── Insight ───────────────────────────────────────────────────
export const RiskFlagSchema = z.object({
  biomarker: z.string(),
  severity: z.string(),
  message: z.string(),
});

export const ActionPlanItemSchema = z.object({
  priority: z.number(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  relevantBiomarkers: z.array(z.string()),
  timeframe: z.string(),
});

export const CategoryScoreSchema = z.object({
  score: z.number().min(0).max(100),
  trend: z.string(),
});

export const InsightRecordSchema = z.object({
  userId: z.string(),
  insightId: z.string(),
  createdAt: z.string(),
  sourceBatchId: z.string(),
  category: z.enum([
    'CARDIOVASCULAR',
    'METABOLIC',
    'HORMONAL',
    'NUTRITIONAL',
    'INFLAMMATION',
    'GENERAL',
  ]),
  summary: z.string(),
  fullAnalysis: z.string(),
  actionPlan: z.array(ActionPlanItemSchema),
  riskFlags: z.array(RiskFlagSchema),
  overallScore: z.number().min(0).max(100).optional(),
  categoryScores: z.record(CategoryScoreSchema).optional(),
});

export type InsightRecord = z.infer<typeof InsightRecordSchema>;
export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type ActionPlanItem = z.infer<typeof ActionPlanItemSchema>;

// ─── Upload ────────────────────────────────────────────────────
export const PresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  batchId: z.string(),
  expiresIn: z.number(),
});

export type PresignResponse = z.infer<typeof PresignResponseSchema>;

// ─── Profile ───────────────────────────────────────────────────
export const UserProfileSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  tier: z.enum(['free', 'premium']),
  unitsPreference: z.enum(['metric', 'imperial']).default('metric'),
  notificationsEnabled: z.boolean().default(true),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
