# Session Persistence Context

## Overview

The Artifact CLI currently stores chat sessions in-memory only, which means all conversation context and Claude Code session bindings are lost when the server restarts. This plan implements durable session persistence across server restarts, allowing users to resume conversations and maintain continuity with Claude Code's session resumption capabilities.

## Background

The current `SessionStore` class (`src/server/session/store.ts`) maintains sessions in Maps with a 30-minute TTL. While it captures `claudeSessionId` from the Claude Code SDK for session resumption, this data is volatile. Users lose:
- Conversation history with artifacts
- Claude Code session bindings (the mapping between artifact and Claude's session)
- System context tailored to each artifact

The Claude Code SDK (`@anthropic-ai/claude-agent-sdk`) already supports session resumption via the `resume` parameter in its `query()` function, but the mapping data must persist on our side.

## Goal

When all tasks are complete:
1. Sessions survive server restarts (stored on disk)
2. Dashboard can reconnect to previous sessions after page refresh
3. Claude Code sessions resume properly when valid
4. Graceful fallback when Claude sessions have expired
5. Session context refreshes from current artifact state on resume

## Key Decisions

- **Storage Format**: JSON file-based persistence (simpler than SQLite for single-user CLI tool)
- **Storage Location**: `~/.artifact/sessions/` directory with one JSON file per session
- **Client Storage**: Dashboard uses localStorage to remember session IDs
- **Session Validation**: Check Claude session validity on resume; fallback to new session if expired

## Scope Boundaries

- **In scope**:
  - Server-side session persistence layer
  - Session store modifications for disk I/O
  - API endpoints for session listing and resumption
  - Dashboard localStorage integration
  - Error handling for expired Claude sessions

- **Out of scope**:
  - Database migrations (SQLite not needed for v1)
  - Session encryption at rest
  - Multi-device session synchronization
  - Session sharing between users
  - Automatic session cleanup UI
