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
      //
      // This project's single deployment answers to THREE aliases (confirmed
      // via `vercel alias ls`) -- Vercel assigns a random adjective-style one
      // (-red) alongside the project-name one (-starchy), and both are live
      // simultaneously, not a rename. All three need to be listed; missing
      // any one leaves that specific URL's sign-in silently broken while the
      // others work, which is exactly the confusing state this was in.
      allowedOrigins: [
        "language-chatbot-starchy.vercel.app",
        "language-chatbot-red.vercel.app",
        "language-chatbot-git-main-starchy.vercel.app",
        "*-starchy.vercel.app",
      ],
    },
  },
};

export default nextConfig;
