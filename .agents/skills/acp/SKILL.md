---
name: acp
description: Agent Client Protocol (ACP) integration guidance. Applies when implementing agent communication, host/agent boundaries, filesystem/terminal capabilities, permission models, or any ACP session lifecycle in this project. Use ACP terminology and keep host logic deterministic — never duplicate agent reasoning in the host.
user-invocable: false
---

# ACP (Agent Client Protocol) Integration Skill

## Purpose

This project uses **Agent Client Protocol (ACP)** to communicate with AI coding agents. Before implementing any agent integration, understand ACP's architecture and responsibilities.

## What ACP Is

ACP is a protocol that standardizes communication between a host application and an AI coding agent.

Think of it as:

```
User
    │
Host Application
    │
 ACP
    │
AI Agent (Codex, Claude Code, Gemini CLI, etc.)
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

ACP separates decisions from execution.

The agent requests permission when appropriate.

Example:

```
session/request_permission
```

The host displays a UI.

The user decides:

* Allow once
* Always allow
* Deny

The host sends the decision back to the agent.

The host—not the agent—enforces permissions.

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

Read the ACP specification before implementing protocol behavior.

Primary specification:

https://github.com/zed-industries/agent-client-protocol

Alternative mirror:

https://agentclientprotocol.com

Search for:

* capabilities
* session lifecycle
* filesystem
* terminal
* permissions
* progress notifications
* streaming
* JSON-RPC

---

## Official SDKs

Prefer official ACP libraries when available instead of implementing the protocol manually.

Check the ACP repository for:

* SDKs
* reference implementations
* transport examples
* protocol schemas

If no SDK exists for the project language, implement only the transport layer and protocol messages. Do not invent protocol behavior.

---

## Guidance for AI Agents

When working in this repository:

* Assume ACP is the integration mechanism.
* Use ACP terminology consistently.
* Do not design proprietary agent communication protocols unless explicitly requested.
* Prefer protocol compliance over convenience.
* If uncertain about protocol behavior, consult the ACP specification before making architectural decisions.

When discussing architecture, distinguish clearly between:

* responsibilities of the AI agent
* responsibilities of the ACP host
* responsibilities of the user interface

Keeping these concerns separate results in simpler, more maintainable systems.
