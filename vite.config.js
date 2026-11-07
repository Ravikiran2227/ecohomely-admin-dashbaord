import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveEnv } from './config/resolveEnv.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `APP_ENV` is read here, in Node, because Vite only inlines `import.meta.env.VITE_*`
  // into the bundle. The resolved block is stamped in through `define`, which is what
  // `src/config/env.js` reads. Unset means production.
  //
  // `loadEnv` with an empty prefix reads `.env`, `.env.local` and `.env.[mode]`, then
  // lets a real shell variable override them — so `APP_ENV=dev npm run dev` wins over a
  // stale `.env`. Nothing from this object reaches the bundle; only `APP_ENV` is read.
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const { name, config } = resolveEnv({ appEnv: fileEnv.APP_ENV, mode })

  return {
    plugins: [react()],
    define: {
      __APP_ENV__: JSON.stringify(name),
      __APP_ENV_CONFIG__: JSON.stringify(config),
    },
  }
})
