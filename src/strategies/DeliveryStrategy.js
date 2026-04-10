/**
 * Abstract delivery strategy.
 * Concrete strategies must implement handle().
 */
export class DeliveryStrategy {
  /**
   * @param {object} quill - Resolved quill object
   * @param {string} validatedContent - Content that has passed validation
   * @returns {Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }>}
   */
  async handle(quill, validatedContent) {
    void quill;
    void validatedContent;
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
