import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  $production: {
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': [
            "default-src 'self'",
            // 'unsafe-inline' is needed for Nuxt's inline config script and the theme bootstrap script
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            // ipc: / http://ipc.localhost let the Tauri desktop shell use its IPC channel; they don't exist in browsers
            "connect-src 'self' ipc: http://ipc.localhost",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            'upgrade-insecure-requests',
          ].join('; '),
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        },
      },
    },
  },
  modules: ['shadcn-nuxt', '@pinia/nuxt', 'nuxt-auth-utils'],
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  shadcn: { prefix: '', componentDir: '~/components/ui' },
  nitro: { experimental: { asyncContext: true } },
  runtimeConfig: {
    encryptionKey: '', // NUXT_ENCRYPTION_KEY
    session: {
      maxAge: 60 * 60 * 24 * 30,
      password: '', // NUXT_SESSION_PASSWORD
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Scout',
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [{ name: 'apple-mobile-web-app-title', content: 'Scout' }],
      script: [
        {
          innerHTML: "(function(){try{var m=localStorage.getItem('vueuse-color-scheme')||'auto';var d=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()",
          tagPosition: 'head',
        },
      ],
    },
  },
})
