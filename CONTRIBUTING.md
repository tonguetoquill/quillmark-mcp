# Contributing

## Setup

```sh
git clone https://github.com/nibsbin/quillmark-mcp.git
cd quillmark-mcp
npm install
```

Node.js >= 24 required.

## Tests

```sh
npm test
```

Uses the built-in `node:test` runner. Tests live in `test/` mirroring the `src/` structure.

## Structure

```
src/
  primitives/   # listQuills, getSpecs, createDocument — pure functions
  strategies/   # DeliveryStrategy, PassThroughStrategy, RenderAndHostStrategy
  mcp/          # QuillmarkMCP — wires primitives + fastmcp
test/
  fixtures/     # sample quills for integration tests
```

## Guidelines

- Keep primitives pure — no internal state, dependencies passed as arguments.
- The MCP layer is sugar over primitives, not a separate abstraction.
- Write tests where they provide clear value; don't over-invest in infrastructure.
- Delivery strategy is the only consumer-facing extension point — keep other internals closed.

## Submitting changes

Open a pull request against `main`. Include a brief description of what changed and why.
