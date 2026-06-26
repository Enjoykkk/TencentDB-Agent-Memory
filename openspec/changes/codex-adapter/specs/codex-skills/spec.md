## ADDED Requirements

### Requirement: Memory skill for Codex agent

The plugin SHALL bundle a Codex skill at `codex-plugin/memory/memory_tencentdb/skills/tencentdb-memory/SKILL.md` that documents the memory system for the Codex agent.

The skill SHALL include:
- `name`: `tencentdb-memory`
- `description`: A concise description of when the skill should trigger (implicit invocation)

The skill body SHALL explain:
- The four memory tiers: L0 (conversation archive), L1 (extracted facts), L2 (scenes), L3 (persona)
- That memory recall happens automatically — the agent does NOT need to manually trigger it
- When to use `tdai_memory_search`: looking up facts, preferences, instructions the user has shared
- When to use `tdai_conversation_search`: finding specific past conversations
- Search result format and how to interpret them
- That memory capture happens automatically after each turn

#### Scenario: Agent reads skill before using memory tools

- **WHEN** the Codex agent is about to call `tdai_memory_search`
- **THEN** it has access to the SKILL.md guidance describing proper usage

#### Scenario: Skill triggers automatically on memory-related tasks

- **WHEN** the user asks a question that references past context (e.g., "what did we decide about...")
- **THEN** Codex may implicitly invoke the `tencentdb-memory` skill to guide memory search usage

### Requirement: Skill format compliance

The skill SHALL follow the open agent skills standard with YAML frontmatter containing `name` and `description`.

The `description` field SHALL be concise (1-2 sentences) with clear trigger words for implicit invocation matching.

The skill body SHALL use imperative instructions ("When X happens, do Y") rather than passive descriptions.

#### Scenario: Skill parses correctly

- **WHEN** Codex scans the `skills/` directory
- **THEN** the `tencentdb-memory` skill is discovered with valid `name` and `description` frontmatter

### Requirement: Skill is non-blocking at recall time

The skill body SHALL explicitly state that memory recall and capture happen automatically, so the agent does NOT need to call memory tools before every response.

The skill SHALL instruct the agent to only use memory search tools when specifically asked or when the task requires looking up past context.

#### Scenario: Agent does not redundantly search every turn

- **WHEN** the user asks a simple question that doesn't require historical context
- **THEN** the agent does NOT invoke `tdai_memory_search` (because recall is automatic)
