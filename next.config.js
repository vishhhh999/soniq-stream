/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["postgres", "music-metadata"] },
};
module.exports = nextConfig;
