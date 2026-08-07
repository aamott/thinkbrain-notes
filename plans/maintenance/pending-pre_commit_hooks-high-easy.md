# Automated QA Pre-Commit Hooks

**Status:** complete and excluded from active backlog; filename status cleanup is deferred.

## Goal

Prevent bad code (lint errors, type errors) from entering the codebase by enforcing checks before a commit can be made.

## Design

- Set up `husky` and `lint-staged` in the root `package.json`.
- When a user runs `git commit`, `lint-staged` runs `eslint --fix` and `prettier` (if applicable) on staged files only.
- Run a fast typecheck on staged files to catch TypeScript errors early.
- Keep the hook fast to prevent developer friction. Full test suites remain in `scripts/qa.sh` or CI.

## Acceptance Criteria

- [x] `husky` initialized in the repository.
- [x] `lint-staged` configured to run ESLint on staged `.ts`/`.tsx` files.
- [x] Commits with lint/type errors are blocked with a clear message.
- [x] Pre-commit hook runs quickly (under ~5 seconds for small commits).
