# Guía Completa del Agent Client Protocol (ACP)

**Versión del documento:** 1.0
**Fecha:** Abril 2026
**Autor:** Basado en la investigación de agentclientprotocol.com, Zed Industries, y documentación de OpenCode

---

## Tabla de Contenidos

1. [Introducción](#1-introducción)
2. [Arquitectura del Protocolo](#2-arquitectura-del-protocolo)
3. [Flujo Completo del Protocolo](#3-flujo-completo-del-protocolo)
4. [Tipos de Contenido](#4-tipos-de-contenido)
5. [Tool Calls y Sistema de Permisos](#5-tool-calls-y-sistema-de-permisos)
6. [Tutorial: Implementar un Agente ACP desde Cero](#6-tutorial-implementar-un-agente-acp-desde-cero)
7. [OpenCode y ACP](#7-opencode-y-acp)
8. [Recursos y Referencias](#8-recursos-y-referencias)

---

# 1. Introducción

## 1.1 ¿Qué es el Agent Client Protocol (ACP)?

El **Agent Client Protocol (ACP)** es un protocolo abierto y estandarizado que permite la comunicación entre editores de código (IDE) y agentes de IA especializados en codificación. Fue creado por **Zed Industries** en colaboración con **Google** (para integrar Gemini CLI) y posteriormente adoptado por **JetBrains**, entre otros.

La motivación detrás de ACP es sencilla: el ecosistema de agentes de IA para codificación está fragmentado. Cada editor debe construir integraciones personalizadas para cada agente, y cada agente debe implementar APIs específicas para cada editor. Esto genera:

- **Sobrecarga de integración**: Cada nueva combinación agente-editor requiere trabajo custom
- **Compatibilidad limitada**: Los agentes solo funcionan con un subconjunto de editores disponibles
- **Lock-in del desarrollador**: Elegir un agente significa aceptar sus interfaces disponibles

ACP resuelve este problema proporcionando una capa de abstracción estandarizada, similar a como el **Language Server Protocol (LSP)** estandarizó la integración entre editores y servidores de lenguaje.

## 1.2 Analogía con LSP

Si conoces LSP, ACP es conceptualmente similar pero para agentes de IA:

| Aspecto | LSP | ACP |
|---------|-----|-----|
| Propósito | Servidores de lenguaje para diagnóstico, completado, etc. | Agentes de IA para edición de código autónoma |
| Cliente | Editor (VS Code, Zed, etc.) | Editor (Zed, JetBrains, Neovim, etc.) |
| Servidor | Language Server (TypeScript, Python, etc.) | Coding Agent (Claude Code, Gemini CLI, etc.) |
| Comunicación | JSON-RPC sobre stdio o TCP | JSON-RPC sobre stdio o HTTP |

## 1.3 ACP, MCP y A2A: ¿Cuál es la diferencia?

Es importante no confundir ACP con otros protocolos de comunicación en el ecosistema AI:

### MCP (Model Context Protocol)
- **Creador:** Anthropic
- **Propósito:** Estandarizar cómo los agentes acceden a herramientas y fuentes de datos externas
- **Analogía:** "El USB-C de conectar agentes a herramientas"
- **Uso:** Un agente (como Claude) usa MCP para acceder a un filesystem server, database server, etc.

### ACP (Agent Client Protocol)
- **Creador:** Zed Industries + Linux Foundation
- **Propósito:** Estandarizar la comunicación entre editores y agentes de codificación
- **Analogía:** "El USB-C de conectar editores a agentes"
- **Uso:** Zed conecta a Claude Code, Gemini CLI, OpenCode, etc.

### A2A (Agent-to-Agent Protocol)
- **Creador:** Google
- **Propósito:** Estandarizar cómo los agentes AI se comunican entre sí
- **Uso:** Agentes colaboran como pares, no a través de un intermediario

**Nota importante:** ACP y MCP son complementarios. ACP maneja la comunicación editor-agente, mientras que MCP maneja cómo el agente accede a recursos externos (filesystem, terminals, etc.). Dentro de ACP, los agentes pueden usar MCP servers para sus operaciones.

## 1.4 Ecosistema Actual

### Editores que Soportan ACP

| Editor | Estado | Notas |
|--------|--------|-------|
| **Zed** | ✅ Nativo | Soporte completo desde 2025 |
| **JetBrains IDEs** | ✅ Native (AI Assistant) | IntelliJ, WebStorm, PyCharm, etc. |
| **Neovim** | ✅ Plugins | CodeCompanion.nvim, avante.nvim |
| **Emacs** | ✅ Plugin | agent-shell |
| **Obsidian** | ✅ Plugin | Para notas y documentación |
| **marimo** | ✅ Notebook | Python notebooks |
| **Eclipse** | 🔄 Prototype | En desarrollo |

### Agentes que Soportan ACP

| Agente | Estado | Notas |
|--------|--------|-------|
| **Gemini CLI** | ✅ Referencia | Implementación de referencia de Google |
| **Claude Agent** | ✅ Adapter | Via adapter oficial de Zed |
| **Codex CLI** | ✅ Adapter | Via codex-acp |
| **OpenCode** | ✅ Nativo | Soporte ACP completo |
| **Blackbox AI** | ✅ CLI | Via `--experimental-acp` |
| **Cline** | ✅ CLI | Open source agent |
| **Kiro CLI** | ✅ CLI | Soporte completo |
| **Pi** | ✅ Adapter | Via adapter oficial |
| **Qoder CLI** | ✅ CLI | Registry agent |
| **Qwen Code** | ✅ CLI | Optimizado para Qwen3-Coder |
| **Stakpak** | ✅ CLI | DevOps agent |
| **VT Code** | ✅ CLI | Con Tree-sitter |

---

# 2. Arquitectura del Protocolo

## 2.1 Base: JSON-RPC 2.0

ACP está construido sobre **JSON-RPC 2.0**, un protocolo ligero de llamada a procedimientos remotos que utiliza JSON para la serialización de datos. Esto significa:

- **Requests** (peticiones): Tienen `jsonrpc`, `id`, `method`, y `params`
- **Responses** (respuestas): Tienen `jsonrpc`, `id`, y `result` (o `error`)
- **Notifications**: Mensajes uno a uno sin respuesta esperada (tienen `jsonrpc` y `method` pero no `id`)

### Formato de un Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": { ... },
    "clientInfo": { ... }
  }
}
```

### Formato de una Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": { ... },
    "agentInfo": { ... }
  }
}
```

### Formato de un Error

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

### Códigos de Error Estándar de JSON-RPC 2.0

| Código | Nombre | Descripción |
|--------|--------|-------------|
| -32700 | Parse Error | JSON inválido |
| -32600 | Invalid Request | Request no válido |
| -32601 | Method Not Found | Método no existe |
| -32602 | Invalid Params | Parámetros inválidos |
| -32603 | Internal Error | Error interno |
| -32000 a -32099 | Server Error | Errores definidos por el servidor |

## 2.2 Transportes

ACP soporta dos mecanismos de transporte para la comunicación entre clientes y agentes:

### 2.2.1 Stdio (Estándar)

Este es el transporte principal y el más utilizado:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Editor)                       │
│  ┌──────────────┐    stdin     ┌──────────────────────┐    │
│  │ ACP Messages │ ───────────► │      AGENT           │    │
│  │  (stdout)    │ ◄─────────── │   (subprocess)       │    │
│  └──────────────┘    stdout    └──────────────────────┘    │
│                            │                                │
│                     stderr (logs)                           │
└─────────────────────────────────────────────────────────────┘
```

**Características del transporte stdio:**

- El cliente lanza el agente como un **subproceso hijo**
- El agente lee mensajes JSON-RPC desde su `stdin`
- El agente escribe mensajes JSON-RPC hacia su `stdout`
- Los mensajes están delimitados por **nueva línea (`\n`)** - un mensaje por línea
- El agente **NO DEBE** escribir nada que no sea un mensaje ACP válido a `stdout`
- El agente **PUEDE** escribir a `stderr` para logs (el cliente puede capturarlos o ignorarlos)
- El cliente **NO DEBE** escribir nada que no sea un mensaje ACP válido a `stdin` del agente

**Formato NDJSON (Newline-Delimited JSON):**

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}\n
{"jsonrpc":"2.0","method":"session/update","params":{...}}\n
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}\n
```

### 2.2.2 HTTP (Draft/En Progreso)

Para agentes remotos (hospedados en la nube o infraestructura separada):

- Comunicación sobre HTTP o WebSocket
- Full-duplex communication
- **Estado:** Draft proposal en progreso
- No recomendado para producción aún

### 2.2.3 Transportes Custom

Los agentes y clientes **PUEDEN** implementar mecanismos de transporte adicionales custom si es necesario. El protocolo es transport-agnostic y puede implementarse sobre cualquier canal que soporte intercambio bidireccional de mensajes.

## 2.3 Roles: Cliente vs Agente

### 2.3.1 Cliente (Client)

El **cliente** es típicamente un editor de código (IDE) que:

- Gestiona el entorno del usuario (filesystem, terminal, etc.)
- Maneja las interacciones del usuario
- Controla el acceso a recursos sensibles
- Controla la UI y la presentación de información al usuario
- Envía prompts del usuario al agente
- Recibe y muestra respuestas, tool calls, y actualizaciones del agente

**Ejemplos:** Zed, JetBrains IDEs, Neovim (con plugins), Emacs (con agent-shell)

### 2.3.2 Agente (Agent)

El **agente** es un programa que:

- Usa IA generativa para modificar código de forma autónoma
- Procesa prompts del usuario a través de un modelo de lenguaje (LLM)
- Decide cuándo usar herramientas y cuáles
- Ejecuta tool calls (file operations, terminal commands, etc.)
- Reporta progreso y resultados al cliente

**Ejemplos:** Claude Code, Gemini CLI, OpenCode, Codex CLI

## 2.4 Inventario Completo de Métodos

### 2.4.1 Métodos del Agente (Client → Agent)

| Método | Tipo | Descripción | Requerido |
|--------|------|-------------|-----------|
| `initialize` | Request/Response | Negociar versión del protocolo y capabilities | ✅ |
| `authenticate` | Request/Response | Autenticarse con el agente (si es necesario) | ❌ |
| `session/new` | Request/Response | Crear una nueva sesión de conversación | ✅ |
| `session/load` | Request/Response | Cargar una sesión existente | ❌ (requiere `loadSession` capability) |
| `session/prompt` | Request/Response | Enviar un mensaje del usuario al agente | ✅ |
| `session/set_mode` | Request/Response | Cambiar el modo de operación del agente | ❌ |
| `session/cancel` | Notification | Cancelar la operación en curso | ✅ |

### 2.4.2 Métodos del Cliente (Agent → Client)

| Método | Tipo | Descripción | Requerido |
|--------|------|-------------|-----------|
| `session/request_permission` | Request/Response | Solicitar permiso del usuario para una acción | ❌ |
| `fs/read_text_file` | Request/Response | Leer contenido de un archivo | ❌ (requiere `fs.readTextFile` capability) |
| `fs/write_text_file` | Request/Response | Escribir contenido a un archivo | ❌ (requiere `fs.writeTextFile` capability) |
| `terminal/create` | Request/Response | Crear una nueva terminal | ❌ (requiere `terminal` capability) |
| `terminal/output` | Request/Response | Obtener output de la terminal | ❌ (requiere `terminal` capability) |
| `terminal/release` | Request/Response | Liberar una terminal | ❌ (requiere `terminal` capability) |
| `terminal/wait_for_exit` | Request/Response | Esperar que el comando de terminal termine | ❌ (requiere `terminal` capability) |
| `terminal/kill` | Request/Response | Matar un comando de terminal | ❌ (requiere `terminal` capability) |

### 2.4.3 Notificaciones (Agent → Client)

| Notificación | Descripción |
|--------------|-------------|
| `session/update` | Enviar actualizaciones de sesión (text chunks, tool calls, planes, etc.) |

### 2.4.4 Notificaciones (Client → Agent)

| Notificación | Descripción |
|--------------|-------------|
| `session/cancel` | Cancelar la operación actual |

## 2.5 Session Update Types

Cuando el agente envía `session/update` al cliente, el campo `update.sessionUpdate` puede ser:

| Tipo | Descripción |
|------|-------------|
| `plan` | Plan de ejecución del agente (lista de pasos con estado) |
| `agent_message_chunk` | Chunk de texto de respuesta del agente |
| `user_message_chunk` | Echo del input del usuario |
| `thought_message_chunk` | Razonamiento del agente (reasoning) |
| `tool_call` | Nueva invocación de herramienta |
| `tool_call_update` | Actualización de progreso/resultado de una herramienta |
| `available_commands` | Lista de comandos slash disponibles |
| `mode_change` | Cambio de modo del agente |

## 2.6 Capabilities

Las capabilities describen features opcionales que el cliente o agente soporta. Se negocian durante la fase de `initialize`.

### 2.6.1 Client Capabilities

```json
{
  "clientCapabilities": {
    "fs": {
      "readTextFile": true,
      "writeTextFile": true
    },
    "terminal": true
  }
}
```

### 2.6.2 Agent Capabilities

```json
{
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": {
      "image": true,
      "audio": true,
      "embeddedContext": true
    },
    "mcpCapabilities": {
      "http": true,
      "sse": true
    }
  }
}
```

---

# 3. Flujo Completo del Protocolo

## 3.1 Diagrama de Flujo General

```
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 1: INICIALIZACIÓN                       │
│  Client ──────► initialize ──────► Agent                         │
│  Client ◄────── initialize/result ◄── Agent                     │
│  Client ──────► authenticate ─────► Agent (si es necesario)      │
│  Client ◄────── authenticate/result ◄─ Agent                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 2: SESIÓN                              │
│  Client ──────► session/new ───────► Agent                       │
│  Client ◄────── sessionId ────────── Agent                       │
│                                                                 │
│  O                                                             │
│                                                                 │
│  Client ──────► session/load ───────► Agent (si soporta)        │
│  Client ◄────── session/history ───── Agent (replay)            │
│  Client ◄────── null (fin replay) ─── Agent                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 3: PROMPT TURN                         │
│                                                                 │
│  Client ──────► session/prompt ─────► Agent                     │
│                      │                                          │
│         ┌───────────┼───────────┐                              │
│         ▼           ▼           ▼                              │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│    │  Text   │ │ Tools   │ │ More    │                        │
│    │ Output  │ │ Calls   │ │ Thinking│                        │
│    └────┬────┘ └────┬────┘ └────┬────┘                        │
│         │           │           │                              │
│         └───────────┼───────────┘                              │
│                     ▼                                          │
│         Agent ───► session/update ──► Client (streaming)        │
│                     │                                          │
│                     ▼                                          │
│         Agent ◄─── session/request_permission ── Client (si req) │
│                     │                                          │
│                     ▼                                          │
│              [Herramientas se ejecutan]                         │
│                     │                                          │
│                     ▼                                          │
│         Agent ───► session/update ──► Client (resultados)      │
│                                                                 │
│  Client ◄────── stopReason ────────── Agent (fin del turn)      │
│                                                                 │
│  [Repetir para cada mensaje del usuario]                         │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 Fase 1: Inicialización (Initialize)

Antes de cualquier comunicación de sesión, el cliente **DEBE** inicializar la conexión.

### 3.2.1 El Cliente Envía `initialize`

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": {
        "readTextFile": true,
        "writeTextFile": true
      },
      "terminal": true
    },
    "clientInfo": {
      "name": "zed",
      "title": "Zed Editor",
      "version": "0.150.0"
    }
  }
}
```

### 3.2.2 El Agente Responde

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true,
        "audio": true,
        "embeddedContext": true
      },
      "mcpCapabilities": {
        "http": true,
        "sse": true
      },
      "sessionCapabilities": {
        "fork": {},
        "list": {},
        "resume": {}
      }
    },
    "agentInfo": {
      "name": "opencode",
      "title": "OpenCode",
      "version": "2.0.0"
    },
    "authMethods": []
  }
}
```

### 3.2.3 Negociación de Versión

- El cliente envía la versión más reciente del protocolo que soporta (`protocolVersion: 1`)
- Si el agente soporta esa versión, responde con la misma
- Si no, responde con la última versión que soporta
- Si el cliente no soporta la versión del agente, **DEBERÍA** cerrar la conexión

### 3.2.4 Capacidad de Autenticación

Si `authMethods` no está vacío, el cliente debe llamar `authenticate` después de `initialize`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "authenticate",
  "params": {
    "method": "bearer",
    "token": "sk-..."
  }
}
```

## 3.3 Fase 2: Creación de Sesión (Session Setup)

Una vez inicializada la conexión, el cliente puede crear una nueva sesión o cargar una existente.

### 3.3.1 Crear Nueva Sesión (`session/new`)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/home/user/project",
    "mcpServers": [
      {
        "name": "filesystem",
        "command": "/path/to/mcp-server",
        "args": ["--stdio"],
        "env": [
          { "name": "API_KEY", "value": "secret123" }
        ]
      }
    ]
  }
}
```

**Respuesta:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "sess_abc123def456"
  }
}
```

