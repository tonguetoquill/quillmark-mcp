/**
 * @module strategies/DeliveryStrategy
 * Defines the strategy pattern contract for document delivery.
 * All delivery mechanisms (render-to-file, upload-to-S3, etc.) extend this base class.
 */

/**
 * Abstract base class for document delivery strategies.
 *
 * Implements the Strategy pattern: the MCP server delegates final document
 * production to whatever DeliveryStrategy is injected at construction time.
 * Subclasses MUST override {@link DeliveryStrategy#handle} — calling the
 * base implementation throws.
 *
 * @abstract
 */
export class DeliveryStrategy {
  /**
   * Produce a deliverable artifact from a materialised Quill handle and a
   * parsed Document.
   *
   * Subclasses must override this method. The base implementation always
   * throws to enforce the contract at runtime.
   *
   * @abstract
   * @param {object} quill - Materialised `Quill` handle from `@quillmark/quiver`'s `getQuill`.
   *   Carries `metadata` and `render(doc, opts?)`.
   * @param {object} doc - Parsed `Document` from `@quillmark/wasm`'s `Document.fromMarkdown`.
   *   Carries `quillRef`, `frontmatter`, `body`, and the typed card model.
   * @returns {Promise<object>} Result object:
   *   - On success: `{ status: 'success', url: '<artifact location>' }`.
   *   - On failure: `{ status: 'error', errors: [{ message: '...' }] }`.
   * @throws {Error} Always throws in the base class — signals a missing override.
   */
  async handle(quill, doc) {
    void quill;
    void doc;
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
