---
name: acp
description: Agent Client Protocol (ACP) integration guidance. Applies when implementing agent communication, host/agent boundaries, filesystem/terminal capabilities, permission models, or any ACP session lifecycle in this project. Use ACP terminology and keep host logic deterministic — never duplicate agent reasoning in the host.
user-invocable: false
---

# ACP (Agent Client Protocol) Integration Skill

## Purpose

This project uses **Agent Client Protocol (ACP)** to communicate with AI coding agents. Before implementing any agent integration, understand ACP's architecture and responsibilities.

## What ACP Is

ACP is a protocol that standardizes communication between a code editor/IDE (the **client**) and an AI coding agent — analogous to how LSP standardizes editor↔language-server communication.

Think of it as:

```
User
    │
Client (editor / IDE / host application)
    │
 ACP  (JSON-RPC)
    │
Agent (Codex, Claude Code, Gemini CLI, etc.)
```

ACP is **not** an AI framework.

ACP is **not** a replacement for the agent's reasoning.

ACP is the communication layer.

---

## Responsibilities

### The AI Agent

The agent is responsible for:

* reasoning
* planning
* deciding which tools to use
* deciding what files to edit
* generating code
* determining whether tests should run
* retrying after failures
* producing diffs

The host application should **never attempt to duplicate this logic.**

---

### The Host Application

The host application is responsible for exposing capabilities through ACP.

Typical capabilities include:

* filesystem access
* terminal access
* permission requests
* streaming output
* progress reporting
* session lifecycle
* configuration

The host owns the local environment.

---

## Permission Model

ACP separates decisions from execution. The agent requests permission before sensitive tool calls via `session/request_permission`; the host displays a UI and returns the user's decision.

The host—not the agent—enforces permissions.

The exact permission option kinds, request/response shapes, and cancellation semantics are versioned in the spec. **Do not hardcode them from memory** — query context7 (library `agentclientprotocol/agent-client-protocol`) for the current `session/request_permission` and `PermissionOption` definitions before implementing permission handling.

---

## Filesystem

The agent requests operations such as:

* read file
* write file
* rename
* delete

The host performs the requested operation if allowed.

The host should not modify or reinterpret the request.

---

## Terminal

The agent decides when to:

* create a terminal
* execute commands
* monitor output
* terminate processes

The host provides terminal execution and streams stdout/stderr back through ACP.

---

## Conflict Resolution

The host should avoid implementing agent-specific logic.

If the filesystem changes unexpectedly:

* reject stale writes when appropriate
* return current content
* allow the agent to retry

The agent should determine how to merge changes.

---

## Design Principles

When building ACP integrations:

* Never duplicate the agent's planner.
* Never reimplement code editing algorithms.
* Never guess what the agent intends.
* Keep the host deterministic.
* Keep business logic inside the agent.
* Prefer protocol capabilities over custom APIs.

---

## When Custom Features Are Needed

If functionality is outside the ACP specification:

1. Check whether an ACP extension already exists.
2. Prefer ACP extensions over proprietary APIs.
3. If a custom API is necessary, isolate it behind a capability interface.

---

## Documentation

Read the ACP specification before implementing protocol behavior. The spec is versioned (v1 draft, v2) and evolves — **always pull current details from context7** (library `agentclientprotocol/agent-client-protocol`) rather than relying on memory or the summaries in this skill.

Authoritative spec sources (use more than one when verifying):

* **Official docs site:** https://agentclientprotocol.com
* **Canonical repository (spec + schemas):** https://github.com/agentclientprotocol/agent-client-protocol
* **Python SDK:** https://github.com/agentclientprotocol/python-sdk
* **TypeScript SDK:** https://github.com/agentclientprotocol/typescript-sdk
* **Rust SDK:** https://github.com/agentclientprotocol/rust-sdk (crate `agent-client-protocol`)
* **Kotlin SDK:** https://github.com/agentclientprotocol/kotlin-sdk
* **Java SDK:** https://github.com/agentclientprotocol/java-sdk

When querying context7, useful topics include:

* capabilities (session, terminal, filesystem, MCP)
* session lifecycle (`session/new`, `session/prompt`, `session/cancel`, `session/update`)
* filesystem methods (`fs/read_text_file`, etc. — client-mediated)
* terminal methods
* permissions (`session/request_permission`, `PermissionOption`)
* progress notifications and streaming
* JSON-RPC transport

---

## Official SDKs

Prefer official ACP libraries instead of implementing the protocol manually.
Known official SDKs (verify current status via context7 before adding a dependency):

* **Python** — `agentclientprotocol/python-sdk`
* **TypeScript** — `agentclientprotocol/typescript-sdk` (npm `@agentclientprotocol/sdk`)
* **Rust** — `agentclientprotocol/rust-sdk` (crate `agent-client-protocol`)
* **Reference agents** — e.g. `agentclientprotocol/claude-agent-acp`

---

## Guidance for AI Agents

When working in this repository:

* Assume ACP is the integration mechanism.
* Use ACP terminology consistently.
* Do not design proprietary agent communication protocols unless explicitly requested.
* Prefer protocol compliance over convenience.
* If uncertain about protocol behavior, query context7 (library `agentclientprotocol/agent-client-protocol`) for the current spec before making architectural decisions.

When discussing architecture, distinguish clearly between:

* responsibilities of the AI agent
* responsibilities of the ACP host
* responsibilities of the user interface

Keeping these concerns separate results in simpler, more maintainable systems.
