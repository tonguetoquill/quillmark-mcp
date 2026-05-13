export class DeliveryStrategy {
  async handle(quill, doc) {
    void quill;
    void doc;
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
