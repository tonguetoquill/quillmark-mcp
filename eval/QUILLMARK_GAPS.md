# Quillmark gap analysis (eval-driven)

Source: two eval runs of `quillmark-mcp` against `@quillmark/wasm@0.84.0` on 2026-05-22 and 2026-05-23.
Models exercised: gpt-5.4-mini, gpt-5.4-nano, claude-haiku-4-5, openai/gpt-oss-120b, google/gemma-4-26b-a4b-it, nvidia/nemotron-3-nano-30b-a3b, meta-llama/llama-3.1-8b-instruct.
Prompts: 8 shipped quills (`memo`, `memo_minimal`, `cnn`, `nyt`, `discord`, `intel_brief`, `static_analysis`, `x_post`), 3 trials each.

Below are behaviors in @quillmark/wasm (errors and blueprint output) that consistently caused capable models to fail or burn retries. Each is something an LLM in a tool-use loop cannot recover from with the information Quillmark currently surfaces.

---

## 1. CRITICAL: Rust panic leaks through WASM boundary on multibyte characters

**Frequency**: 2 occurrences, claude-haiku-4-5 / `usaf_intel_brief`.
**Symptom**: WASM throws `Error: string index 2 is not a character boundary` — a raw Rust panic string, not a `Diagnostic`. The MCP server categorizes these as "Internal renderer error" because nothing in the message is actionable to a caller.

**Repro fragment** (Haiku trial 2, `usaf_intel_brief@0.1.0`):
```yaml
title: INDOPACOM Operational Posture
bluf: "**Peer competitor naval activity in the South China Sea remains elevated, with regional partners reporting heightened tensions.**"
```
After Haiku quoted the value to escape its first alias-error retry, the same document panicked. The em-dash (`—`) in adjacent fields (e.g. `briefer: Maj Sarah Chen, INDOPACOM/A2`) or curly quotes are likely culprits — both are multi-byte in UTF-8, and a `&str` indexed at a fixed byte offset will land mid-codepoint.

**Asks**:
- Replace any `&s[..n]` / `s.split_at(n)` style slicing in the diagnostic / rendering path with `char_indices()` or `floor_char_boundary`.
- Even after fixing the panic site, wrap remaining `panic!` paths with `catch_unwind` or convert to `QuillmarkError` so consumers see a `Diagnostic`, not a Rust string.

---

## 2. YAML error "alias references unknown anchor" is unactionable when the cause is markdown emphasis

**Frequency**: 5 occurrences across `claude-haiku-4-5` and `gpt-5.4-nano` on `usaf_intel_brief` (every Haiku trial; the *most common* one-shot failure for advanced models).

**Repro** (Haiku trial 1):
```yaml
bluf: **Increased maritime activity in South China Sea; regional air defense posture elevated.**
```
Error:
```
YAML error: error: line 5 column 7: alias references unknown anchor
  --> <input>:5:7
   |
 5 | bluf: **Increased maritime activity ...
   |       ^ alias references unknown anchor
```
The YAML spec reserves `*` as the alias indicator and `&` as the anchor indicator, so a plain-scalar value beginning with `*` or `&` triggers this error. But every model in the eval (including Haiku) writes markdown emphasis (`**bold**`, `*italic*`) into prose fields like `bluf`, `title`, `notes`, `headline`, `issue`. The current error names a YAML concept (anchor/alias) that has nothing to do with the user's intent.

**Asks**:
- When a value's plain-scalar form starts with `*` or `&`, emit a Quillmark-side hint such as:
  > `Plain-scalar values cannot start with '*' or '&' (reserved as YAML alias/anchor indicators). If you intended markdown emphasis or a literal '*', wrap the value in single quotes:` `field: '**bold text**'`
- Alternatively, post-process the YAML library's error and re-render with this advice when the failing token starts with `*` or `&`.

---

## 3. YAML error "mapping values are not allowed in this context" omits the actionable fix

**Frequency**: 21 occurrences across every advanced model (Haiku, gpt-mini, gpt-nano, gpt-oss-120b, gemma).

**Repro** (gpt-oss-120b, `static_analysis_report@0.1.0`):
```yaml
system_name: Node.js Service: Order Processing API
```
Error:
```
YAML error: error: line 22 column 29: mapping values are not allowed in this context
  --> <input>:22:29
   |
22 | system_name: Node.js Service: Order Processing API
   |                             ^ mapping values are not allowed in this context
```
The second `:` in the unquoted value is interpreted as the start of a nested key. Every LLM eventually hits this because natural-language values (headlines, issue names, subjects) contain colons.

