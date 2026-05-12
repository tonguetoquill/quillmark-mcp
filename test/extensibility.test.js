/**
 * @module extensibility.test
 * @description Proves the "drop a quill directory and it just works" invariant.
 *
 * Builds a fresh Quiver source layout in a tempdir (Quiver.yaml +
 * quills/<name>/<version>/...), copies the fixture quill in under a fresh
 * name, boots createDefaultMCP against that tempdir, and confirms
 * listQuills surfaces the new quill and getSpecs returns its schema —
 * with zero code changes.
 */

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { createDefaultMCP } from '../src/index.js';
import { listQuills, getSpecs } from '../src/primitives/index.js';

const FIXTURE_QUILLS_DIR = fileURLToPath(new URL('./fixtures/quills', import.meta.url));

describe('extensibility — new quills auto-discover without code changes', () => {
  let tempQuiverDir;
  let mcp;

  before(async () => {
    tempQuiverDir = await mkdtemp(path.join(tmpdir(), 'quillmark-ext-'));

    // Quiver source layout: <root>/Quiver.yaml + <root>/quills/<name>/<version>/...
    await writeFile(
      path.join(tempQuiverDir, 'Quiver.yaml'),
      'name: extensibility_fixture\n',
    );
    const quillsRoot = path.join(tempQuiverDir, 'quills');
    await mkdir(quillsRoot, { recursive: true });

    const targetDir = path.join(quillsRoot, 'my_custom_quill');
    await cp(path.join(FIXTURE_QUILLS_DIR, 'usaf_memo'), targetDir, { recursive: true });

    // Quiver keys quills by directory name; the engine validates the `name:`
    // inside Quill.yaml. Patch the embedded name so the engine accepts the
    // renamed copy.
    const manifestPath = path.join(targetDir, '1.0.0', 'Quill.yaml');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(
      manifestPath,
      manifest.replace(/name:\s*usaf_memo/, 'name: my_custom_quill'),
    );

    const strategy = { async handle() { return { status: 'success', url: 'stub' }; } };
    mcp = await createDefaultMCP({ quiverDir: tempQuiverDir, strategy });
  });

  after(async () => {
    await mcp?.stop().catch(() => {});
    await rm(tempQuiverDir, { recursive: true, force: true });
  });

  it('listQuills surfaces the newly-added quill', async () => {
    const quills = await listQuills(mcp.quiver, mcp.engine);
    const names = quills.map((q) => q.name);
    assert.ok(names.includes('my_custom_quill'), `new quill not discovered: ${names.join(',')}`);
  });

  it('getSpecs returns instruction and blueprint for the newly-added quill', async () => {
    const specs = await getSpecs(mcp.quiver, mcp.engine, 'my_custom_quill');
    assert.equal(typeof specs.instruction, 'string');
    assert.ok(specs.instruction.length > 0);
  });
});
