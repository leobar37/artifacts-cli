# Artifact Session Context Plan Context

## Overview

Implement a full session architecture where each artifact has an independent chat session that maintains persistent context (slug, path, type, content description). The chat agent will always know which artifact the user is discussing without requiring explicit specification in every message.

## Background

The current implementation sends artifact metadata (slug, path, type) with every chat request, but the backend treats each request independently. The `ClaudeCodeExecutor` already maintains sessions per artifact, but the chat layer lacks this pattern. Tools must reconstruct context from request parameters rather than accessing a maintained session state.

This creates a gap where the "agent has no idea what artifact the user is currently viewing."

## Goal

When a user selects an artifact and opens the chat panel, a session is created/resumed with that artifact's metadata injected into the system prompt. Subsequent messages within that session automatically know the context without explicit artifact specification.

## Key Decisions

- Session storage: In-memory with TTL (30-minute inactivity cleanup), matching the `ClaudeCodeExecutor` pattern already in the codebase
- Session ID: UUID opaque identifier, not derived from artifact slug
- Content description: Generated once on session creation by reading the artifact HTML and extracting a summary
- Frontend architecture: Single `useChat` instance with session ID tracking, not multiple instances

## Scope Boundaries

### In scope
- Session store with CRUD operations and TTL cleanup
- New API endpoints: session creation, retrieval, deletion
- Modified `/api/chat` to accept session ID and inject context
- Frontend session management (session creation on artifact selection)
- Agent refactoring to accept and use session context
- Content description generation for artifacts

### Out of scope
- Persistent session storage (SQLite, Redis) - in-memory only for v1
- Multi-user collaboration on same artifact
- Cross-device session sync
- Session history export/import
