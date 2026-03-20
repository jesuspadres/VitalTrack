.PHONY: install install-backend install-infra install-frontend lint lint-backend lint-infra test test-backend test-infra test-frontend synth deploy-dev

# ─── Install ────────────────────────────────────────────────────
install: install-backend install-infra install-frontend

install-backend:
	cd backend && pip install -r requirements.txt -r requirements-dev.txt

install-infra:
	cd infrastructure && npm ci

install-frontend:
	cd frontend && npm ci

# ─── Lint ───────────────────────────────────────────────────────
lint: lint-backend lint-infra

lint-backend:
	cd backend && ruff check src/ tests/ && ruff format --check src/ tests/ && mypy --strict src/

lint-infra:
	cd infrastructure && npx eslint . && npx prettier --check .

# ─── Security ───────────────────────────────────────────────────
security-backend:
	cd backend && bandit -r src/ && pip-audit

security-infra:
	cd infrastructure && npm audit --audit-level=high

security-frontend:
	cd frontend && npm audit --audit-level=high

# ─── Test ───────────────────────────────────────────────────────
test: test-backend test-infra test-frontend

test-backend:
	cd backend && pytest --cov=src --cov-fail-under=80 tests/

test-infra:
	cd infrastructure && npx jest

test-frontend:
	cd frontend && npx vitest run --coverage

# ─── CDK ────────────────────────────────────────────────────────
synth:
	cd infrastructure && npx cdk synth

deploy-dev:
	cd infrastructure && npx cdk deploy --all -c stage=dev

diff:
	cd infrastructure && npx cdk diff --all -c stage=dev

# ─── Seed Data ──────────────────────────────────────────────────
seed:
	python scripts/seed-data.py
