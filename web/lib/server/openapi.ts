import { readFile } from 'node:fs/promises';
import path from 'node:path';

// web/openapi.yaml; next.config.mjs includes it in the serverless bundle.
export const OPENAPI_PATH = path.join(process.cwd(), 'openapi.yaml');

let cached: string | null = null;

export async function readOpenApiSpec() {
  cached ??= await readFile(OPENAPI_PATH, 'utf8');
  return cached;
}
