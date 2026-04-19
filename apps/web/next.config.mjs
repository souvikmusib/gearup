/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gearup/ui', '@gearup/types'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'jsonwebtoken'],
  },
};

export default nextConfig;
