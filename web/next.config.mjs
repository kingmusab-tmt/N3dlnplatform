/** @type {import('next').NextConfig} */
const nextConfig = {
  // /api/v1/* is proxied to the Express API by app/api/v1/[...path]/route.ts,
  // which attaches the server-only API key.
};

export default nextConfig;
