# SOC 2 Control Exceptions

A requirement that cannot be met as written is recorded here rather than ignored.
Every exception needs a compensating control, an approver, and an expiry. Expired
exceptions are findings. Review this file quarterly.

| ID | Requirement | Scope (paths/services) | Rationale | Compensating control | Approver | Opened | Expires | Status |
|----|-------------|------------------------|-----------|----------------------|----------|--------|---------|--------|
| EX-001 | CHG-01 (branch protection), CHG-02 (required checks) | GitHub `aggtushar123/revenact-frontend` | Private repository on the GitHub Free plan: branch protection and rulesets are unavailable (API returns 403 "Upgrade to GitHub Pro or make this repository public"). Closed 2026-09-16 when the repository was public with a ruleset; **reopened 2026-10-15**: it is private again, so the ruleset no longer applies. | Cloud Build runs `cloudbuild-ci.yaml` (lint, tests, build) and `cloudbuild-soc2.yaml` (gitleaks, npm audit, semgrep, heuristic scan) on every pull request to `main` and reports them on the PR; only `main` builds images and deploys, through the public `revenact-deploy` pipeline with a smoke test and rollback; pre-commit gitleaks locally; CODEOWNERS and PR template in place; one maintainer today. Same as backend EX-002. | [TODO: name] | 2026-09-15 | 2027-03-31 | open |
