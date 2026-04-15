import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'googleapis',
    'google-auth-library',
    'node-ical',
    'nodemailer',
  ],
};

export default nextConfig;
