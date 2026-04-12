# Quillmark MCP

> A client-agnostic Model Context Protocol server that renders schematized documents (PDF/SVG/TXT) from YAML frontmatter + Markdown via a WASM engine.

## Quick Links

- [[Architecture Overview]]
- [[Getting Started]]
- [[CLI Reference]]
- [[MCP Tools]]
- [[API Reference]]

## What is this?

Quillmark is an MCP server that turns structured Markdown documents into rendered output (PDF, SVG, plain text) without requiring a native toolchain. You define document schemas and content using YAML frontmatter plus Markdown, then Quillmark processes them through a WASM-based rendering engine. The server exposes its capabilities over the Model Context Protocol, so any MCP-compatible client (Claude Desktop, Claude Code, custom agents) can generate documents programmatically. It ships as a Docker image and an npm package for maximum deployment flexibility.

## Quick Start

```bash
git clone https://github.com/nibsbin/quillmark-mcp.git
cd quillmark-mcp
npm install
npm test
docker compose up -d
```

## Status

See [docs/STATUS.md](../STATUS.md) for the client validation matrix covering Claude Desktop, Claude Code, and other MCP clients.

## API Reference

API Reference is auto-generated from JSDoc annotations on every push to main.
