// GET /api/v1/openapi.yaml — raw spec for Postman, Insomnia or client generators.
import { readOpenApiSpec } from '@/lib/server/openapi';

export async function GET() {
  return new Response(await readOpenApiSpec(), {
    headers: { 'Content-Type': 'application/yaml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
