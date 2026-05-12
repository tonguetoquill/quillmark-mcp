/**
 * Eval scenarios exercising the three Quillmark MCP tools.
 *
 * Each scenario exposes:
 *   id          – machine key
 *   name        – human label used in the report
 *   description – one-liner for the report header
 *   prompt      – user turn sent to the model
 *   validate(toolCalls, lastToolResult) → { passed, notes }
 */

export const SCENARIOS = [
  {
    id: 'discovery',
    name: 'Tool Discovery',
    description: 'Model must call list_quills to enumerate available formats.',
    prompt: 'What Quill document formats are available in Quillmark? List them all with their descriptions.',
    validate(toolCalls, _lastResult) {
      const ok = toolCalls.includes('list_quills');
      return {
        passed: ok,
        notes: ok ? 'Called list_quills' : 'Did not call list_quills',
      };
    },
  },

  {
    id: 'specs_lookup',
    name: 'Specification Retrieval',
    description: 'Model must call get_specs for the usaf_memo format.',
    prompt: 'Retrieve the full schema and authoring instructions for the "usaf_memo" Quill format.',
    validate(toolCalls, _lastResult) {
      const ok = toolCalls.includes('get_specs');
      return {
        passed: ok,
        notes: ok ? 'Called get_specs' : 'Did not call get_specs',
      };
    },
  },

  {
    id: 'full_pipeline',
    name: 'End-to-End Document Creation',
    description: 'Model must discover formats, get specs, and produce a valid document.',
    prompt:
      'Create a USAF memorandum from HQ AFSPC/A6 to DISTRIBUTION announcing mandatory ' +
      'cybersecurity awareness training scheduled for 15 June 2025. ' +
      'Sign it from COL JOHN A. SMITH, Commander.',
    validate(toolCalls, lastResult) {
      const attempted = toolCalls.includes('create_document');
      const succeeded = typeof lastResult?.url === 'string';
      if (!attempted) return { passed: false, notes: 'Did not call create_document' };
      if (!succeeded) {
        const detail = lastResult ? JSON.stringify(lastResult).slice(0, 120) : 'no result';
        return { passed: false, notes: `create_document did not return a URL — ${detail}` };
      }
      return { passed: true, notes: `Document created: ${lastResult.url}` };
    },
  },

  {
    id: 'direct_create',
    name: 'Prompted Document Creation',
    description: 'Model is told the format; must get specs then create a valid document.',
    prompt:
      'Using the usaf_memo Quill format, draft a memorandum from 1 SFW/CV to 1 SFW/CC ' +
      'requesting approval for an off-installation morale event on 20 July 2025. ' +
      'Sign it from MAJOR SARAH E. JONES, Director of Operations.',
    validate(toolCalls, lastResult) {
      const attempted = toolCalls.includes('create_document');
      const succeeded = typeof lastResult?.url === 'string';
      if (!attempted) return { passed: false, notes: 'Did not call create_document' };
      if (!succeeded) {
        const detail = lastResult ? JSON.stringify(lastResult).slice(0, 120) : 'no result';
        return { passed: false, notes: `create_document did not return a URL — ${detail}` };
      }
      return { passed: true, notes: `Document created: ${lastResult.url}` };
    },
  },
];
