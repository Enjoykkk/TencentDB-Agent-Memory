## ADDED Requirements

### Requirement: UserPromptSubmit hook for memory recall

The plugin SHALL register a `UserPromptSubmit` hook that calls the Gateway's `/recall` endpoint before the agent processes each user message.

The hook SHALL:
- Be configured as a `type: "command"` hook executing `npx tsx ${PLUGIN_ROOT}/hooks/recall.ts`
- Read the hook event JSON from stdin, extracting `prompt` and `session_id`
- POST to `{GATEWAY_URL}/recall` with body `{ "query": prompt, "session_key": session_id }`
- Return on stdout: `{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "<recall results>" } }`
- Store the user prompt to `~/.memory-tencentdb/prompts/{session_id}.json` for later correlation by the Stop hook

The HTTP request SHALL have a 10-second timeout to prevent blocking the agent.

The `GATEWAY_URL` SHALL default to `http://127.0.0.1:8420` and be overridable via the `TDAI_GATEWAY_URL` environment variable.

#### Scenario: Recall injects memory context

- **WHEN** user submits a prompt and the `UserPromptSubmit` hook fires
- **THEN** the recall script POSTs to Gateway `/recall` and returns matching memories as `additionalContext`
- **THEN** the memory context is added to the agent's developer context

#### Scenario: Gateway timeout gracefully degrades

- **WHEN** the Gateway does not respond to `/recall` within 10 seconds
- **THEN** the hook returns empty `additionalContext` and the agent proceeds without memory context

#### Scenario: Recall returns no matches

- **WHEN** the Gateway responds successfully to `/recall` but returns zero matching memories
- **THEN** the hook returns empty `additionalContext` and the agent proceeds without additional memory context

#### Scenario: Prompt stored for capture correlation

- **WHEN** the `UserPromptSubmit` hook fires
- **THEN** the user's prompt text is written to `~/.memory-tencentdb/prompts/{session_id}.json` with a timestamp

### Requirement: Stop hook for memory capture

The plugin SHALL register a `Stop` hook that records the completed conversation turn to TDAI memory.

The hook SHALL:
- Be configured as a `type: "command"` hook executing `npx tsx ${PLUGIN_ROOT}/hooks/capture.ts`
- Read the hook event JSON from stdin, extracting `session_id` and `last_assistant_message`
- Read the stored user prompt from `~/.memory-tencentdb/prompts/{session_id}.json`
- POST to `{GATEWAY_URL}/capture` with body `{ "user_content": prompt, "assistant_content": last_assistant_message, "session_key": session_id }`
- Delete the prompt file after successful capture
- Return on stdout: `{ "continue": true }`

The HTTP request SHALL have a 30-second timeout.

The `GATEWAY_URL` SHALL default to `http://127.0.0.1:8420` and be overridable via the `TDAI_GATEWAY_URL` environment variable.

#### Scenario: Capture records completed turn

- **WHEN** the Codex agent finishes a response and the `Stop` hook fires
- **THEN** the capture script reads the stored prompt, POSTs to Gateway `/capture`, and returns `{ "continue": true }`

#### Scenario: Missing assistant message

- **WHEN** the `Stop` hook fires but `last_assistant_message` is null (e.g., agent was interrupted before generating a response)
- **THEN** the script logs a warning and skips the `/capture` call entirely (Gateway requires non-empty `assistant_content`)

#### Scenario: Missing prompt file gracefully degrades

- **WHEN** the `Stop` hook fires but no prompt file exists for the session (e.g., the file was cleaned up)
- **THEN** the script logs a warning and skips the `/capture` call entirely (Gateway requires non-empty `user_content`)

#### Scenario: Capture failure does not block agent

- **WHEN** the Gateway does not respond to `/capture` within 30 seconds
- **THEN** the hook returns `{ "continue": true }` and the agent proceeds without recording the turn

### Requirement: Hook configuration file

The hook configuration SHALL be stored at `codex-plugin/memory/memory_tencentdb/hooks/hooks.json` and SHALL follow the Codex hook schema.

The configuration SHALL use the `PLUGIN_ROOT` environment variable (set by Codex at hook runtime) to resolve script paths.

Each hook SHOULD include a `statusMessage` field for user-visible progress indication (e.g., "Recalling memory context…", "Capturing conversation turn…").

Hook commands SHOULD provide a `commandWindows` alternative for Windows compatibility (e.g., `npx tsx %PLUGIN_ROOT%\\hooks\\recall.ts`).

Hook timeout values SHALL be set to 10 seconds for recall and 30 seconds for capture (Codex default is 600 seconds).

#### Scenario: Hooks config is loadable by Codex

- **WHEN** the plugin is enabled in Codex
- **THEN** the `hooks/hooks.json` file is discovered and parsed without errors
- **THEN** both `UserPromptSubmit` and `Stop` hooks appear in the `/hooks` review UI

### Requirement: Prompt correlation via temp files

The recall and capture hook scripts SHALL use the filesystem to correlate `UserPromptSubmit` and `Stop` events.

The temp directory SHALL be `~/.memory-tencentdb/prompts/`, created on first write if it does not exist.

The recall script SHALL write files named `{session_id}.json` containing `{ "prompt": "<text>", "timestamp": "<ISO-8601>" }`.

The capture script SHALL read and delete the corresponding file for its `session_id`.

#### Scenario: Concurrent sessions are isolated

- **WHEN** two Codex sessions (with different `session_id` values) fire hooks simultaneously
- **THEN** each session's prompt file is written and read independently without cross-contamination

### Requirement: Stale prompt file cleanup

The recall script SHALL, as a side effect, delete any prompt files older than 24 hours when writing a new prompt file.

#### Scenario: Old files are garbage-collected

- **WHEN** the recall script writes a prompt file and finds files with timestamps older than 24 hours
- **THEN** those stale files are deleted
