/**
 * @module index
 * Public API surface of the quillmark-mcp package.
 *
 * Re-exports the two primary entry points consumers need:
 * - {@link createDefaultMCP} — factory that wires up a fully-configured MCP server instance.
 * - {@link DeliveryStrategy} — abstract base class for artifact delivery strategies.
 */

/**
 * Factory function that creates a configured MCP server with quill discovery,
 * tool registration, and transport setup.
 *
 * @see module:mcp/index.createDefaultMCP
 */
export { createDefaultMCP } from './mcp/index.js';

/**
 * Abstract base class defining the delivery contract (render + deliver)
 * that concrete strategies (e.g. RenderAndHostStrategy) must implement.
 *
 * @see module:strategies/index.DeliveryStrategy
 */
export { DeliveryStrategy } from './strategies/index.js';
