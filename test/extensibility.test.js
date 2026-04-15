/**
 * @module extensibility.test
 * @description Proves the "drop a quill directory and it just works" invariant.
 *
 * Copies the fixture quill into a tempdir under a fresh name, boots
 * createDefaultMCP against that tempdir, and confirms listQuills surfaces
 * the new quill and getSpecs returns its schema — with zero code changes.
 */

import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { createDefaultMCP } from '../src/index.js';
import { listQuills, getSpecs } from '../src/primitives/index.js';

const FIXTURE_QUILLS_DIR = fileURLToPath(new URL('./fixtures/quills', import.meta.url));

describe('extensibility — new quills auto-discover without code changes', () => {
  let tempQuillsDir;
  let mcp;

  before(async () => {
    tempQuillsDir = await mkdtemp(path.join(tmpdir(), 'quillmark-ext-'));
    const targetDir = path.join(tempQuillsDir, 'my_custom_quill');
    await cp(path.join(FIXTURE_QUILLS_DIR, 'usaf_memo'), targetDir, { recursive: true });

    // Registry keys quills by the `name:` field inside Quill.yaml, not the
    // directory name. Patch it so the new quill surfaces under its new name.
    const manifestPath = path.join(targetDir, '1.0.0', 'Quill.yaml');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(
      manifestPath,
      manifest.replace(/name:\s*usaf_memo/, 'name: my_custom_quill'),
    );

    const strategy = { async handle() { return { status: 'success', url: 'stub' }; } };
    mcp = await createDefaultMCP({ quillsDir: tempQuillsDir, strategy });
  });

  after(async () => {
    await mcp?.stop().catch(() => {});
    await rm(tempQuillsDir, { recursive: true, force: true });
  });

  it('listQuills surfaces the newly-added quill', async () => {
    const quills = await listQuills(mcp.registry);
    const names = quills.map((q) => q.name);
    assert.ok(names.includes('my_custom_quill'), `new quill not discovered: ${names.join(',')}`);
  });

  it('getSpecs returns a schema for the newly-added quill', async () => {
    const specs = await getSpecs(mcp.registry, 'my_custom_quill');
    assert.equal(typeof specs.schema, 'string');
    assert.ok(specs.schema.length > 0);
  });
});
