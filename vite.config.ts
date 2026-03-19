import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'configure-response-headers',
			configureServer: (server) => {
				server.middlewares.use((req, res, next) => {
					// Required for WebAssembly Multithreading
					res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
					res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
					
					// Fix for Vite sometimes serving workers without the correct JS MIME type
					if (req.url.includes('worker_file')) {
						res.setHeader('Content-Type', 'application/javascript');
					}
					next();
				});
			}
		}
	],
	optimizeDeps: {
		// Stop Vite from breaking the WebAssembly internal paths!
		exclude: ['@thenick775/mgba-wasm']
	},
	server: {
		fs: {
			// Allows SvelteKit to read the raw files from node_modules
			allow: ['..']
		}
	}
});