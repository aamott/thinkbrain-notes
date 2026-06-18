# Git

## Decision

Use system Git for MVP.

## Reasons

- reliable
- familiar to users
- supports SSH and existing credentials
- supports the full Git feature set
- avoids maintaining an embedded Git implementation early

## MVP Features

- detect whether workspace is a Git repository
- initialize repository
- show status
- stage files
- unstage files
- commit staged changes
- list branches
- show current branch
- basic diff viewing if practical

## Native Boundary

Git commands should run through the desktop/native layer so failures can be captured and reported consistently.

## Error Handling

Git integration must fail loudly with useful messages for:

- Git not installed
- workspace is not a repository
- authentication failure
- merge conflict
- command timeout or non-zero exit

## Deferred

Not in MVP:

- embedded Git implementation
- advanced conflict editor
- push/pull UX polish
- Git hosting provider integrations
