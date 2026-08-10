// vite.config.js
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
    // The deployed client is served from /nitro-assets/client/, not the site
    // root — without this, built asset URLs 404 behind the nginx prefix. The
    // dev server keeps base '/' so `yarn start` still serves at the root.
    base: (command === 'build') ? '/nitro-assets/client/' : '/',
    // Dev serves assets and the CMS API same-origin via the docker web
    // container - public/renderer-config.json uses relative URLs, so asset
    // requests never leave :5173 and CORS/stale-cache issues can't bite.
    server: {
        proxy: {
            '/nitro-assets': 'http://localhost:8080',
            '/api': 'http://localhost:8080'
        }
    },
    plugins: [ react() ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '~': resolve(__dirname, 'node_modules')
        }
    },
    build: {
        assetsInlineLimit: 102400,
        rollupOptions: {
            output: {
                // Content-hash bundled assets (CSS, fonts, images) so a changed
                // file gets a new URL. nginx serves /nitro-assets/ with
                // max-age=604800, and the login SSO query busts index.html each
                // load - but a stable asset name (the old '[name].[ext]') left the
                // CSS cached for a week, so CSS-only changes never reached players.
                // The hash makes them cache-bust exactly like the already-hashed JS.
                assetFileNames: 'src/assets/[name]-[hash].[ext]',
                manualChunks: id =>
                {
                    if(id.includes('node_modules'))
                    {
                        if(id.includes('@nitrots/nitro-renderer')) return 'nitro-renderer';

                        return 'vendor';
                    }
                }
            }
        }
    }
}))