### 3.3.2 Cargar Sesión Existente (`session/load`)

Solo disponible si el agente tiene `loadSession: true` en sus capabilities.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/load",
  "params": {
    "sessionId": "sess_789xyz",
    "cwd": "/home/user/project",
    "mcpServers": []
  }
}
```

El agente responde con `sessionId: null` cuando termina de enviar el historial:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": null
}
```

### 3.3.3 MCP Servers

ACP soporta conexión a MCP servers (Model Context Protocol) para dar al agente acceso a herramientas externas:

**Transporte stdio (requerido):**

```json
{
  "name": "filesystem",
  "command": "/path/to/mcp-server",
  "args": ["--stdio"],
  "env": [
    { "name": "API_KEY", "value": "secret123" }
  ]
}
```

**Transporte HTTP (opcional, requiere `mcpCapabilities.http`):**

```json
{
  "type": "http",
  "name": "api-server",
  "url": "https://api.example.com/mcp",
  "headers": [
    { "name": "Authorization", "value": "Bearer token123" }
  ]
}
```

## 3.4 Fase 3: Prompt Turn (Ciclo de Conversación)

El prompt turn es el ciclo principal de interacción entre cliente y agente.

### 3.4.1 Paso 1: Cliente Envía Prompt

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123def456",
    "prompt": [
      {
        "type": "text",
        "text": "Can you analyze this code for potential issues?"
      },
      {
        "type": "resource",
        "resource": {
          "uri": "file:///home/user/project/main.py",
          "mimeType": "text/x-python",
          "text": "def process_data(items):\n    for item in items:\n        print(item)"
        }
      }
    ]
  }
}
```

### 3.4.2 Paso 2-3: Agente Procesa y Reporta Output

El agente puede enviar múltiples `session/update` notificaciones:

**Plan de ejecución:**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "plan",
      "entries": [
        {
          "content": "Check for syntax errors",
          "priority": "high",
          "status": "pending"
        },
        {
          "content": "Identify potential type issues",
          "priority": "medium",
          "status": "pending"
        }
      ]
    }
  }
}
```

