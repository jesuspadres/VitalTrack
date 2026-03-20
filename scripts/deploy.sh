#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-dev}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "═══════════════════════════════════════════════════════"
echo "  VitalTrack Deployment — Stage: ${STAGE}"
echo "  Region: ${REGION}"
echo "═══════════════════════════════════════════════════════"

# Validate stage
if [[ ! "$STAGE" =~ ^(dev|staging|prod)$ ]]; then
  echo "ERROR: Invalid stage '${STAGE}'. Must be dev, staging, or prod."
  exit 1
fi

# Production safety gate
if [[ "$STAGE" == "prod" ]]; then
  echo ""
  echo "⚠️  WARNING: You are deploying to PRODUCTION"
  read -rp "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Deployment cancelled."
    exit 0
  fi
fi

echo ""
echo "──── Step 1: Backend lint + test ────"
cd backend
echo "Running ruff check..."
ruff check src/ tests/
echo "Running ruff format check..."
ruff format --check src/ tests/
echo "Running mypy..."
mypy --strict src/
echo "Running bandit..."
bandit -r src/ -q
echo "Running tests..."
pytest --cov=src --cov-fail-under=80 tests/
cd ..

echo ""
echo "──── Step 2: Infrastructure lint + test ────"
cd infrastructure
echo "Running CDK synth..."
npx cdk synth -c stage="$STAGE" --quiet
echo "Running CDK tests..."
npx jest --passWithNoTests
cd ..

echo ""
echo "──── Step 3: CDK Deploy ────"
cd infrastructure
echo "Deploying all stacks for stage: ${STAGE}..."
npx cdk deploy --all -c stage="$STAGE" --require-approval never
cd ..

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment complete! Stage: ${STAGE}"
echo "═══════════════════════════════════════════════════════"
