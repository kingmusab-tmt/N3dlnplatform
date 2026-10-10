/** @type {import('next').NextConfig} */
const nextConfig = {
  // The spec is read from disk at runtime; make sure it ships with the function.
  outputFileTracingIncludes: {
    '/api/v1/openapi.yaml': ['./openapi.yaml'],
  },
};

export default nextConfig;