**Texto del agente (streaming):**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {
        "type": "text",
        "text": "I'll analyze your code for potential issues..."
      }
    }
  }
}
```

**Razonamiento del agente:**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "thought_message_chunk",
      "content": {
        "type": "text",
        "text": "Let me think about this function..." 
      }
    }
  }
}
```

### 3.4.3 Paso 4-5: Tool Calls y Permisos

**Tool call iniciado:**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "call_001",
      "title": "Reading configuration file",
      "kind": "read",
      "status": "pending"
    }
  }
}
```

**Solicitud de permiso:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess_abc123def456",
    "toolCall": {
      "toolCallId": "call_001"
    },
    "options": [
      {
        "optionId": "allow-once",
        "name": "Allow once",
        "kind": "allow_once"
      },
      {
        "optionId": "reject-once",
        "name": "Reject",
        "kind": "reject_once"
      }
    ]
  }
}
```

**Respuesta del cliente:**

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "outcome": {
      "outcome": "selected",
      "optionId": "allow-once"
    }
  }
}
```

**Tool en progreso:**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "in_progress",
      "content": [
        {
          "type": "content",
          "content": {
            "type": "text",
            "text": "Found 3 configuration files..."
          }
        }
      ]
    }
  }
}
```

**Tool completado:**

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "completed",
      "content": [
        {
          "type": "content",
          "content": {
            "type": "text",
            "text": "Analysis complete:\n- No syntax errors found\n- Consider adding type hints"
          }
        }
      ]
    }
  }
}
```

### 3.4.4 Paso 6: Finalización del Turno

Cuando el agente termina, responde al `session/prompt` original con un `stopReason`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "stopReason": "end_turn",
    "usage": {
      "inputTokens": 1500,
      "outputTokens": 800
    }
  }
}
```

