/**
 * @module test/tool-chain
 * Unit tests for toolChainOrdered: grading whether a run drove the prescribed
 * list_quills? -> get_spec -> create_document chain in order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { toolChainOrdered } from '../eval/run.js';

describe('toolChainOrdered', () => {
  it('is null when the model never reached create_document', () => {
    assert.equal(toolChainOrdered([]), null);
    assert.equal(toolChainOrdered(['list_quills', 'get_spec']), null);
  });

  it('accepts the full canonical chain', () => {
    assert.equal(toolChainOrdered(['list_quills', 'get_spec', 'create_document']), true);
  });

  it('accepts get_spec -> create_document (list_quills optional)', () => {
    assert.equal(toolChainOrdered(['get_spec', 'create_document']), true);
  });

  it('accepts retries after a correctly ordered start', () => {
    assert.equal(toolChainOrdered(['get_spec', 'create_document', 'create_document']), true);
  });

  it('rejects jumping straight to create_document (no get_spec)', () => {
    assert.equal(toolChainOrdered(['create_document']), false);
    assert.equal(toolChainOrdered(['list_quills', 'create_document']), false);
  });

  it('rejects create_document before get_spec', () => {
    assert.equal(toolChainOrdered(['create_document', 'get_spec', 'create_document']), false);
  });

  it('rejects discovery out of order (list_quills after get_spec)', () => {
    assert.equal(toolChainOrdered(['get_spec', 'list_quills', 'create_document']), false);
  });
});
