import mammoth from 'mammoth/mammoth.browser';

export async function extractDocx(bytes: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: bytes });
  if (result.value.length > 200_000) throw new Error('Text limit exceeded');
  return result.value;
}
