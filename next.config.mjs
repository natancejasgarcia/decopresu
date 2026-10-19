/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    outputFileTracingIncludes: {
      "/sales/*/pdf": ["./public/decoralia-logo.png"],
      "/projects": ["./public/decoralia-logo.png"],
      "/projects/*/budget/pdf": ["./public/decoralia-logo.png"],
    },
  },
};

export default nextConfig;
