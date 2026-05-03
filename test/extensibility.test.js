/**
 * @module extensibility.test
 * @description Proves the "drop a quill directory and it just works" invariant.
 *
 * Builds a fresh Quiver source layout in a tempdir (Quiver.yaml +
 * quills/<name>/<version>/...), copies the fixture quill in under a fresh
 * name, boots createDefaultMCP against that tempdir, and confirms the
 * library's listQuills/getSpecs primitives surface the new quill and its
 * schema — with zero code changes.
 */

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { listQuills, getSpecs } from '@quillmark/mcp';

import { createDefaultMCP } from '../src/index.js';

const FIXTURE_QUILLS_DIR = fileURLToPath(new URL('./fixtures/quills', import.meta.url));

describe('extensibility — new quills auto-discover without code changes', () => {
  let tempQuiverDir;
  let mcp;

  before(async () => {
    tempQuiverDir = await mkdtemp(path.join(tmpdir(), 'quillmark-ext-'));

    await writeFile(
      path.join(tempQuiverDir, 'Quiver.yaml'),
      'name: extensibility_fixture\n',
    );
    const quillsRoot = path.join(tempQuiverDir, 'quills');
    await mkdir(quillsRoot, { recursive: true });

    const targetDir = path.join(quillsRoot, 'my_custom_quill');
    await cp(path.join(FIXTURE_QUILLS_DIR, 'usaf_memo'), targetDir, { recursive: true });

    const manifestPath = path.join(targetDir, '1.0.0', 'Quill.yaml');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(
      manifestPath,
      manifest.replace(/name:\s*usaf_memo/, 'name: my_custom_quill'),
    );

    const deliver = async () => ({ status: 'success', url: 'stub' });
    mcp = await createDefaultMCP({ quiverDir: tempQuiverDir, deliver });
  });

  after(async () => {
    await mcp?.stop().catch(() => {});
    await rm(tempQuiverDir, { recursive: true, force: true });
  });

  it('listQuills surfaces the newly-added quill', async () => {
    const result = await listQuills(mcp.quiver, mcp.engine);
    const names = result.quills.map((q) => q.name);
    assert.ok(names.includes('my_custom_quill'), `new quill not discovered: ${names.join(',')}`);
  });

  it('getSpecs returns a schema for the newly-added quill', async () => {
    const specs = await getSpecs(mcp.quiver, mcp.engine, 'my_custom_quill');
    assert.equal(typeof specs.schema, 'string');
    assert.ok(specs.schema.length > 0);
  });
});
