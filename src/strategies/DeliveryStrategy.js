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
   * Produce a deliverable document from a resolved quill and validated content.
   *
   * Subclasses must override this method. The base implementation always throws
   * to enforce the contract at runtime.
   *
   * @abstract
   * @param {object} quill - Resolved quill object containing name, version, data (TOML blob), and metadata.
   * @param {string} validatedContent - Quillmark content string (YAML frontmatter + markdown body) that has already passed schema validation.
   * @returns {Promise<object>} Result object with `status` (string), optional `url` (string),
   *   and optional `errors` (array of `{ message }` objects).
   *   On success: `{ status: 'success', url: '<artifact location>' }`.
   *   On failure: `{ status: 'error', errors: [{ message: '...' }] }`.
   * @throws {Error} Always throws in the base class — signals a missing override.
   */
  async handle(quill, validatedContent) {
    void quill;
    void validatedContent;
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
