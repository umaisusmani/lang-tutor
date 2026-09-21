import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js's CSRF check compares a Server Action request's Origin
      // header against its Host header and rejects a mismatch. Vercel sits
      // in front of the actual server as a proxy, and can present a
      // different effective Host than the domain the browser thinks it's
      // on -- which is exactly the "proxy or CDN domains" case this option
      // exists for. Without this, sign-in/sign-up Server Actions can fail
      // silently on Vercel while working fine in local dev (no proxy layer
      // there to introduce the mismatch).
      allowedOrigins: ["language-chatbot-starchy.vercel.app", "*-starchy.vercel.app"],
    },
  },
};

export default nextConfig;
