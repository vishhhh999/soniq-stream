/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["postgres", "music-metadata"] },
  // Defense in depth: block this app being framed by anyone (clickjacking
  // protection) everywhere EXCEPT the one route that exists specifically
  // to be embedded in an iframe on someone else's site. The embed route
  // still enforces its own permission check independently (it reads
  // shareLinks.active via the same API the /s/ page uses) — this header
  // just stops every OTHER page (login, settings, the real library) from
  // being framable at all, which nothing before this needed since no
  // route was ever meant to be embedded until now.
  async headers() {
    return [
      {
        source: "/((?!embed).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};
module.exports = nextConfig;
