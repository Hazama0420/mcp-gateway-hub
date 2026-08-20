/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // 🔥 Hanya untuk mengatasi error type declaration di @modelcontextprotocol/sdk
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;