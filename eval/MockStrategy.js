/**
 * Mock delivery strategy for eval: accepts valid Quillmark content and returns
 * a fake URL without invoking the Typst renderer or file server.
 */
export class MockStrategy {
  async handle(_quill, doc) {
    return {
      status: 'success',
      url: `https://eval.quillmark.dev/mock/${doc.quillRef}-${Date.now()}.pdf`,
    };
  }
}
