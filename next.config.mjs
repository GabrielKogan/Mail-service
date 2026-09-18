/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['nodemailer'],
  experimental: {
    serverComponentsExternalPackages: ['nodemailer'],
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