**Stop Reasons posibles:**

| Reason | Significado |
|--------|-------------|
| `end_turn` | El modelo respondió sin pedir más tools |
| `max_tokens` | Se alcanzó el límite de tokens máximo |
| `max_turn_requests` | Se excedió el número máximo de requests en un turn |
| `refusal` | El agente se niega a continuar |
| `cancelled` | El cliente canceló el turn |

## 3.5 Cancelación

El cliente puede cancelar un prompt turn en cualquier momento:

```json
{
  "jsonrpc": "2.0",
  "method": "session/cancel",
  "params": {
    "sessionId": "sess_abc123def456"
  }
}
```

El agente **DEBE**:

1. Detener todos los requests al modelo de lenguaje lo antes posible
2. Detener todas las invocaciones de tools
3. Marcar todas las tools no terminadas como `cancelled`
4. Responder al `session/prompt` original con `stopReason: "cancelled"`

---

# 4. Tipos de Contenido

ACP utiliza la misma estructura `ContentBlock` que MCP para representar diferentes tipos de contenido.

## 4.1 Text Content

El tipo más básico y requerido por todos los agentes.

```json
{
  "type": "text",
  "text": "What's the weather like today?"
}
```

## 4.2 Image Content

Requiere capability `promptCapabilities.image`.

```json
{
  "type": "image",
  "mimeType": "image/png",
  "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB..."
}
```

## 4.3 Audio Content

Requiere capability `promptCapabilities.audio`.

```json
{
  "type": "audio",
  "mimeType": "audio/wav",
  "data": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAAB..."
}
```

## 4.4 Embedded Resource

Contenido de recursos embebidos directamente (ej: archivos mencionados con @).

```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///home/user/script.py",
    "mimeType": "text/x-python",
    "text": "def hello():\n    print('Hello, world!')"
  }
}
```

## 4.5 Resource Link

Referencia a un recurso que el agente puede acceder.

```json
{
  "type": "resource_link",
  "uri": "file:///home/user/document.pdf",
  "name": "document.pdf",
  "mimeType": "application/pdf",
  "size": 1024000
}
```

