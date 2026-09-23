import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
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
