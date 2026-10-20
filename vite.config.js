// vite.config.js
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// @pixi/tilemap 3.2.2 registers its renderer plugin with
// Renderer.registerPlugin(), deprecated since PixiJS 6.5 - which prints a
// deprecation warning in every player's console on load. That call is only
// a wrapper around extensions.add() (@pixi/core), so make the same call
// directly. A build-time rewrite rather than a yarn patch: a new patch needs
// yarn to regenerate the lockfile, and deploy installs with --immutable.
// Dev pre-bundles dependencies with esbuild, which skips transform hooks, so
// `yarn start` still shows the warning; builds do not.
const TILEMAP_REGISTER = "Renderer.registerPlugin('tilemap', TileRenderer );";

const pixiTilemapExtensions = () => ({
    name: 'pixelrp-pixi-tilemap-extensions',
    transform(code, id)
    {
        if(!id.includes('@pixi/tilemap/') || !code.includes('registerPlugin')) return null;

        if(!code.includes(TILEMAP_REGISTER))
        {
            this.warn('@pixi/tilemap changed - its registerPlugin call was not rewritten, so the deprecation warning is back');

            return null;
        }

        return {
            code: "import { extensions as __pixelrpExtensions, ExtensionType as __pixelrpExtensionType } from '@pixi/extensions';\n"
                + code.replace(TILEMAP_REGISTER, "__pixelrpExtensions.add({ name: 'tilemap', type: __pixelrpExtensionType.RendererPlugin, ref: TileRenderer });"),
            map: null
        };
    }
});

export default defineConfig(({ command }) => ({
    // The deployed client is served from /nitro-assets/client/, not the site
    // root — without this, built asset URLs 404 behind the nginx prefix. The
    // dev server keeps base '/' so `yarn start` still serves at the root.
    base: (command === 'build') ? '/nitro-assets/client/' : '/',
    // Dev serves assets and the CMS API same-origin via the docker web
    // container - public/renderer-config.json uses relative URLs, so asset
    // requests never leave :5173 and CORS/stale-cache issues can't bite.
    // The web container only serves game files to a holder of the asset pass
    // (parent repo docs/asset-protection-plan.md): open localhost:8080/game
    // once to get it. Cookies ignore the port, so :5173's proxied requests
    // carry it too.
    server: {
        proxy: {
            '/nitro-assets': 'http://localhost:8080',
            '/api': 'http://localhost:8080'
        }
    },
    plugins: [ react(), pixiTilemapExtensions() ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '~': resolve(__dirname, 'node_modules')
        }
    },
    build: {
        // Vite's default (4 KB). It was 100 KB, which base64-packed every
        // stylesheet image and font into the one CSS file: 3.26 MB (~1 MB
        // compressed), 2.45 MB of it images - all 126 chat bubbles included -
        // re-downloaded by every player after every deploy, since any change
        // renames the CSS. Emitted files are content-hashed (below), so an
        // unchanged image keeps its URL across deploys and stays cached, and a
        // bubble or icon is only fetched once something on screen uses it.
        // Fonts are separate files too; fonts.scss sets font-display: swap.
        assetsInlineLimit: 4096,
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
