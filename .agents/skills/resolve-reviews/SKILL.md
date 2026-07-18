---
name: resolve-reviews
description: Triage, fix, and delete review finding files. Dispatches parallel, non-overlapping subagents.
argument-hint: "[reviews-folder] (default: most recent docs/reviews/<date>/)"
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - write
  - edit
  - run_subagent
  - read_subagent
  - kill_shell
  - todo_write
  - find_file_by_name
---

# Resolve Review Backlog

Process a folder of review finding files (formatted as `<slug>,<difficulty>,<urgency>.md`). For each finding: **validate → plan → implement → verify → delete**. 

**CRITICAL RULE:** After a review action item is fixed and verified, you MUST **delete** its corresponding file. 

## 1. Backlog & Grouping
- Target the requested folder (default: most recent `docs/reviews/<YYYY-MM-DD>/` containing pending `.md` files). Ignore `README.md` and already-resolved files (`*wontfix.md`, `*deferred.md`).
- **Group tasks to prevent conflicts:** 
  - **Parallel:** Group `trivial`/`easy`/`medium` items by primary file. Dispatch up to 4 concurrent subagents, ensuring **no two active subagents can touch the same file**.
  - **Serial:** Run cross-cutting, multi-file, or `hard` difficulty items strictly one at a time.

## 2. Subagent Dispatch
Dispatch subagents with an explicit list of allowed files and include these instructions:
1. **Validate:** Confirm the issue is real and worth fixing. If the churn/risk outweighs the benefit, do not fix it.
2. **Execute & Verify:** Implement the minimal fix. Run localized, package-scoped tests and linters only.
3. **Report:** Output exactly one status per finding:
   - `DONE — <summary>`
   - `WONTFIX — <reason>`
   - `DEFER — <reason>`
   - `NEEDS-SCOPE — <file/dependency> — <why>`

## 3. Process Results
Process subagent reports immediately:
- **DONE:** Spot-check the diff, run targeted tests, and **DELETE the review file**. 
- **WONTFIX:** Append `## Resolution - WONTFIX` + reasoning to the bottom of the file, then rename it to `...,wontfix.md` to prevent re-review.
- **DEFER:** Add the issue to `docs/known-issues.md`, then rename the review file to `...,deferred.md`.
- **NEEDS-SCOPE:** Widen the subagent's allowed files and re-run the item serially so it cannot conflict with parallel work.

## 4. Final Verification
After the queue is clear:
1. Run a single project-wide verification step (e.g., global tests, builds, and linters).
2. Print a short summary of the session: items deleted (done), items marked wontfix/deferred, and anything still pending.