---

# 5. Tool Calls y Sistema de Permisos

## 5.1 Tool Kinds

Los tools se clasifican por su categoría (`kind`):

| Kind | Descripción |
|------|-------------|
| `read` | Leyendo archivos o datos |
| `edit` | Modificando archivos o contenido |
| `delete` | Eliminando archivos o datos |
| `move` | Moviendo o renombrando archivos |
| `search` | Buscando información |
| `execute` | Ejecutando comandos o código |
| `think` | Razonamiento interno o planificación |
| `fetch` | Obteniendo datos externos |
| `other` | Otros tipos de tools (default) |

## 5.2 Tool Call Status Flow

```
┌──────────┐    ┌─────────────┐    ┌────────────┐
│ pending  │───►│ in_progress │───►│ completed  │
└──────────┘    └─────────────┘    └────────────┘
     │               │
     │               ▼
     │          ┌────────┐
     └─────────►│ failed │
                └────────┘
```

| Status | Significado |
|--------|-------------|
| `pending` | El tool no ha iniciado porque está esperando approval o input streaming |
| `in_progress` | El tool está ejecutándose |
| `completed` | El tool completó exitosamente |
| `failed` | El tool falló con un error |

## 5.3 Permisos

El agente puede solicitar permiso antes de ejecutar certain actions.

### 5.3.1 Opciones de Permiso

| Kind | Descripción |
|------|-------------|
| `allow_once` | Permitir solo esta vez |
| `allow_always` | Permitir y recordar la elección |
| `reject_once` | Rechazar solo esta vez |
| `reject_always` | Rechazar y recordar la elección |

## 5.4 Contenido de Tool Calls

### 5.4.1 Contenido Regular

```json
{
  "type": "content",
  "content": {
    "type": "text",
    "text": "Analysis complete. Found 3 issues."
  }
}
```

### 5.4.2 Diffs

```json
{
  "type": "diff",
  "path": "/home/user/project/src/config.json",
  "oldText": "{\n  \"debug\": false\n}",
  "newText": "{\n  \"debug\": true\n}"
}
```

### 5.4.3 Terminals

```json
{
  "type": "terminal",
  "terminalId": "term_xyz789"
}
```

## 5.5 Following the Agent

Los tool calls pueden reportar ubicaciones de archivos para que el cliente implemente "follow-along":

```json
{
  "path": "/home/user/project/src/main.py",
  "line": 42
}
```

---

# 6. Tutorial: Implementar un Agente ACP desde Cero

En esta sección, aprenderás cómo crear tu propio agente ACP usando TypeScript y el SDK oficial `@agentclientprotocol/sdk`.

## 6.1 Prerrequisitos

- Node.js 18+ (o Bun)
- npm o yarn o pnpm
- Conocimientos básicos de TypeScript

## 6.2 Setup del Proyecto

```bash
mkdir my-acp-agent
cd my-acp-agent
npm init -y
npm install @agentclientprotocol/sdk
npm install -D typescript @types/node tsx
npx tsc --init
```

### Estructura del Proyecto

```
my-acp-agent/
├── src/
│   ├── index.ts          # Entry point
│   ├── agent.ts          # Main agent implementation
│   └── tools.ts          # Tool definitions
├── tsconfig.json
└── package.json
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

## 6.3 Implementación Completa del Agente

### 6.3.1 src/tools.ts - Definición de Herramientas

```typescript
import type { Tool } from '@agentclientprotocol/sdk';

export interface ReadFileToolInput {
  path: string;
}

export interface WriteFileToolInput {
  path: string;
  content: string;
}

export interface ExecToolInput {
  command: string;
  cwd?: string;
}

export const tools: Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'exec',
    description: 'Execute a shell command and return its output',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  }
];
```

### 6.3.2 src/agent.ts - Implementación del Agente

```typescript
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  Agent,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  SessionUpdateNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  StopReason
} from '@agentclientprotocol/sdk';

const execAsync = promisify(exec);

