---
name: comprehensive-review
description: Parallel subagent code review. Subagents read files, analyze, and immediately write actionable markdown findings as they work.
argument-hint: "[base-ref]  (default: HEAD)"
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

# Continuous Parallel Review

Review uncommitted changes by dispatching parallel subagents. Subagents analyze files sequentially, evaluate cross-file connections, and write actionable findings immediately as they work.

## 1. Scope & Plan

* **Identify changes:** `git status --short`, `git diff --stat` (unstaged), `git diff --cached --stat` (staged). Diff against `<base>` if provided. Stop if no changes.
* **Group files:** Divide changed files into logical units (e.g., Backend, Frontend, Docs/Config).
* **Create Plan:** Use `todo_write` to map out batches (max 4 subagents per batch) and the final summary.

## 2. Dispatch Subagents

Run up to **4 `small` subagents in parallel** (`is_background: true`). Pass these strict instructions to every subagent:

**Subagent Workflow:**

1. **Read** a file from your assigned list.
2. **Consider** the code against the issue categories.
3. **Write** a markdown file immediately if you find an actionable item. (Skip if clean).
4. **Repeat** for the next file.
5. **Consider connections** between all assigned files and write any cross-file findings.
6. **Rule:** Write *only* action items.

**Constraints:**

* NO long-running/background commands. NO build/test commands (`go test`, `npm build`, etc.). Use only `read`, `grep`, and `git diff`.

**Issue Categories:**

* **Backend (Go):** Leaks, race conditions, security gaps, missing locks, test validity, API breaks.
* **Frontend (React/TS):** Stale closures, missing effect deps, memory leaks, accessibility, TS type gaps, Tailwind violations.
* **Docs/Config:** Stale info, broken cross-references, unused/unpinned dependencies.

## 3. Subagent File Writing Protocol

Subagents must write each finding to `docs/reviews/<YYYY-MM-DD>/<slug>,<difficulty>,<urgency>.md`.

* **Slug:** kebab-case descriptive name.
* **Difficulty:** `trivial`, `easy`, `medium`, `hard`
* **Urgency:** `low`, `medium`, `high`, `critical`

**File Template:**

```markdown
# <Finding Title>

- **Difficulty:** <level>
- **Urgency:** <level>
- **File:** `<path>`
- **Lines:** <range>

## Description
<What the issue is and why it matters>

## Recommendation
<Actionable fix>

## Verification
<How you confirmed the issue>

```

## 4. Monitor Batches

* Wait for the batch of 4 to finish (`read_subagent` with `block: true`).
* If a subagent hangs, use `kill_shell` and re-dispatch with stricter limits.
* Mark todos complete as batches finish.

## 5. Final Summary

Once all batches finish, create `docs/reviews/<YYYY-MM-DD>/README.md`:

* Summary of the reviewed scope.
* Total finding count.
* Tables grouping findings by urgency, with file links and difficulty.

Output a brief summary to the user highlighting the highest-urgency findings and linking to the index README.