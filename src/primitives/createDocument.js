import { Document } from '@quillmark/wasm';

function extractDiagnostics(error) {
  const diagnostics = /** @type {any} */ (error)?.diagnostics;
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function availableQuillsHint(quiver) {
  try {
    const names = typeof quiver?.quillNames === 'function' ? quiver.quillNames() : [];
    if (!Array.isArray(names) || names.length === 0) return '';
    return ` Available quills: ${names.join(', ')}. Drop the @version suffix to bind to the latest available version.`;
  } catch {
    return '';
  }
}

export async function createDocument(quiver, engine, strategy, content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, message: 'Content must be a non-empty string.' };
  }

  let doc;
  try {
    doc = Document.fromMarkdown(content);
  } catch (error) {
    return {
      ok: false,
      message: `Document parse failed: ${error?.message ?? String(error)}`,
      diagnostics: extractDiagnostics(error),
    };
  }

  const quillRef = doc.quillRef;
  if (typeof quillRef !== 'string' || quillRef.trim() === '') {
    return {
      ok: false,
      message: "The document's root card-yaml block must declare `$quill: <name>`.",
    };
  }

  let quill;
  try {
    quill = await quiver.getQuill(quillRef, { engine });
  } catch (error) {
    return {
      ok: false,
      message: `Unable to resolve Quill format reference "${quillRef}": ${error?.message ?? String(error)}.${availableQuillsHint(quiver)}`,
    };
  }

  try {
    const { url, mimeType } = await strategy.handle(quill, doc);
    return { ok: true, url, mimeType };
  } catch (error) {
    return {
      ok: false,
      message: `Document rendering failed: ${error?.message ?? String(error)}`,
      diagnostics: extractDiagnostics(error),
    };
  }
}