interface SessionState {
  id: string;
  cwd: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class MyAgent implements Agent {
  private sessions: Map<string, SessionState> = new Map();
  private sessionCounter = 0;

  // Required: Implement initialize
  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    console.error('[Agent] Initialize called with:', JSON.stringify(params, null, 2));

    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          embeddedContext: true,
          image: true
        },
        mcpCapabilities: {
          http: true,
          sse: true
        }
      },
      agentInfo: {
        name: 'my-agent',
        title: 'My Custom ACP Agent',
        version: '1.0.0'
      },
      authMethods: []
    };
  }

  // Required: Implement newSession
  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = `sess_${++this.sessionCounter}_${Date.now()}`;
    const session: SessionState = {
      id: sessionId,
      cwd: params.cwd,
      history: []
    };
    this.sessions.set(sessionId, session);

    console.error(`[Agent] Created session: ${sessionId} with cwd: ${params.cwd}`);

    return {
      sessionId
    };
  }

  // Required: Implement prompt
  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`);
    }

    // Extract user message
    const userMessage = this.extractUserMessage(params.prompt);
    console.error(`[Agent] Prompt from user: ${userMessage}`);

    // Add to history
    session.history.push({ role: 'user', content: userMessage });

    // Generate response using AI (simplified - replace with actual AI call)
    const response = await this.generateResponse(userMessage, session);

    // Send streaming updates
    if (params._meta?.stream !== false) {
      await this.sendMessageChunk(params.sessionId, response);
    }

    // Add to history
    session.history.push({ role: 'assistant', content: response });

    return {
      stopReason: 'end_turn' as StopReason,
      usage: {
        inputTokens: userMessage.length / 4,
        outputTokens: response.length / 4
      }
    };
  }

  // Required: Implement cancel
  async cancel(params: CancelNotification): Promise<void> {
    console.error(`[Agent] Cancel requested for session: ${params.sessionId}`);
    // In a real implementation, abort ongoing AI requests
  }

  // Optional: Implement loadSession
  async loadSession(params: { sessionId: string; cwd: string }): Promise<void> {
    console.error(`[Agent] Load session requested: ${params.sessionId}`);
    // In a real implementation, replay conversation history
  }

  // Optional: Implement requestPermission
  async requestPermission(
    params: RequestPermissionRequest
  ): Promise<RequestPermissionResponse> {
    console.error(`[Agent] Permission requested:`, params);
    return {
      outcome: {
        outcome: 'selected',
        optionId: 'allow-once'
      }
    };
  }

  // Helper: Extract text from prompt content
  private extractUserMessage(prompt: any[]): string {
    return prompt
      .map((block: any) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'resource') return `[File: ${block.resource.uri}]\n${block.resource.text}`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  // Helper: Send a streaming message chunk
  private async sendMessageChunk(sessionId: string, content: string): Promise<void> {
    const chunkSize = 50;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      const update: SessionUpdateNotification = {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: chunk
          }
        }
      };
      // In a real implementation, use the connection to send
      console.error(`[Agent] Sending chunk: ${chunk.slice(0, 20)}...`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  // Helper: Generate AI response (placeholder)
  private async generateResponse(userMessage: string, session: SessionState): Promise<string> {
    const lowerMessage = userMessage.toLowerCase();

    // Simple pattern matching for demo
    if (lowerMessage.includes('read') && lowerMessage.includes('file')) {
      return "I can help you read files. Please provide the full path to the file you'd like me to read.";
    }

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! I'm your coding assistant. I can help you read and write files, run commands, and analyze code. What would you like to do?";
    }

    if (lowerMessage.includes('help')) {
      return "I'm a simple ACP agent. I can:\n- Read files from your filesystem\n- Write content to files\n- Execute shell commands\n- Analyze code\n\nJust tell me what you'd like to do!";
    }

    // Default echo response
    return `I received your message: "${userMessage.slice(0, 50)}..."\n\nAs a simple echo agent, I'm not connected to an AI model yet. In a production agent, this would call an LLM API.`;
  }
}
```

### 6.3.3 src/index.ts - Entry Point con Stdio

```typescript
import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';
import * as readline from 'readline';
import { MyAgent } from './agent.js';

// Create agent instance
const agent = new MyAgent();

// Setup stdin/stdout streams
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Collect lines from stdin
const lines: string[] = [];
rl.on('line', (line) => {
  lines.push(line);
});

// Process when we have complete JSON messages (separated by newlines)
let buffer = '';
process.stdin.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  const parts = buffer.split('\n');
  buffer = parts.pop() || '';

  for (const line of parts) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (e) {
        console.error('Failed to parse JSON:', line);
      }
    }
  }
});

async function handleMessage(message: any) {
  console.error('[Agent] Received:', message.method);

  // Handle different methods
  switch (message.method) {
    case 'initialize':
      const initResult = await agent.initialize(message.params);
      sendResponse(message.id, initResult);
      break;

    case 'session/new':
      const sessionResult = await agent.newSession(message.params);
      sendResponse(message.id, sessionResult);
      break;

    case 'session/prompt':
      const promptResult = await agent.prompt(message.params);
      sendResponse(message.id, promptResult);
      break;

    case 'session/cancel':
      await agent.cancel(message.params);
      // Notifications don't get responses
      break;

    case 'session/load':
      await agent.loadSession(message.params);
      sendResponse(message.id, null);
      break;

    case 'session/request_permission':
      const permResult = await agent.requestPermission(message.params);
      sendResponse(message.id, permResult);
      break;

    default:
      console.error('[Agent] Unknown method:', message.method);
  }
}

function sendResponse(id: any, result: any) {
  const response = {
    jsonrpc: '2.0',
    id,
    result
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('[Agent] Shutting down...');
  process.exit(0);
});

console.error('[Agent] ACP Agent started, waiting for messages...');
```

### 6.3.4 package.json scripts

```json
{
  "name": "my-acp-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  }
}
```

## 6.4 Testing Manual del Agente

### 6.4.1 Iniciar el Agente

```bash
npm run dev
```

### 6.4.2 Enviar Mensajes JSON-RPC

En otra terminal, usa `nc` o un script para enviar mensajes:

```bash
# Initialize
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | nc -w 1 localhost 8080

# O usando un pipe con jq:
echo '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"test"}}}' | node -e "
const readline = require('readline');
const { spawn } = require('child_process');
const agent = spawn('npm', ['run', 'dev'], { cwd: __dirname });

const rl = readline.createInterface({ input: agent.stdout });
rl.on('line', (line) => console.log('Agent:', line));
agent.stderr.on('data', (d) => console.error('Agent err:', d.toString()));
agent.stdin.write(line + '\n');
"
```

## 6.5 Mejoras para Producción

### 6.5.1 Usar el SDK Completo

El ejemplo anterior usa un manejo manual de stdin/stdout. Para producción, usa el SDK completo:

```typescript
import {
  AgentSideConnection,
  ndJsonStream,
  createServer
} from '@agentclientprotocol/sdk';
import { MyAgent } from './agent.js';

async function main() {
  const agent = new MyAgent();
  
  // Create stdio streams
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      process.stdin.on('data', (chunk: Buffer) => {
        controller.enqueue(chunk);
      });
    }
  });

  const output = new WritableStream<Uint8Array>({
    write(chunk) {
      process.stdout.write(chunk);
    }
  });

  // Create NDJSON stream and agent connection
  const stream = ndJsonStream(input, output);
  const connection = new AgentSideConnection(
    (conn) => agent.create(conn),
    stream
  );

  console.error('[Agent] ACP Agent running on stdio...');
}

