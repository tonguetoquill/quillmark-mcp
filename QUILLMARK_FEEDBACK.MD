# Quillmark Feedback — upgrading `@quillmark/wasm` 0.87.1 → 0.90.0

Context: bumping `@quillmark/wasm` from `^0.87.1` to `0.90.0` in `quillmark-mcp`.
Recorded here per the upgrade task. Friction is ordered roughly by how much
time it cost.

## 1. The wasm bump silently forces a `@quillmark/quiver` bump — peer range is misleading

`@quillmark/quiver@0.12.0` (what this repo shipped) declares
`peerDependencies: { "@quillmark/wasm": ">=0.86.0" }`. That range *admits*
0.90.0, so `npm install @quillmark/wasm@0.90.0` produced **no peer warning** —
but quiver 0.12's code calls `engine.quill(tree)` and `quill.render(doc)`,
both of which 0.90 **removed**. The result is a runtime break with a green
install:

- `SyntaxError: The requested module '@quillmark/wasm' does not provide an export named 'Quillmark'` (module-load time, which aborted whole test files), and
- `TypeError: Cannot read properties of undefined (reading 'engine')` from inside quiver once you get past that.

I had to discover the compatible quiver line by hand: `@quillmark/quiver@0.15.0`
is the first with `peerDependencies: { "@quillmark/wasm": ">=0.90.0-0" }`.

**Ask:** when an engine-free / breaking wasm release lands, bump the quiver peer
**floor** in the same train (`>=0.90.0-0`) so the old quiver refuses to resolve
against the new wasm instead of installing cleanly and failing at runtime. The
`>=` floor that predates the break is worse than a caret here.

Minor: the registry has a gap — quiver jumps `0.13.0 → 0.15.0` with no `0.14.0`
published, which made "what's the next compatible version" guesswork.

## 2. No migration guide in the published tarball

The wasm `CHANGELOG.md` repeatedly points at
`docs/migrations/0.89-to-0.90.md`, but `docs/` is **not** in the published npm
package (tarball contains only `CHANGELOG.md README.md backends/ core/
runtime/ package.json`). I reconstructed the new API entirely from
`runtime/runtime.d.ts`. Shipping the migration `.md` (or inlining the JS-side
diff into the changelog) would have saved the detour.

## 3. Breaking API surface (the actual code changes)

For the record, what 0.90 changed that this repo touched:

- **`Quillmark` export renamed to `Engine`.** `new Quillmark()` → `new Engine()`.
- **Single root export.** The `./render` and `./core` subpath exports are gone;
  everything comes from `@quillmark/wasm`.
- **Rendering moved off `Quill` onto `Engine`, and became async.**
  `quill.render(doc, opts)` (sync) → `await engine.render(quill, doc, opts)`.
  Because `Quill` is now engine-free portable data, the engine has to be
  *threaded to wherever rendering happens*. In this repo that meant changing the
  public `DeliveryStrategy.handle(quill, doc)` signature to
  `handle(quill, doc, engine)` — a breaking change cascading to any custom
  strategy a downstream embedder wrote. That second-order break (a wasm change
  forcing a *our* public-interface change) is the most disruptive part for a
  library that advertises `DeliveryStrategy` as its extension point.
- **`quiver.getQuill(ref, { engine })` → `quiver.getQuill(ref)`** (quiver 0.15).
  The `engine` argument no longer exists. Our `getSpec`/`listQuills` primitives
  keep an `engine` positional param purely for call-site stability now — it's
  dead weight post-upgrade.

## 4. Engine constructor / capability probes (didn't bite, but worth flagging)

`new Engine()` with no args still works (bundled Typst backend is the default
registry entry), so the default path was unaffected. But `new Engine({ backends })`
now requires **descriptor form** `{ load, formats, canvas }` with `formats`/`canvas`
mandatory, and `supportedFormats`/`supportsCanvas` became **async**. Anyone who
constructed a custom engine or probed capabilities synchronously will break.

## 5. Typed-error contract is nice but undocumented as a migration win

0.90 adds `isQuillmarkError(e)` + a structural `QuillmarkError` interface. We
already hand-roll `.diagnostics` extraction (`extractDiagnostics`) and it still
works, so no change was forced — but the changelog says consumers "can delete
their hand-rolled `.diagnostics`-extraction casts," which isn't obviously true
for a plain-JS (non-TS) consumer like this one where the cast was runtime
defensive, not a type assertion. A one-line "JS consumers: no change needed"
note would clarify.

## 6. Environment noise (not a wasm issue, logged for completeness)

- `package.json` requires `node >=24`; the upgrade was validated on node 22
  (`EBADENGINE` warnings throughout). Tests pass on 22 regardless.
- `npm install` reports 2 pre-existing moderate-severity advisories, unrelated
  to this bump.

## Outcome

Upgraded `@quillmark/wasm` `^0.87.1` → `^0.90.0` and `@quillmark/quiver`
`^0.12.0` → `^0.15.0`. Full suite green (85/85), including the end-to-end
render of all 7 shipped quills to real PDFs through the new
`engine.render(quill, doc)` path.
