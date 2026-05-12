# Quillmark MCP — Multi-Model Compatibility Evaluation

- **Date:** 2026-05-12
- **Models evaluated:** llama-3.1-8b-instant, meta-llama/llama-4-scout-17b-16e-instruct, qwen/qwen3-32b
- **Quill formats available:** cnn_news_article, discord_chat, nyt_news_article, static_analysis_report, usaf_intel_brief, usaf_memo, x_post

This report evaluates how well popular open-source models interact with the Quillmark MCP tool suite (`list_quills`, `get_specs`, `create_document`). Each scenario is run end-to-end: the model receives a natural-language task, calls tools as needed, and is scored on whether it produced a valid result.

---

## Summary

| Model | Passed | Total | Pass Rate |
|-------|--------|-------|-----------|
| `llama-3.1-8b-instant` | 2 | 4 | 50% |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 2 | 4 | 50% |
| `qwen/qwen3-32b` | 2 | 4 | 50% |

---

## Results by Scenario

### Tool Discovery

| Model | Result | Tool Sequence | Turns | Notes |
|-------|--------|---------------|-------|-------|
| `llama-3.1-8b-instant` | ✅ Pass | list_quills | 2 | Called list_quills |
| `meta-llama/llama-4-scout-17b-16e-instruct` | ✅ Pass | list_quills | 2 | Called list_quills |
| `qwen/qwen3-32b` | ✅ Pass | list_quills | 2 | Called list_quills |

### Specification Retrieval

| Model | Result | Tool Sequence | Turns | Notes |
|-------|--------|---------------|-------|-------|
| `llama-3.1-8b-instant` | ✅ Pass | get_specs | 2 | Called get_specs |
| `meta-llama/llama-4-scout-17b-16e-instruct` | ⚠️ Error | get_specs | 2 | Runtime error: Groq 400: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details. |
| `qwen/qwen3-32b` | ✅ Pass | get_specs | 2 | Called get_specs |

### End-to-End Document Creation

| Model | Result | Tool Sequence | Turns | Notes |
|-------|--------|---------------|-------|-------|
| `llama-3.1-8b-instant` | ⚠️ Error | list_quills → get_specs → get_specs | 3 | Runtime error: Groq 400: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details. |
| `meta-llama/llama-4-scout-17b-16e-instruct` | ✅ Pass | create_document → list_quills → get_specs → create_document → create_document → create_document → create_document → create_document | 8 | Document created successfully |
| `qwen/qwen3-32b` | ⚠️ Error | list_quills → get_specs | 3 | Runtime error: Groq 400: Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details. |

### Prompted Document Creation

| Model | Result | Tool Sequence | Turns | Notes |
|-------|--------|---------------|-------|-------|
| `llama-3.1-8b-instant` | ❌ Fail | list_quills → get_specs → get_specs → create_document → create_document → create_document | 6 | create_document failed — YAML error at line 1 (block 0): error: line 20 column 1: simple key expect ':'...|
| `meta-llama/llama-4-scout-17b-16e-instruct` | ❌ Fail | get_specs → create_document → create_document → create_document | 5 | create_document failed — QUILL: is required in frontmatter to select the Quill format. |
| `qwen/qwen3-32b` | ❌ Fail | get_specs | 2 | Did not call create_document |

---

## Methodology

- **API:** Groq (OpenAI-compatible), temperature 0, max_tokens 512
- **Inter-call delay:** 12 s (enforced globally to stay well under 6 000 TPM)
- **Backend:** Quillmark primitives invoked directly (no MCP transport)
- **Strategy:** MockStrategy — validates document structure, returns a synthetic URL
- **Schema delivery:** `get_specs` results are compacted in the conversation (field names, types, required flags, one example per field) while the full result is used for pass/fail validation
- **Max turns per scenario:** 8

### Scenarios

| # | ID | What it tests |
|---|----|---------------|
| 1 | `discovery` | Calls `list_quills` to enumerate formats |
| 2 | `specs_lookup` | Calls `get_specs` for a named format |
| 3 | `full_pipeline` | Discovers format → gets specs → creates a valid document |
| 4 | `direct_create` | Given a format name, gets specs → creates a valid document |

**Pass criteria:** Scenarios 1–2 pass if the required tool was called. Scenarios 3–4 pass only if `create_document` returns `{ status: "success" }`, meaning the model produced syntactically valid Quillmark content with correct YAML frontmatter and required fields populated.