main().catch(console.error);
```

### 6.5.2 Agregar Herramientas Reales

Reemplaza el placeholder `generateResponse` con llamadas reales a un LLM:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function generateResponse(userMessage: string, session: SessionState): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      ...session.history.map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content
      })),
      { role: 'user', content: userMessage }
    ],
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }))
  });

  // Handle tool calls
  if (response.content.some(block => block.type === 'tool_use')) {
    // Execute tools and send results back
  }

  return response.content.find(block => block.type === 'text')?.text || '';
}
```

### 6.5.3 Empaquetado para ACP Registry

Para distribuir tu agente a través del ACP Registry, necesitas:

1. Crear un repositorio público en GitHub
2. Agregar metadatos en `package.json`:

```json
{
  "name": "my-acp-agent",
  "acp": {
    "name": "my-agent",
    "description": "A custom ACP agent",
    "registry": true
  }
}
```

3. Documentar la instalación y uso

---

# 7. OpenCode y ACP

## 7.1 ACP Nativo en OpenCode

OpenCode soporta ACP de forma nativa. El comando `opencode acp` inicia OpenCode como un subprocess compatible con ACP que se comunica con el editor a través de JSON-RPC sobre stdio.

### 7.1.1 Arquitectura Interna

La implementación de ACP en OpenCode se encuentra en:

```
packages/opencode/src/
├── acp/
│   ├── README.md          # Arquitectura
│   ├── agent.ts           # Implementación principal del agente (60KB+)
│   ├── session.ts         # ACPSessionManager para estado de sesiones
│   └── types.ts           # Type definitions
└── cli/cmd/
    └── acp.ts             # CLI entry point para "opencode acp"
```

### 7.1.2 Flujo de Implementación

```
┌─────────────────────────────────────────────────────────────────┐
│                         opencode acp                             │
├─────────────────────────────────────────────────────────────────┤
│  1. CLI entry point (acp.ts):                                    │
│     - Configura process.env.OPENCODE_CLIENT = "acp"              │
│     - Inicia bootstrap()                                        │
│     - Crea HTTP server local                                    │
│     - Inicializa OpenCodeClient SDK                              │
│     - Configura stdio streams                                    │
├─────────────────────────────────────────────────────────────────┤
│  2. ACP Agent (agent.ts):                                        │
│     - Implements Agent interface                                 │
│     - Handles initialize, session/new, session/prompt, etc.     │
│     - Manages ACPSessionManager                                 │
│     - Subscribes to event stream from SDK                       │
├─────────────────────────────────────────────────────────────────┤
│  3. Session Manager (session.ts):                               │
│     - Creates/loads sessions                                    │
│     - Stores session state (cwd, model, mode)                   │
│     - Maps ACP sessionId to internal session                    │
├─────────────────────────────────────────────────────────────────┤
│  4. Stdio Bridge (via @agentclientprotocol/sdk):                │
│     - AgentSideConnection handles JSON-RPC                      │
│     - ndJsonStream encodes/decodes messages                     │
│     - stdin → WritableStream<Uint8Array>                        │
│     - stdout → ReadableStream<Uint8Array>                       │
└─────────────────────────────────────────────────────────────────┘
```

### 7.1.3 Capabilities que Expone OpenCode

```typescript
{
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    mcpCapabilities: {
      http: true,
      sse: true
    },
    promptCapabilities: {
      embeddedContext: true,
      image: true
    },
    sessionCapabilities: {
      fork: {},
      list: {},
      resume: {}
    }
  },
  agentInfo: {
    name: "opencode",
    version: "<version>"
  }
}
```

### 7.1.4 Protocolo de Eventos

OpenCode envía `session/update` notificaciones para:

| Update Type | Descripción |
|-------------|-------------|
| `agent_message_chunk` | Streaming de texto del agente |
| `agent_thought_chunk` | Razonamiento del agente (reasoning) |
| `user_message_chunk` | Echo del mensaje del usuario |
| `tool_call` | Nuevo tool call iniciado |
| `tool_call_update` | Actualización de tool (in_progress, completed, failed) |
| `usage_update` | Actualización de uso de tokens |
| `available_commands_update` | Comandos slash disponibles |
| `plan` | Plan de ejecución (todo items) |

## 7.2 Usar OpenCode via ACP en Diferentes Editores

### 7.2.1 Zed

Agrega a tu `~/.config/zed/settings.json`:

```json
{
  "agent_servers": {
    "OpenCode": {
      "command": "opencode",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

**Con atajo de teclado** (en `~/.config/zed/keymap.json`):

```json
[
  {
    "bindings": {
      "cmd-alt-o": [
        "agent::NewExternalAgentThread",
        {
          "agent": {
            "custom": {
              "name": "opencode"
            }
          }
        }
      ]
    }
  }
]
```

### 7.2.2 JetBrains IDEs

Agrega a `~/.jetbrains/acp.json`:

```json
{
  "agent_servers": {
    "OpenCode": {
      "command": "/full/path/to/opencode",
      "args": ["acp"]
    }
  }
}
```

Luego abre AI Chat en tu JetBrains IDE y selecciona "OpenCode" del selector de agentes.

### 7.2.3 Neovim - Avante.nvim

Agrega a tu configuración de Avante:

```lua
vim.env.AVANTE_AGENTS = {
  {
    name = "OpenCode",
    provider = "opencode",
    env = {
      OPENCODE_API_KEY = os.getenv("OPENCODE_API_KEY") or ""
    }
  }
}
```

### 7.2.4 Neovim - CodeCompanion.nvim

Agrega a tu configuración:

```lua
require("codecompanion").setup({
  agents = {
    opencode = {
      name = "OpenCode",
      cmd = "opencode",
      args = { "acp" },
      env = {
        OPENCODE_API_KEY = os.getenv("OPENCODE_API_KEY")
      }
    }
  }
})
```

## 7.3 Adaptador Comunitario: opencode-acp

Existe un adaptador comunitario creado por **josephschmitt** que proporciona una capa adicional sobre OpenCode.

### 7.3.1 Diferencias con el ACP Nativo

| Aspecto | ACP Nativo | Adaptador opencode-acp |
|---------|------------|------------------------|
| Ubicación | Integrado en OpenCode | Paquete npm separado |
| Configuración | `opencode acp` directo | `opencode-acp` npm package |
| Control | Todo gestionado internamente | Bridge que traduzca a OpenCode SDK |
| Herramientas | Todas via ACP + MCP | Routing custom de tools |

### 7.3.2 Instalación del Adaptador

```bash
npm install -g @josephschmitt/opencode-acp
# o
npm install @josephschmitt/opencode-acp --save-dev
```

### 7.3.3 Configuración con Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|--------|
| `OPENCODE_BIN` | Path al binario de OpenCode | `opencode` |
| `OPENCODE_URL` | URL del servidor OpenCode (si no es local) | `http://127.0.0.1:3000` |
| `OPENCODE_CONFIG_CONTENT` | JSON de configuración inline | - |