**Asks**:
- When the parser caret points at a `:` inside what looks like a single-line value, add a hint:
  > `Unquoted values cannot contain ':'. Quote the value:` `system_name: "Node.js Service: Order Processing API"`
- Same applies to `#` (treated as comment start mid-value).

---

## 4. YAML errors leak internal Rust API names into user-facing messages

**Frequency**: 4 occurrences for "multiple YAML documents" + 1 for "duplicate mapping key" + 8 occurrences of "block sequence entries are not allowed in this context" (which doesn't leak API names but is similarly cryptic).

**Repro 1** (gpt-5.4-nano, `discord_chat`):
```yaml
~~~card-yaml
$kind: message
username: Eli
---

Guys—Saturday board games at my place? I can host and bring snacks.
```
Error:
```
YAML error: error: line 14 column 1: multiple YAML documents detected; use from_multiple or from_multiple_with_options
```
The model used `---` as a within-block separator between metadata and prose body (a reasonable but wrong guess). The advice `use from_multiple or from_multiple_with_options` is a Rust API surface that means nothing to an LLM caller.

**Repro 2** (nemotron, `nyt_news_article`):
```
duplicate mapping key: organizations, set DuplicateKeyPolicy in Options if acceptable
```

**Asks**:
- Strip or replace mentions of `from_multiple`, `from_multiple_with_options`, `DuplicateKeyPolicy`, `Options`, etc.
- For the `---` case specifically: detect a stray YAML directive separator inside a `~~~card-yaml` block and emit:
  > `'---' is not a valid separator inside a ~~~card-yaml block. Close the block with '~~~' before starting prose body.`

---

## 5. YAML error "invalid indentation in multiline quoted scalar" should point at block scalar

**Frequency**: 3 occurrences across `gpt-5.4-nano` and `openai/gpt-oss-120b` on `usaf_intel_brief`.

**Repro** (gpt-oss-120b):
```yaml
bullets: "- (U) **Chinese** naval activity increased in the South China Sea.
- (U) **U.S.** forces conducted a joint maritime patrol.
- (U) Regional allies reported **cyber intrusions** targeting critical infrastructure."
```
Error: `invalid indentation in multiline quoted scalar`.

The model picked a double-quoted scalar for multi-line content. Continuation lines in a double-quoted scalar must be indented past the key column.

**Ask**:
- When a multi-line double-quoted scalar fails on indentation, add the hint:
  > `Multi-line text is easier to write as a block scalar:` `bullets: |\n  - line one\n  - line two`

---

## 6. Blueprint signals "must-fill" but doesn't pre-quote string sentinels

**Frequency**: 1 direct occurrence (gpt-5.4-nano left `<must-fill>` literal in 4 fields); indirectly drives many of the YAML errors above because the model has to choose how to write a string value.

The current blueprint format is:
```yaml
memo_for: <must-fill>  # array<string>
subject: <must-fill>  # string
```
Quillmark's own validator catches the literal `<must-fill>` ("still carries the `<must-fill>` blueprint sentinel") — excellent.

But when the model *does* replace the sentinel for a `string` field, it picks whatever scalar style it likes, and frequently picks plain-scalar with content that needs quoting (markdown emphasis, embedded `:`, leading `*`). 

**Ask** (lower priority, more invasive — discuss before implementing):
- Consider emitting string sentinels pre-quoted:
  ```yaml
  subject: "<must-fill>"  # string
  ```
  so the model's textual edit lands inside the quotes by default and most YAML pitfalls disappear. Array / number / boolean sentinels stay bare.

---

## 7. Schema-vs-type mismatch errors are excellent — keep them

For context: the following errors performed *well* in evals — models almost always recovered on retry:

- `Field 'X' got integer 47, schema declares 'string' with default "". Either quote the value ('X: "47"') or change the schema's 'type:' to 'integer'.` — concrete, actionable, names both fixes.
- `Field 'X' still carries the '<must-fill>' blueprint sentinel, schema declares 'array'. Replace '<must-fill>' with a value of type 'array'.` — clear.
- `Field 'X' is missing, schema declares 'array' with no default. Provide a value of type 'array'.` — clear.

These are the gold standard. The asks above amount to applying the same actionable-hint pattern to the YAML parser errors that currently leak raw `yaml-rust2` (or similar) messages.

---

## Out of scope for Quillmark (handled at quill design or MCP layer)

- Quill authors choosing `type: string` for prose fields that semantically want `type: markdown` (e.g. `bluf`, `bullets`).
- Models picking the wrong version pin (`usaf_intel_brief@0.2.0` when only `0.1.0` exists) — covered by MCP's "Drop the @version suffix to bind to the latest" hint.
- Models writing a text turn instead of the next tool call — covered by MCP's mandatory-workflow instructions.
