/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança aplicados a todas as respostas.
// CSP alinhada com a app: Server Actions (self), imagens externas por URL
// (fotoUrl/logo), YouTube em iframe (vídeo de jogo), sem inline scripts de
// terceiros. 'unsafe-inline'/'unsafe-eval' em script-src são exigidos pelo
// runtime do Next em dev; mantidos por compatibilidade do App Router.
const cspProducao = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube.com https://youtube.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspProducao },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Os relatórios de analíticos (Dossier do Treinador) são gerados como HTML
  // imprimível no route handler `/api/pdf` (o browser converte em PDF via
  // "Guardar como PDF"), sem motor nativo/WASM — 100% compatível com o runtime
  // serverless da Vercel, logo sem necessidade de `serverExternalPackages`.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    // Lista restritiva de hosts permitidos (evita proxy de imagem aberto / SSRF).
    // O Mister aceita URLs de fotos inseridas pelos utilizadores (fotoUrl/logo),
    // por isso mantemos os hosts públicos comuns + o Supabase Storage do deploy.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
