## ADDED Requirements

### Requirement: Plugin manifest

The Codex plugin SHALL include a `.codex-plugin/plugin.json` manifest file containing name, version, description, and component pointers.

The manifest SHALL declare:
- `name`: `"tencentdb-memory"` (kebab-case identifier)
- `version`: `"1.0.0"` (semver)
- `description`: Plugin description in English
- `skills`: `"./skills/"` pointer to bundled Codex skills
- `mcpServers`: `"./.mcp.json"` pointer to MCP server configuration
- `hooks`: `"./hooks/hooks.json"` pointer to lifecycle hooks

#### Scenario: Manifest identifies the plugin

- **WHEN** Codex loads the plugin from the plugin directory
- **THEN** it reads `.codex-plugin/plugin.json` and discovers bundled skills, MCP servers, and hooks

#### Scenario: All component pointers resolve

- **WHEN** the manifest is loaded
- **THEN** each pointer (`skills`, `mcpServers`, `hooks`) resolves to an existing file or directory relative to the plugin root

### Requirement: Plugin directory structure

The plugin SHALL follow the standard Codex plugin layout:

```
codex-plugin/memory/memory_tencentdb/
├── .codex-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   ├── recall.ts
│   └── capture.ts
├── skills/
│   └── tencentdb-memory/
│       └── SKILL.md
├── .mcp.json
├── mcp-server.ts
└── README.md
```

Hook scripts and MCP server are executed directly as TypeScript via `npx tsx` — no build step required.

#### Scenario: Directory matches Codex conventions

- **WHEN** a developer inspects the `codex-plugin/memory/memory_tencentdb/` directory
- **THEN** the structure matches the layout defined above with all required files present

### Requirement: Installation script

An installation script SHALL register the plugin with Codex's local marketplace.

The script SHALL:
- Be implemented as a single Node.js script: `scripts/install-codex-plugin.js`
- Create the Codex marketplace directory if missing: `~/.agents/plugins/`
- Copy the plugin from `codex-plugin/memory/memory_tencentdb/` into `~/.agents/plugins/tencentdb-memory/` (keeping the path within the marketplace root, as required by Codex)
- Write a `marketplace.json` with `source.path: "./tencentdb-memory"` pointing to the copied plugin
- Handle both fresh install (create directory) and reinstall (update entry, replace existing copy)

#### Scenario: Install via Node.js

- **WHEN** user runs `node scripts/install-codex-plugin.js`
- **THEN** the plugin is copied to `~/.agents/plugins/tencentdb-memory/` and `~/.agents/plugins/marketplace.json` is created with a `tencentdb-memory` plugin entry (`source.path: "./tencentdb-memory"`), including required `policy` (`installation: "AVAILABLE"`, `authentication: "ON_INSTALL"`) and `category` fields

### Requirement: Uninstallation script

An uninstallation script SHALL remove the plugin from Codex's local marketplace and guide the user through remaining cleanup.

The script SHALL:
- Be implemented as a single Node.js script: `scripts/uninstall-codex-plugin.js`
- Remove the `tencentdb-memory` entry from `~/.agents/plugins/marketplace.json`
- Remove the copied plugin directory `~/.agents/plugins/tencentdb-memory/`
- If the marketplace file becomes empty after removal, delete the file
- Print guidance to stderr for remaining manual cleanup steps

The printed guidance SHALL cover:
- Stop the Gateway process (Unix: `pkill -f "gateway/server.ts"`, Windows: `taskkill /F /IM node.exe` or close the terminal)
- Delete stored memory data directory (Unix: `rm -rf ~/.memory-tencentdb/`, Windows: `rmdir /s %USERPROFILE%\.memory-tencentdb\`), with a warning that this is irreversible

#### Scenario: Uninstall via Node.js

- **WHEN** user runs `node scripts/uninstall-codex-plugin.js`
- **THEN** the `tencentdb-memory` entry is removed from `~/.agents/plugins/marketplace.json`
- **THEN** cleanup instructions are printed to stderr

#### Scenario: Uninstall when marketplace has other plugins

- **WHEN** the marketplace file contains entries for other plugins besides `tencentdb-memory`
- **THEN** only the `tencentdb-memory` entry is removed; the file and other entries are preserved

#### Scenario: Uninstall when plugin was never installed

- **WHEN** the marketplace file does not exist or does not contain a `tencentdb-memory` entry
- **THEN** the script prints "Plugin not found in marketplace" and exits successfully (idempotent)

### Requirement: Plugin documentation

The plugin SHALL include a standalone `README.md` at `codex-plugin/memory/memory_tencentdb/README.md` documenting install, uninstall, and configuration.

Documentation SHALL cover:
- Prerequisites (Node.js >= 22.16.0, Gateway running)
- Installation (via `node scripts/install-codex-plugin.js`)
- Uninstallation (via `node scripts/uninstall-codex-plugin.js`, plus manual cleanup steps)
- Gateway management: manual start vs auto-spawn via `MEMORY_TENCENTDB_GATEWAY_CMD`
- Environment variables: `TDAI_GATEWAY_URL` (default: `http://127.0.0.1:8420`), `MEMORY_TENCENTDB_GATEWAY_CMD`, `TDAI_LLM_API_KEY`
- Available MCP tools: `tdai_memory_search`, `tdai_conversation_search`

The project-level `README.md` and `README_CN.md` SHALL NOT be modified for this change.

#### Scenario: User can follow plugin README to working setup

- **WHEN** a new user reads `codex-plugin/memory/memory_tencentdb/README.md` and follows the steps
- **THEN** they can install the plugin, start the Gateway, and see memory tools in Codex without consulting any other documentation
