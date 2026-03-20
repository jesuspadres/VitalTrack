# VitalTrack — Product Requirements Document

**A Serverless Biomarker Tracking & AI Health Insights Platform**

Built on AWS • Inspired by SiPhox Health

| | |
|---|---|
| **Author** | Jessy Padres |
| **Version** | 1.0 |
| **Date** | March 2026 |
| **Classification** | Internal / Portfolio |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Security Architecture](#3-security-architecture)
4. [Data Model](#4-data-model)
5. [Project Structure & Directory Layout](#5-project-structure--directory-layout)
6. [API Specification](#6-api-specification)
7. [AI Insights Engine](#7-ai-insights-engine)
8. [Frontend Specification](#8-frontend-specification)
9. [Observability & Operations](#9-observability--operations)
10. [Code Quality Standards](#10-code-quality-standards)
11. [Implementation Phases](#11-implementation-phases)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

VitalTrack is a serverless, HIPAA-aware health biomarker tracking platform that enables users to submit blood panel results, visualize biomarker trends over time, and receive AI-generated personalized health insights and action plans. The platform is inspired by the product model of SiPhox Health and built entirely on Amazon Web Services (AWS) to demonstrate production-grade cloud architecture.

This PRD serves as the single source of truth for implementation using Claude Code. Every section is written to be directly actionable, with explicit file paths, API contracts, database schemas, and acceptance criteria. The document prioritizes security, data consistency, high availability, and code quality standards appropriate for a health technology platform.

> **💡 Implementation Note for Claude Code**
>
> This PRD is designed to be consumed section-by-section during implementation. Each section is self-contained with enough detail to generate production-quality code. When implementing, reference the specific section relevant to the current task. Follow the directory structure in Section 5 exactly. All code must pass the linting and testing gates defined in Section 12 before being considered complete.

### 1.1 Project Goals

- Build a fully serverless health data platform on AWS touching 13+ services
- Demonstrate production-grade security posture (encryption at rest/in transit, least-privilege IAM, input validation)
- Achieve high availability with multi-AZ data stores and automated failover
- Maintain strict data consistency for health records using DynamoDB transactions
- Generate AI-powered health insights using Amazon Bedrock (Claude)
- Deploy all infrastructure as code using AWS CDK (TypeScript)
- Serve as a portfolio-quality demonstration of cloud engineering competency

### 1.2 Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| API response time (p95) | < 500ms | CloudWatch Latency metrics |
| Availability (monthly) | > 99.9% | CloudWatch composite alarms |
| Insight generation time | < 30 seconds end-to-end | Step Functions execution metrics |
| Test coverage (unit) | > 80% line coverage | pytest-cov / Jest coverage reports |
| Security scan pass rate | 0 critical / 0 high findings | CDK-nag + Bandit + npm audit |
| Infrastructure drift | Zero manual changes | CDK diff in CI pipeline |
| Cold start latency | < 2 seconds (Lambda) | X-Ray trace segments |

---

## 2. System Architecture

VitalTrack follows an event-driven, serverless architecture pattern. All compute is handled by AWS Lambda, with API Gateway providing the HTTP interface, DynamoDB for persistence, and EventBridge as the central event bus for async workflows. The architecture is designed for horizontal scalability with zero server management.

### 2.1 AWS Services Map

| Layer | Service | Purpose | Configuration |
|---|---|---|---|
| Frontend Hosting | S3 + CloudFront | Static site hosting with CDN | OAC, TLS 1.2+, custom error pages |
| Authentication | Cognito User Pools | User registration, login, JWT tokens | MFA optional, password policy enforced |
| API Layer | API Gateway (REST) | HTTPS endpoints with auth | Cognito authorizer, throttling, WAF |
| Compute | Lambda (Python 3.12) | Business logic execution | ARM64, 512MB, 30s timeout, layers |
| Primary Database | DynamoDB | Biomarker records, user profiles | On-demand, encryption, PITR enabled |
| Object Storage | S3 (data bucket) | CSV uploads, generated reports | SSE-S3, versioning, lifecycle rules |
| Event Bus | EventBridge | Async event routing | Custom bus, DLQ on all rules |
| Orchestration | Step Functions | Multi-step insight generation | Express workflow, error handling |
| AI Inference | Bedrock (Claude 3.5 Sonnet) | Health insight generation | Guardrails, token limits, retry |
| Notifications | SNS + SES | Email alerts for insights | Verified domain, bounce handling |
| Async Processing | SQS | Dead-letter queues, batch jobs | Encryption, 14-day retention |
| Secrets | Secrets Manager | API keys, external configs | Auto-rotation enabled |
| Observability | CloudWatch + X-Ray | Metrics, logs, distributed tracing | Custom dashboards, composite alarms |

### 2.2 Data Flow Architecture

The system processes data through three primary flows, each designed for resilience and consistency:

#### 2.2.1 Synchronous Flow: Biomarker CRUD

**Path:** Client → CloudFront → API Gateway (Cognito auth) → Lambda → DynamoDB → Response

- All writes use DynamoDB transactions to ensure atomicity
- Read-after-write consistency guaranteed by DynamoDB strong reads on get operations
- API Gateway validates request bodies against JSON schemas before Lambda invocation
- Lambda functions use structured logging with correlation IDs for traceability

#### 2.2.2 Asynchronous Flow: CSV Upload Processing

**Path:** Client → S3 presigned URL upload → S3 event → EventBridge → Lambda (parser) → DynamoDB

- Presigned URLs generated server-side with 15-minute expiry and file-size limits
- S3 event notification triggers EventBridge rule (not direct Lambda, for extensibility)
- Parser Lambda validates CSV structure, checks biomarker value ranges, rejects malformed data
- Failed records route to SQS dead-letter queue with full error context for retry or manual review
- Successful parse emits a `BiomarkersIngested` event to EventBridge for downstream processing

#### 2.2.3 Async Flow: AI Insight Generation

**Path:** EventBridge (BiomarkersIngested) → Step Functions → [Fetch History Lambda → Bedrock Invoke Lambda → Store Insight Lambda → Notify Lambda]

- Step Functions Express Workflow orchestrates the multi-step pipeline with built-in retry and error handling
- Each step is an independent Lambda with its own error boundary
- Bedrock invocation includes guardrails to prevent hallucinated medical diagnoses
- Generated insights are stored in DynamoDB with a reference to the source biomarker batch
- SNS notification sent to user on completion; failures trigger an ops alarm

### 2.3 High Availability Design

| Component | HA Strategy | RPO | RTO |
|---|---|---|---|
| DynamoDB | Multi-AZ by default, PITR enabled, on-demand capacity | < 5 min (PITR) | < 1 min |
| Lambda | Multi-AZ by default, reserved concurrency | N/A (stateless) | < 1 sec |
| S3 | 99.999999999% durability, cross-region replication optional | 0 (durable) | < 1 sec |
| API Gateway | Regional endpoint, multi-AZ | N/A | < 1 sec |
| CloudFront | Global edge network, origin failover group | N/A | < 1 sec |
| Cognito | Multi-AZ by default, no single point of failure | N/A | < 1 sec |
| EventBridge | Multi-AZ, guaranteed delivery with DLQ | 0 | < 1 sec |
| Step Functions | Multi-AZ, execution history retained 90 days | 0 | < 1 sec |

---

## 3. Security Architecture

> **🔒 Security-First Principle**
>
> VitalTrack handles sensitive health biomarker data. While this is a portfolio project and not subject to HIPAA certification, the architecture implements HIPAA-aligned security controls as a design principle. Every design decision defaults to the most restrictive option, then relaxes only with explicit justification.

### 3.1 Authentication & Authorization

#### 3.1.1 Cognito Configuration

- User Pool with email-based sign-up (no social federation for v1)
- **Password policy:** minimum 12 characters, requires uppercase, lowercase, number, and symbol
- **MFA:** optional TOTP for v1, recommended in onboarding flow
- **Token expiry:** access token 1 hour, refresh token 30 days
- **Account lockout:** 5 failed attempts triggers temporary lockout
- Custom attributes: `tier` (free/premium), `createdAt`, `lastLoginAt`
- Pre-token generation Lambda trigger to inject custom claims (user tier, permissions)

#### 3.1.2 API Authorization Model

| Endpoint Pattern | Auth Method | Authorization Rule |
|---|---|---|
| `POST /auth/*` | None (public) | Rate limited: 10 req/min per IP |
| `GET /biomarkers/*` | Cognito JWT | User can only access own records (userId from token) |
| `POST /biomarkers` | Cognito JWT | User can only write to own partition |
| `POST /upload/presign` | Cognito JWT | Presigned URL scoped to user's S3 prefix |
| `GET /insights/*` | Cognito JWT | User can only read own insights |
| `GET /health` | None (public) | Health check endpoint, no sensitive data |

#### 3.1.3 IAM Least-Privilege Policy

Every Lambda function has a dedicated IAM role with the minimum permissions required for its specific task. No shared roles. No wildcard resource ARNs.

| Lambda Function | Allowed Actions | Resource Scope |
|---|---|---|
| biomarker-crud | `dynamodb:GetItem, PutItem, Query, UpdateItem, DeleteItem` | biomarkers table + GSIs only |
| csv-parser | `s3:GetObject` (data bucket), `dynamodb:BatchWriteItem`, `events:PutEvents` | Specific bucket prefix + table |
| insight-fetch-history | `dynamodb:Query` | biomarkers table, read-only |
| insight-generate | `bedrock:InvokeModel` | Claude model ARN only |
| insight-store | `dynamodb:PutItem` | insights table only |
| insight-notify | `sns:Publish` | Specific topic ARN only |

### 3.2 Encryption

#### 3.2.1 At Rest

- DynamoDB: AWS-owned encryption (default) with option to upgrade to CMK
- S3: SSE-S3 encryption on all buckets, bucket policy denying unencrypted uploads
- Secrets Manager: AWS KMS encryption for all stored secrets
- SQS: SSE enabled on all queues
- CloudWatch Logs: encrypted with service key

#### 3.2.2 In Transit

- All API Gateway endpoints enforce HTTPS only (TLS 1.2 minimum)
- CloudFront distribution: TLSv1.2_2021 minimum protocol version
- S3 bucket policy: deny any request where `aws:SecureTransport` is false
- Inter-service communication: all AWS SDK calls use TLS by default

### 3.3 Input Validation & Sanitization

All external inputs are validated at multiple layers to prevent injection attacks and data corruption:

| Layer | Validation | Implementation |
|---|---|---|
| API Gateway | JSON Schema validation on request models | RequestValidator with schema per endpoint |
| Lambda (entry) | Pydantic model validation on event payload | Strict mode, no extra fields allowed |
| Lambda (business) | Biomarker range validation against medical reference ranges | Custom validator with configurable ranges per biomarker type |
| S3 Upload | File type validation (CSV only), max size 5MB | Content-Type check + file header magic bytes |
| CSV Parser | Column validation, row-level data type checks, duplicate detection | pandas with strict dtype enforcement |
| Bedrock Prompt | Prompt injection guard: user data is template-injected, never concatenated | Jinja2 templates with autoescaping |

### 3.4 Data Isolation

- **Tenant isolation:** Every DynamoDB item includes a `userId` partition key. All queries require `userId` as a condition. Lambda functions extract `userId` from the verified JWT; it is never accepted from the request body.
- **S3 prefix isolation:** Each user's uploads are stored under `s3://bucket/uploads/{userId}/`. Presigned URLs are scoped to the user's prefix.
- **Query guard pattern:** A shared middleware function enforces that every DynamoDB operation includes the authenticated `userId`. Bypassing this middleware is a blocking code-review finding.

### 3.5 Security Scanning & Compliance

| Tool | Purpose | Integration Point | Blocking? |
|---|---|---|---|
| cdk-nag (AWS Solutions) | CDK construct security checks | CDK synth step | Yes - deploy blocked |
| Bandit | Python static security analysis | Pre-commit + CI | Yes - merge blocked |
| npm audit | Dependency vulnerability scan | CI pipeline | Yes (critical/high) |
| pip-audit | Python dependency scan | CI pipeline | Yes (critical/high) |
| Checkov | IaC misconfiguration detection | CI pipeline | Yes - deploy blocked |
| OWASP ZAP (future) | Dynamic API security testing | Post-deploy stage | Advisory in v1 |

---

## 4. Data Model

DynamoDB is the primary data store, chosen for its serverless scaling model, single-digit millisecond latency, and built-in encryption. The schema uses a single-table design pattern for the core biomarker data and separate tables for insights and audit logs.

### 4.1 DynamoDB Tables

#### 4.1.1 Biomarkers Table

| Attribute | Type | Key | Description |
|---|---|---|---|
| `userId` | S | PK (Partition Key) | Cognito user sub (UUID) |
| `sk` | S | SK (Sort Key) | Composite: `PROFILE` \| `BIOMARKER#{timestamp}#{biomarkerType}` |
| `entityType` | S | GSI1-PK | `PROFILE` or `BIOMARKER` |
| `createdAt` | S | GSI1-SK | ISO 8601 timestamp |
| `biomarkerType` | S | — | E.g., `LDL_CHOLESTEROL`, `HEMOGLOBIN_A1C`, `TSH` |
| `value` | N | — | Numeric biomarker value |
| `unit` | S | — | Unit of measurement (mg/dL, ng/mL, etc.) |
| `referenceRangeLow` | N | — | Lower bound of normal range |
| `referenceRangeHigh` | N | — | Upper bound of normal range |
| `status` | S | — | `OPTIMAL` \| `NORMAL` \| `BORDERLINE` \| `OUT_OF_RANGE` |
| `source` | S | — | `MANUAL` \| `CSV_UPLOAD` \| `API_IMPORT` |
| `batchId` | S | — | Groups records from same CSV upload |
| `ttl` | N | — | Optional TTL for data retention policies |

#### 4.1.2 Insights Table

| Attribute | Type | Key | Description |
|---|---|---|---|
| `userId` | S | PK | Cognito user sub |
| `insightId` | S | SK | `INSIGHT#{timestamp}#{uuid}` |
| `createdAt` | S | GSI1-SK | ISO 8601 |
| `sourceBatchId` | S | — | Reference to biomarker batch that triggered this |
| `category` | S | — | `CARDIOVASCULAR` \| `METABOLIC` \| `HORMONAL` \| `NUTRITIONAL` \| `GENERAL` |
| `summary` | S | — | Short AI-generated summary (< 280 chars) |
| `fullAnalysis` | S | — | Complete AI analysis text |
| `actionPlan` | L (list of maps) | — | Structured action items with priority and category |
| `riskFlags` | L (list of S) | — | Biomarkers flagged as concerning |
| `modelId` | S | — | Bedrock model identifier used |
| `promptVersion` | S | — | Version of prompt template used |

#### 4.1.3 Audit Log Table

| Attribute | Type | Key | Description |
|---|---|---|---|
| `pk` | S | PK | `AUDIT#{userId}` |
| `sk` | S | SK | `#{timestamp}#{eventType}` |
| `eventType` | S | — | `LOGIN` \| `DATA_ACCESS` \| `DATA_WRITE` \| `DATA_DELETE` \| `INSIGHT_GENERATED` |
| `ipAddress` | S | — | Hashed source IP |
| `userAgent` | S | — | Truncated user agent string |
| `resourceId` | S | — | Affected resource identifier |
| `ttl` | N | — | Auto-expire after 365 days |

### 4.2 Access Patterns

| Access Pattern | Table | Key Condition | Index |
|---|---|---|---|
| Get user profile | Biomarkers | `PK=userId, SK=PROFILE` | Main table |
| Get all biomarkers for user | Biomarkers | `PK=userId, SK begins_with BIOMARKER#` | Main table |
| Get biomarkers by type | Biomarkers | `PK=userId, SK begins_with BIOMARKER#` + filter on `biomarkerType` | Main table |
| Get biomarkers in date range | Biomarkers | `PK=userId, SK between BIOMARKER#{start} and BIOMARKER#{end}` | Main table |
| Get latest N insights | Insights | `PK=userId, SK begins_with INSIGHT#, ScanIndexForward=false, Limit=N` | Main table |
| Get all insights by category | Insights | `PK=userId`, filter on `category` | Main table |
| Audit trail for user | AuditLog | `PK=AUDIT#{userId}, SK between timestamps` | Main table |

### 4.3 Biomarker Reference Data

The following biomarker types are supported at launch, with reference ranges sourced from standard clinical guidelines. Ranges are configurable via a JSON configuration file stored in S3.

| Biomarker | Unit | Optimal Low | Optimal High | Category |
|---|---|---|---|---|
| LDL Cholesterol | mg/dL | 0 | 100 | Cardiovascular |
| HDL Cholesterol | mg/dL | 40 | 90 | Cardiovascular |
| Total Cholesterol | mg/dL | 125 | 200 | Cardiovascular |
| Triglycerides | mg/dL | 0 | 150 | Cardiovascular |
| ApoB | mg/dL | 0 | 90 | Cardiovascular |
| Hemoglobin A1C | % | 4.0 | 5.6 | Metabolic |
| Fasting Glucose | mg/dL | 70 | 100 | Metabolic |
| hsCRP | mg/L | 0 | 1.0 | Inflammation |
| TSH | uIU/mL | 0.5 | 4.0 | Thyroid |
| Free T4 | ng/dL | 0.8 | 1.8 | Thyroid |
| Testosterone (Total) | ng/dL | 300 | 1000 | Hormonal |
| Vitamin D (25-OH) | ng/mL | 30 | 80 | Nutritional |
| Ferritin | ng/mL | 30 | 300 | Nutritional |
| Vitamin B12 | pg/mL | 200 | 900 | Nutritional |

---

## 5. Project Structure & Directory Layout

The monorepo is organized into three top-level packages: infrastructure (CDK), backend (Lambda functions), and frontend (React). This structure enables independent deployment while sharing types and configuration.

### 5.1 Directory Tree

```
vitaltrack/
├── infrastructure/           # AWS CDK (TypeScript)
│   ├── bin/
│   │   └── app.ts              # CDK app entry point
│   ├── lib/
│   │   ├── stacks/
│   │   │   ├── auth-stack.ts       # Cognito
│   │   │   ├── api-stack.ts        # API Gateway + Lambda
│   │   │   ├── data-stack.ts       # DynamoDB + S3
│   │   │   ├── events-stack.ts     # EventBridge + SQS
│   │   │   ├── insights-stack.ts   # Step Functions + Bedrock
│   │   │   ├── frontend-stack.ts   # S3 + CloudFront
│   │   │   └── observability-stack.ts  # CloudWatch + X-Ray
│   │   ├── constructs/           # Reusable L3 constructs
│   │   │   ├── secure-lambda.ts    # Lambda with X-Ray, logging, least-priv
│   │   │   ├── secure-bucket.ts    # S3 with encryption, versioning, logging
│   │   │   └── secure-table.ts     # DynamoDB with encryption, PITR, alarms
│   │   └── config/
│   │       └── environments.ts     # Stage-specific config (dev/staging/prod)
│   ├── test/
│   └── cdk.json
├── backend/                  # Lambda functions (Python)
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── biomarker_crud.py
│   │   │   ├── csv_parser.py
│   │   │   ├── upload_presign.py
│   │   │   ├── insight_fetch_history.py
│   │   │   ├── insight_generate.py
│   │   │   ├── insight_store.py
│   │   │   └── insight_notify.py
│   │   ├── models/
│   │   │   ├── biomarker.py        # Pydantic models
│   │   │   ├── insight.py
│   │   │   └── events.py
│   │   ├── services/
│   │   │   ├── dynamodb_service.py # Data access layer
│   │   │   ├── bedrock_service.py  # AI inference wrapper
│   │   │   ├── s3_service.py
│   │   │   └── event_service.py
│   │   ├── middleware/
│   │   │   ├── auth.py             # JWT extraction + userId enforcement
│   │   │   ├── logging_config.py   # Structured JSON logging
│   │   │   ├── error_handler.py    # Consistent error responses
│   │   │   └── audit.py            # Audit log middleware
│   │   ├── prompts/
│   │   │   └── insight_v1.jinja2   # Bedrock prompt template
│   │   ├── config/
│   │   │   ├── biomarker_ranges.json
│   │   │   └── settings.py         # Environment-aware config
│   │   └── shared/
│   │       ├── constants.py
│   │       ├── exceptions.py       # Custom exception hierarchy
│   │       └── validators.py       # Shared validation logic
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── conftest.py           # Shared fixtures, moto mocks
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── pyproject.toml
├── frontend/                 # React (TypeScript)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/             # API client layer
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   └── runbooks/               # Operational runbooks
├── scripts/
│   ├── seed-data.py            # Local dev seed data
│   └── deploy.sh               # Deployment helper
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── Makefile
└── README.md
```

---

## 6. API Specification

All endpoints are served through API Gateway with the base path `/v1`. Responses follow a consistent envelope format. All timestamps are ISO 8601 UTC.

### 6.1 Response Envelope

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO8601",
    "pagination": { "nextToken": "...", "limit": 50 }
  }
}
```

```json
// Error response:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [ { "field": "value", "issue": "must be positive" } ]
  },
  "meta": { "requestId": "uuid", "timestamp": "ISO8601" }
}
```

### 6.2 Endpoints

#### 6.2.1 Biomarkers

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/v1/biomarkers` | Create a single biomarker record | JWT |
| GET | `/v1/biomarkers` | List biomarkers (paginated, filterable by type/date) | JWT |
| GET | `/v1/biomarkers/{sk}` | Get a specific biomarker record | JWT |
| PUT | `/v1/biomarkers/{sk}` | Update a biomarker record | JWT |
| DELETE | `/v1/biomarkers/{sk}` | Soft-delete a biomarker record | JWT |
| POST | `/v1/biomarkers/batch` | Create multiple biomarker records (max 25) | JWT |

#### 6.2.2 Upload

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/v1/upload/presign` | Get a presigned S3 URL for CSV upload | JWT |
| GET | `/v1/upload/{batchId}/status` | Check processing status of an upload batch | JWT |

#### 6.2.3 Insights

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/v1/insights` | List AI-generated insights (paginated) | JWT |
| GET | `/v1/insights/{insightId}` | Get a specific insight with full analysis | JWT |
| POST | `/v1/insights/generate` | Manually trigger insight generation for latest data | JWT |

#### 6.2.4 User Profile

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/v1/profile` | Get user profile and preferences | JWT |
| PUT | `/v1/profile` | Update profile (display name, units preference, notification settings) | JWT |

#### 6.2.5 Health & Ops

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/health` | Service health check | None |

---

## 7. AI Insights Engine

The insights engine is the core differentiator of VitalTrack. It uses Amazon Bedrock with Claude to analyze biomarker trends and generate personalized, actionable health insights. This section defines the prompt engineering strategy, guardrails, and output schema.

### 7.1 Prompt Engineering

#### 7.1.1 System Prompt

The system prompt establishes Claude as a health data analyst (not a doctor) with clear behavioral boundaries:

- Always include a disclaimer that insights are not medical advice
- Never diagnose conditions; instead flag concerning patterns and recommend professional consultation
- Reference specific biomarker values and trends when making observations
- Structure output as JSON matching the `InsightResponse` schema
- Prioritize actionable lifestyle and dietary recommendations
- Use plain language accessible to non-medical users

#### 7.1.2 Prompt Template Structure

The prompt template (`insight_v1.jinja2`) follows this structure:

1. **System context:** Role definition, output format, medical disclaimer requirements
2. **User biomarker history:** Last 3 test results per biomarker, showing trend direction
3. **Current results:** Latest batch with reference ranges and status flags
4. **Analysis instructions:** Specific areas to evaluate (cardiovascular risk, metabolic health, etc.)
5. **Output schema:** JSON structure with summary, category scores, risk flags, and action items

#### 7.1.3 Guardrails

| Guardrail | Implementation | Failure Behavior |
|---|---|---|
| No diagnosis language | Bedrock guardrail + output post-processing regex | Strip and replace with flag-and-refer language |
| No prescription advice | System prompt constraint + post-processing | Remove and replace with consult-your-doctor CTA |
| Prompt injection defense | User data injected via Jinja2 template variables, not concatenated | Malformed data is escaped automatically |
| Output schema validation | Pydantic model validation of JSON response | Retry once with explicit schema reminder; fail gracefully |
| Token budget | `max_tokens` set to 4096 for responses | Truncation handled by structured output format |
| Hallucination mitigation | Only reference biomarkers present in input data | Post-processing cross-check against input biomarker list |

### 7.2 Insight Output Schema

```json
{
  "summary": "string (< 280 chars)",
  "overallScore": "number (0-100)",
  "categoryScores": {
    "cardiovascular": { "score": "0-100", "trend": "improving|stable|declining" },
    "metabolic": { "score": "0-100", "trend": "..." },
    "hormonal": { "score": "0-100", "trend": "..." },
    "nutritional": { "score": "0-100", "trend": "..." },
    "inflammation": { "score": "0-100", "trend": "..." }
  },
  "riskFlags": [
    {
      "biomarker": "LDL_CHOLESTEROL",
      "severity": "high|medium|low",
      "message": "..."
    }
  ],
  "actionPlan": [
    {
      "priority": 1,
      "category": "diet|exercise|supplement|lifestyle|medical",
      "title": "string",
      "description": "string",
      "relevantBiomarkers": ["LDL_CHOLESTEROL", "APOB"],
      "timeframe": "string (e.g., '2-4 weeks')"
    }
  ],
  "disclaimer": "This analysis is not medical advice. Consult a healthcare provider."
}
```

### 7.3 Step Functions Workflow

The insight generation pipeline is orchestrated by a Step Functions Express Workflow with the following states:

| State | Type | Lambda | Error Handling |
|---|---|---|---|
| FetchHistory | Task | `insight_fetch_history` | Retry 2x with backoff, then fail |
| ValidateData | Choice | (inline) | If < 3 biomarkers, skip to InsufficientData |
| GenerateInsight | Task | `insight_generate` | Retry 3x (Bedrock throttling), catch all → fallback |
| ValidateOutput | Task | (inline) | Pydantic validation; retry once on schema mismatch |
| StoreInsight | Task | `insight_store` | Retry 2x, then DLQ |
| NotifyUser | Task | `insight_notify` | Retry 2x, catch → log warning (non-blocking) |
| InsufficientData | Pass | — | Return message explaining more data needed |
| Fallback | Pass | — | Store error context, notify ops team |

---

## 8. Frontend Specification

The frontend is a React (TypeScript) single-page application built with Vite, styled with Tailwind CSS, and deployed as a static site to S3 behind CloudFront. It communicates exclusively with the API Gateway backend.

### 8.1 Technology Stack

| Technology | Purpose | Version |
|---|---|---|
| React | UI framework | 18.x |
| TypeScript | Type safety | 5.x |
| Vite | Build tool | 5.x |
| Tailwind CSS | Utility-first styling | 3.x |
| React Router | Client-side routing | 6.x |
| TanStack Query | Server state management | 5.x |
| Recharts | Biomarker trend charts | 2.x |
| AWS Amplify Auth | Cognito integration (auth only, not full Amplify) | 6.x |
| Zod | Runtime type validation for API responses | 3.x |

### 8.2 Page Structure

| Route | Page | Description |
|---|---|---|
| `/login` | LoginPage | Email/password login with Cognito |
| `/register` | RegisterPage | Account creation with email verification |
| `/dashboard` | DashboardPage | Health score overview, recent insights, biomarker sparklines |
| `/biomarkers` | BiomarkersPage | Full biomarker list with filters, trend charts |
| `/biomarkers/:id` | BiomarkerDetailPage | Single biomarker history with full chart and reference ranges |
| `/upload` | UploadPage | CSV upload with drag-and-drop, processing status tracker |
| `/insights` | InsightsPage | AI insight cards with action plan items |
| `/insights/:id` | InsightDetailPage | Full insight analysis with linked biomarkers |
| `/profile` | ProfilePage | User settings, notification prefs, unit preferences |

### 8.3 Key UI Components

- **HealthScoreCard:** Circular progress ring showing overall score (0-100) with color coding
- **BiomarkerSparkline:** Inline mini-chart showing last 5 values with trend arrow
- **BiomarkerChart:** Full Recharts line chart with reference range band overlay
- **InsightCard:** Expandable card showing summary, risk flags, and action items
- **ActionPlanItem:** Checkable action item with category icon, timeframe, and linked biomarkers
- **UploadDropzone:** Drag-and-drop area with file validation, progress bar, and status polling
- **CSVTemplateDownload:** Button to download a pre-formatted CSV template for data entry

### 8.4 Design System

The UI follows a clean, health-focused design language with the following principles:

- **Color palette:** Primary blue (`#1A5276`), success green (`#1E8449`) for optimal, amber (`#B7950B`) for borderline, red (`#922B21`) for out-of-range, neutral grays for structure
- **Typography:** Inter for body text, JetBrains Mono for data values and biomarker readings
- **Spacing:** 8px base grid, 16px component padding, 24px section gaps
- **Cards:** White background, subtle border (1px gray-200), 12px border-radius, light shadow on hover
- **Data density:** Dashboard prioritizes scanability; detailed views allow drill-down
- **Accessibility:** WCAG 2.1 AA compliance; color is never the sole indicator of status (always paired with text/icon)

---

## 9. Observability & Operations

Observability is a first-class concern. Every Lambda function produces structured JSON logs, emits custom CloudWatch metrics, and participates in X-Ray distributed tracing. The goal is full visibility into every request from CloudFront edge to DynamoDB and back.

### 9.1 Structured Logging Standard

All Lambda functions use a shared logging configuration that produces JSON logs with the following fields:

```json
{
  "timestamp": "ISO8601",
  "level": "INFO|WARN|ERROR",
  "service": "biomarker-crud",
  "function": "handler",
  "requestId": "API Gateway request ID",
  "correlationId": "X-Correlation-Id header (propagated across services)",
  "userId": "authenticated user ID (never PII beyond this)",
  "message": "Human-readable log message",
  "data": {},
  "error": {
    "type": "ValidationError",
    "message": "...",
    "stackTrace": "..."
  }
}
```

### 9.2 CloudWatch Alarms

| Alarm | Metric | Threshold | Action |
|---|---|---|---|
| API 5xx Spike | API Gateway 5XXError | > 5 in 5 minutes | SNS → ops email |
| Lambda Errors | Lambda Errors (per function) | > 3 in 5 minutes | SNS → ops email |
| DynamoDB Throttle | ThrottledRequests | > 0 in 1 minute | SNS → ops email |
| Insight Pipeline Failure | Step Functions ExecutionsFailed | > 1 in 15 minutes | SNS → ops email |
| DLQ Depth | SQS ApproximateNumberOfMessagesVisible | > 0 | SNS → ops email |
| Bedrock Throttle | Custom metric from Lambda | > 3 in 5 minutes | SNS → ops email |
| Cold Start Budget | Custom metric (init duration > 2s) | > 5 in 15 minutes | Advisory (non-paging) |

### 9.3 X-Ray Tracing

- Active tracing enabled on API Gateway and all Lambda functions
- Custom X-Ray subsegments for DynamoDB calls, S3 operations, and Bedrock invocations
- Sampling rule: 100% of errors, 10% of successful requests (adjustable per stage)
- Service map provides visual topology of all service dependencies

### 9.4 CloudWatch Dashboard

A single operational dashboard (deployed via CDK) with the following widgets:

- API Gateway: request count, latency (p50/p95/p99), 4xx/5xx rates
- Lambda: invocation count, error rate, duration (per function), concurrent executions
- DynamoDB: read/write capacity consumed, throttle events, latency
- Step Functions: executions started/succeeded/failed, duration
- SQS DLQ: message count (should always be 0)
- Bedrock: invocation count, latency, token usage

---

## 10. Code Quality Standards

> **⚠️ Non-Negotiable Quality Gates**
>
> No code is considered complete until it passes all linting, type checking, security scanning, and testing gates defined in this section. These gates are enforced in CI and must also pass locally before committing.

### 10.1 Python (Backend)

| Tool | Purpose | Configuration |
|---|---|---|
| Python 3.12 | Runtime | Match Lambda runtime exactly |
| Ruff | Linting + formatting (replaces black, isort, flake8) | `pyproject.toml`: line-length=100, target-version=py312 |
| mypy | Static type checking | strict mode, no implicit optional |
| Pydantic v2 | Runtime data validation | Strict mode for all API models |
| pytest | Testing framework | Minimum 80% coverage enforced |
| pytest-cov | Coverage measurement | Fail under 80% |
| moto | AWS service mocking | Used in all unit tests for DynamoDB, S3, SQS |
| Bandit | Security linting | All severity levels checked |
| pip-audit | Dependency vulnerability scan | Critical and high block merge |

### 10.2 TypeScript (Infrastructure + Frontend)

| Tool | Purpose | Configuration |
|---|---|---|
| TypeScript 5.x | Type safety | `strict: true`, `noUncheckedIndexedAccess: true` |
| ESLint | Linting | typescript-eslint recommended + react-hooks |
| Prettier | Formatting | printWidth: 100, singleQuote: true |
| Vitest | Frontend testing | Minimum 70% coverage |
| jest | CDK testing | Snapshot tests for all stacks |
| cdk-nag | CDK security checks | AWS Solutions pack, all rules enabled |
| npm audit | Dependency scan | Critical and high block merge |

### 10.3 Code Review Checklist

Every piece of code (including CDK constructs) must satisfy this checklist. Use this as a mental model during implementation:

1. **Security:** No hardcoded secrets, no wildcard IAM permissions, no unvalidated input reaches a data store or external service
2. **Error handling:** Every external call (AWS SDK, Bedrock, DynamoDB) is wrapped in try/except with specific exception types, not bare except
3. **Logging:** Every handler logs entry (INFO) and exit (INFO) with correlation ID; errors include full context
4. **Data isolation:** Every DynamoDB operation includes `userId` from JWT; no user can access another user's data
5. **Idempotency:** Write operations use conditional expressions or idempotency keys to prevent duplicates
6. **Type safety:** All function signatures are fully typed; no `Any` types in Python (use `Union` or specific types)
7. **Testing:** Unit test covers happy path, at least one error path, and one edge case per function
8. **Documentation:** Public functions have docstrings; complex logic has inline comments explaining *why*, not *what*

---

## 11. Implementation Phases

The project is divided into four phases, each producing a working, deployable increment. Each phase has clear entry criteria, deliverables, and acceptance tests.

### Phase 1: Foundation (Estimated 1-2 Weeks)

**Goal:** Core infrastructure, authentication, and biomarker CRUD API with full test coverage.

#### Deliverables

1. CDK project initialized with auth-stack, data-stack, and api-stack
2. Cognito User Pool with email sign-up, password policy, and JWT authorizer
3. DynamoDB biomarkers table with encryption and PITR
4. Lambda functions: `biomarker_crud` (create, read, list, update, delete)
5. API Gateway REST API with Cognito authorizer and request validation
6. Shared middleware: auth extraction, structured logging, error handling
7. Pydantic models for all request/response schemas
8. Unit tests with moto for all DynamoDB operations (target: 85% coverage)
9. CDK snapshot tests for all stacks
10. cdk-nag passing with zero suppressions

#### Acceptance Criteria

- User can register, login, and receive a JWT
- Authenticated user can create, read, update, and delete biomarker records
- User A cannot read or modify User B's records (verified by integration test)
- Invalid biomarker values are rejected with clear error messages
- All CloudWatch logs are structured JSON with correlation IDs
- `cdk deploy` succeeds in a clean AWS account

### Phase 2: CSV Upload Pipeline (Estimated 1 Week)

**Goal:** Users can upload CSV files of lab results that are parsed, validated, and stored as biomarker records.

#### Deliverables

1. S3 data bucket with encryption, versioning, and CORS for presigned uploads
2. Lambda: `upload_presign` (generates scoped presigned PUT URL)
3. Lambda: `csv_parser` (validates and ingests CSV rows)
4. EventBridge custom bus with S3 → parser rule
5. SQS dead-letter queue for failed parse jobs
6. CSV template file and validation documentation
7. Batch status tracking (DynamoDB item per upload batch with status enum)
8. Unit tests for CSV parsing: valid file, malformed file, wrong columns, out-of-range values, duplicate detection

#### Acceptance Criteria

- User receives a presigned URL scoped to their S3 prefix
- Uploading a valid CSV creates biomarker records with correct values
- Malformed CSV does not create partial records (atomic: all or nothing per batch)
- Failed uploads land in the DLQ with error context
- Upload status is queryable via API

### Phase 3: AI Insights Engine (Estimated 1-2 Weeks)

**Goal:** Automated AI-powered health insights generated after biomarker data is ingested.

#### Deliverables

1. Step Functions Express Workflow with all states defined in Section 7.3
2. Lambda: `insight_fetch_history`, `insight_generate`, `insight_store`, `insight_notify`
3. Bedrock integration with Claude model, guardrails configured
4. Jinja2 prompt template (v1) with versioning
5. Insights DynamoDB table
6. SNS topic for user notifications (email)
7. EventBridge rule: `BiomarkersIngested` → Step Functions
8. Output validation against `InsightResponse` Pydantic model
9. Unit tests mocking Bedrock responses
10. Integration test: end-to-end from CSV upload to stored insight

#### Acceptance Criteria

- Uploading biomarker data triggers insight generation within 30 seconds
- Generated insight follows the JSON schema with no hallucinated biomarkers
- Insight includes a medical disclaimer
- Insufficient data (< 3 biomarkers) returns a helpful message instead of a bad insight
- Bedrock throttling is handled gracefully with retries
- User receives email notification when insight is ready

### Phase 4: Frontend & Observability (Estimated 2 Weeks)

**Goal:** Full React dashboard deployed to CloudFront with operational monitoring.

#### Deliverables

1. React app with all pages from Section 8.2
2. Cognito-integrated authentication flow (login, register, logout, token refresh)
3. Biomarker trend charts using Recharts with reference range overlays
4. AI insight display with action plan UI
5. CSV upload page with drag-and-drop and status polling
6. S3 + CloudFront deployment via CDK (OAC, custom error pages)
7. CloudWatch dashboard with all widgets from Section 9.4
8. X-Ray tracing enabled across all services
9. CloudWatch alarms from Section 9.2
10. Audit log table populated for all data access events
11. Operational runbook documentation

#### Acceptance Criteria

- User can register, login, and view dashboard at the CloudFront URL
- Dashboard displays biomarker cards with sparklines and health scores
- User can upload a CSV and see processed results within 60 seconds
- Insight detail page shows AI analysis with linked biomarker charts
- CloudWatch dashboard shows all key metrics updating in real time
- X-Ray service map shows full request trace from CloudFront to DynamoDB
- All alarms are in OK state after a clean deployment

---

## 12. CI/CD Pipeline

The project uses GitHub Actions for CI and CDK Pipelines for CD. All merges to main trigger the full pipeline. No manual deployments.

### 12.1 CI Pipeline (GitHub Actions)

Triggered on every push and pull request:

1. **Checkout + Setup:** Install Python 3.12, Node 20, project dependencies
2. **Backend Lint:** `ruff check` + `ruff format --check` + `mypy --strict`
3. **Backend Security:** `bandit -r src/` + `pip-audit`
4. **Backend Test:** `pytest --cov=src --cov-fail-under=80`
5. **Frontend Lint:** `eslint` + `prettier --check` + `tsc --noEmit`
6. **Frontend Security:** `npm audit --audit-level=high`
7. **Frontend Test:** `vitest --coverage`
8. **CDK Synth:** `cdk synth` (validates all stacks compile)
9. **CDK Security:** cdk-nag checks on synthesized template
10. **CDK Test:** jest snapshot tests for all stacks

### 12.2 Deployment Pipeline

| Stage | Environment | Trigger | Gate |
|---|---|---|---|
| Build | — | Push to main | All CI checks pass |
| Deploy Dev | dev | Automatic after build | CDK diff review (automated) |
| Integration Tests | dev | Post-deploy | API smoke tests pass |
| Deploy Staging | staging | Manual approval (future) | All integration tests green |
| Deploy Prod | prod | Manual approval (future) | Staging stable for 24h |

### 12.3 Environment Configuration

| Config Key | Dev | Staging | Prod |
|---|---|---|---|
| Lambda memory | 256 MB | 512 MB | 512 MB |
| Lambda timeout | 15 sec | 30 sec | 30 sec |
| DynamoDB capacity | On-demand | On-demand | On-demand |
| X-Ray sampling | 100% | 50% | 10% |
| Log retention | 7 days | 30 days | 90 days |
| CloudFront price class | 100 (NA+EU) | 100 | All edge locations |
| Cognito MFA | Optional | Optional | Recommended |
| Bedrock model | Claude Sonnet | Claude Sonnet | Claude Sonnet |

---

## 13. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Bedrock rate limiting during insight generation | High | Medium | Exponential backoff retry in Step Functions; circuit breaker pattern; queue insights during throttle |
| DynamoDB hot partition (power user with thousands of biomarkers) | Medium | Low | Partition key is userId; sort key distributes within partition; monitor with CloudWatch contributor insights |
| Prompt injection via biomarker notes/comments field | High | Medium | All user data goes through Jinja2 template variables (auto-escaped); Bedrock guardrails as secondary defense |
| Cold start latency exceeding 2-second budget | Medium | Medium | ARM64 runtime, minimal dependencies in Lambda layer, provisioned concurrency for critical paths (future) |
| CSV upload with malicious content (formula injection) | Medium | Low | Parse as raw text (not Excel); strip leading `=`, `+`, `-`, `@` from cell values; validate against expected types |
| Cost overrun from unexpected Bedrock usage | Medium | Low | Per-user daily insight generation limit (3/day); Bedrock budget alert at $50/month; circuit breaker at $100 |
| Stale CDK constructs or missing security patches | Medium | Medium | Dependabot enabled; quarterly CDK version bump; cdk-nag catches new rule violations |

---

## 14. Glossary

| Term | Definition |
|---|---|
| Biomarker | A measurable indicator of a biological state or condition (e.g., LDL cholesterol, blood glucose) |
| PITR | Point-in-Time Recovery; DynamoDB feature for continuous backups |
| OAC | Origin Access Control; CloudFront feature to securely access S3 origins |
| DLQ | Dead-Letter Queue; catches messages/events that fail processing |
| CMK | Customer Managed Key; KMS encryption key controlled by the user |
| Guardrail | Amazon Bedrock feature that filters model outputs for safety and compliance |
| Express Workflow | Step Functions execution type optimized for short, high-volume workflows |
| cdk-nag | CDK aspect that checks constructs against security best practices |
| Moto | Python library that mocks AWS services for unit testing |
| Pydantic | Python library for data validation using type annotations |
| Tenant Isolation | Ensuring each user can only access their own data |

---

*End of Document*