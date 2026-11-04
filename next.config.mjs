/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // M22: the OCR provider flag is read by the scanner UI too, so it is inlined at build (default off).
  env: { OCR_OPENAI_ENABLED: process.env.OCR_OPENAI_ENABLED ?? "false" },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
