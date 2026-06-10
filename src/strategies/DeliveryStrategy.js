export class DeliveryStrategy {
  async handle(quill, doc, engine) {
    void quill;
    void doc;
    void engine;
    throw new Error('DeliveryStrategy.handle() must be implemented by subclass');
  }
}
