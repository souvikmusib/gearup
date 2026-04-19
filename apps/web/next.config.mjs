/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gearup/ui', '@gearup/types'],
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'jsonwebtoken'],
};

export default nextConfig;
