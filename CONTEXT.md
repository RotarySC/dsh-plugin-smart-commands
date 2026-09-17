# Smart Commands & Prompt Menu

The Smart Commands plugin provides prompt template management, chain workflows, and conversation composer integration for DeepSeek Harness (DSH).

## Language

**Prompt Menu**:
The dropdown popover button and list in the composer toolbar (`conversation.input.left`) for searching and inserting templates.
_Avoid_: Template picker, prompt dropdown box, snippet toolbar

**Template**:
A Markdown document with YAML frontmatter defining an executable prompt, subagent directive, or chain workflow.
_Avoid_: Prompt file, command file, macro

**Persona**:
Per-child `deployment:persona` text that shadows the parent's deployment persona for one subagent run. Written as a non-boolean `subagent:` string (except the `continuable` token) or as a chain step `agent:`. The child still joins the parent session's agent-preset; Persona does not pick a composition.
_Avoid_: agent-preset, preset, 子代理预设, 预设

**Model spec**:
One catalog token used by **template-level** `model:`: bare `id`, qualified `provider/id`, or `provider/*`. That field is a comma-separated fallback list resolved against every registered provider; when no spec matches, the run uses the current session model. A chain step `model:` is a single string passed through as `agentOptions.model` — no fallback list, no `provider/id` split.
_Avoid_: session model picker, unqualified "the DeepSeek model"

**Slash Command**:
The registered slash prefix name (e.g. `/<slashName>`) representing a runnable template within a conversation.
_Avoid_: Command alias, trigger keyword

**Template Inventory**:
The lightweight metadata catalog of available templates across user and project layers.
_Avoid_: Template list, command index

**Draft Insertion**:
The action of appending or setting a selected template's invocation into the conversation composer draft via `inputActions.setDraft`. If prior draft text exists, it is joined with a newline delimiter.
_Avoid_: Paste, destructive text replacement, macro expansion

**Item Decorator**:
The right-aligned metadata badge/pill in a template menu row indicating its slash command name or origin layer.
_Avoid_: Selection box, item action button, checkbox

**Template Inventory Cache**:
The client-side in-memory snapshot of templates cached with a short TTL for responsive dropdown openings.
_Avoid_: Static list, global store

**Focus Restoration**:
The automatic returning of DOM focus to the chat composer textarea following Prompt Menu insertion or dismissal.
_Avoid_: Blur, unmanaged focus, trigger refocusing

**Chain Run**:
One execution of a `chain` template that has been detached from the slash-command transaction, so the composer is released immediately while the steps keep running under the run's own AbortSignal.
_Avoid_: Background job, queued command, async command

**Run Dock**:
The collapsible panel above the composer card (`conversation.input.dock`, id `smart-commands.runs`) showing this session's Chain Runs with step progress, elapsed time, and a cancel control.
_Avoid_: Progress bar, job panel, task list, status bar
