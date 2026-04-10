import { DeliveryStrategy } from './DeliveryStrategy.js';

export class PassThroughStrategy extends DeliveryStrategy {
  /**
   * @param {(quill: object, validatedContent: string) => Promise<{ status: string, url?: string, errors?: Array<{ message: string }> }> | { status: string, url?: string, errors?: Array<{ message: string }> }} handler
   */
  constructor(handler) {
    super();

    if (typeof handler !== 'function') {
      throw new TypeError('PassThroughStrategy requires a handler function.');
    }

    this.handler = handler;
  }

  async handle(quill, validatedContent) {
    return this.handler(quill, validatedContent);
  }
}
