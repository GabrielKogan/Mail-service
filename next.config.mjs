/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['nodemailer'],
  experimental: {
    serverComponentsExternalPackages: ['nodemailer'],
  },
};

export default nextConfig;
