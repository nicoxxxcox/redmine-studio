import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRedmineProxy } from './server/proxy.mjs'

const proxy = createRedmineProxy()

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'redmine-dev-proxy',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/redmine')) return proxy(req, res, next)
          next()
        })
      },
    },
  ],
  server: {
    port: 5173,
  },
})