### 7.3.4 Configuración Avanzada

```bash
# Con configuración custom
OPENCODE_BIN=/usr/local/bin/opencode \
OPENCODE_URL=http://localhost:8080 \
OPENCODE_CONFIG_CONTENT='{"provider":"openai","model":"gpt-4o"}' \
opencode-acp
```

### 7.3.5 Arquitectura del Adaptador

```
┌─────────────────────────────────────────────────────────────────┐
│                      opencode-acp Adapter                        │
├─────────────────────────────────────────────────────────────────┤
│  src/opencode-agent.ts   # Implementa Agent interface            │
│  src/opencode-client.ts  # Wrapper para OpenCode SDK             │
│  src/mcp-server.ts       # Bridge MCP para filesystem/terminal   │
│  src/index.ts            # Entry point                          │
└─────────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  ACP Client     │         │  OpenCode SDK   │
│  (Zed, etc.)    │         │  (HTTP API)     │
│  stdio JSON-RPC │         │                 │
└─────────────────┘         └─────────────────┘
```

## 7.4 Características Soportadas via ACP en OpenCode

Cuando usas OpenCode via ACP, todas las features están disponibles:

- ✅ Built-in tools (file operations, terminal commands)
- ✅ Custom tools y slash commands
- ✅ MCP servers configurados en tu OpenCode config
- ✅ Project-specific rules desde `AGENTS.md`
- ✅ Custom formatters y linters
- ✅ Agents y permissions system
- ✅ Context @-mentioning
- ✅ Session history y resumption

---

# 8. Recursos y Referencias

## 8.1 Documentación Oficial

| Recurso | URL |
|---------|-----|
| Sitio oficial ACP | https://agentclientprotocol.com |
| Documentación Zed ACP | https://zed.dev/acp |
| Spec del Protocolo | https://agentclientprotocol.com/protocol/overview |
| OpenCode ACP Docs | https://opencode.ai/docs/acp/ |
| GitHub: Agent Client Protocol | https://github.com/agentclientprotocol/agent-client-protocol |

## 8.2 Librerías Oficiales

| Lenguaje | Paquete | URL |
|----------|---------|-----|
| TypeScript | `@agentclientprotocol/sdk` | npm |
| Python | `python-sdk` | GitHub |
| Rust | `agent-client-protocol` | crates.io |
| Kotlin | `acp-kotlin` | Maven |
| Java | `acp-java` | Maven |

## 8.3 Implementaciones de Referencia

| Agente | Repo | Notas |
|--------|------|-------|
| Gemini CLI | `@google/gemini-cli` | Implementación de referencia |
| Claude Agent | `zed-industries/claude-code-acp` | Adapter oficial |
| Codex CLI | `cola-io/codex-acp` | Adapter comunitario |
| OpenCode | `anomalyco/opencode` | Soporte nativo |
| Kiro CLI | `kiro-cli` | CLI con ACP |

## 8.4 Artículos y Tutoriales

| Título | Autor | URL |
|--------|-------|-----|
| The Agent Client Protocol Overview | Phil Schmid | https://www.philschmid.de/acp-overview |
| Using Zed's ACP with Codex | Ben Terhechte | https://terhech.de/posts/2025-09-26-using-zeds-acp-with-codex.html |
| MCP vs ACP vs A2A | Various | Artículos en Medium, IBM Research blog |

## 8.5 Comunidades y Soporte

| Recurso | URL |
|---------|-----|
| GitHub Issues (ACP) | https://github.com/agentclientprotocol/agent-client-protocol/issues |
| Zed Community | https://zed.dev/chat |
| ACP Registry | https://zed.dev/acp/registry |

---

## Appendix A: Glosario

| Término | Definición |
|---------|------------|
| **ACP** | Agent Client Protocol - Protocolo para comunicación editor-agente |
| **MCP** | Model Context Protocol - Protocolo para conectar agentes a herramientas |
| **A2A** | Agent-to-Agent Protocol - Protocolo para comunicación entre agentes |
| **Client** | Editor de código que se comunica con el agente (Zed, JetBrains, etc.) |
| **Agent** | Programa AI que realiza tareas de codificación (Claude Code, Gemini CLI, etc.) |
| **Session** | Conversación mantenida entre cliente y agente |
| **Prompt Turn** | Ciclo de request-response entre usuario y agente |
| **Tool Call** | Invocación de una herramienta (leer archivo, ejecutar comando, etc.) |
| **Capability** | Feature opcional negociada durante initialize |
| **Session Update** | Notificación enviada por el agente con actualizaciones |

---

*Documento creado en Abril 2026. El protocolo ACP está en constante desarrollo. Verifica la documentación oficial para información más actualizada.*
