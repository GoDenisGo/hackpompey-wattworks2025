import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// FIND YOUR TOKEN TO PUT HERE ON THIS SITE: https://nerda.ssen.co.uk/nerda
// (You DO need to log in! and it's the short term key)
const headers = {
	"Authorization": "Bearer <token>"
}

// https://vite.dev/config/
export default defineConfig({
	server: {
		proxy: {
			"/api": {
				target: 'https://nerda.hackathons.dev',
				changeOrigin: true,
				// keep the /api prefix when forwarding so requests like /api/ApiNerdaStatic
				// are sent to https://nerda.hackathons.dev/api/...
				rewrite: (path) => path.replace(/^\/api/, '/api'),
				headers,
			}
		}
	},
	plugins: [
		react({
			babel: {
				plugins: [['babel-plugin-react-compiler']],
			},
		}),
	],
})
