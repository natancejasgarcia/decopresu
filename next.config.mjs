/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/sales/*/pdf": ["./public/decoralia-logo.png"],
    },
  },
};

export default nextConfig;
