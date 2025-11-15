import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// FIND YOUR TOKEN TO PUT HERE ON THIS SITE: https://nerda.ssen.co.uk/nerda
// (You DO need to log in! and it's the short term key)
const headers = {
	"Authorization": "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IlVlY2ZvXzRHQktVbVktaDQxa2IwdjRlQl9ndk5ndkw1UnYtMnFzQVlCMW8iLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJiMmU3ODYzMS1kZjU2LTQ3YTgtODNjYS1kODhiMmEyOWJlZmYiLCJpc3MiOiJodHRwczovL2xvZ2luLnNzZW4uY28udWsvODVjYzk0YzEtMzY3Yy00ZmU1LWE5ZjgtNTExYmM1YTQ3MjFlL3YyLjAvIiwiZXhwIjoxNzYzMjIyNzMyLCJuYmYiOjE3NjMyMTkxMzIsInNpZ25Jbk5hbWUiOiJoYWNrcG9tcGV5QGtsc2hhdy5kZXYiLCJzdWIiOiIxODkyNzUwNy0xZjg1LTRiYWEtOWIzYy00NTgwYmRhZTA3N2UiLCJyZWdpc3RlclN1Y2Nlc3MiOnRydWUsImdpdmVuX25hbWUiOiJLaWVyYW4iLCJmYW1pbHlfbmFtZSI6IlNoYXciLCJleHRlbnNpb25fcmVxdWlyZXNSZWNvbmNpbGlhdGlvbiI6dHJ1ZSwibmFtZSI6InVua25vd24iLCJ0aWQiOiI4NWNjOTRjMS0zNjdjLTRmZTUtYTlmOC01MTFiYzVhNDcyMWUiLCJub25jZSI6IjAxOWE4NzJlLTY1Y2ItNzcwNi04YzMyLWU3ZmNhYmExMTM2ZCIsInNjcCI6Im5lcmRhLnJlYWQiLCJhenAiOiJiMmU3ODYzMS1kZjU2LTQ3YTgtODNjYS1kODhiMmEyOWJlZmYiLCJ2ZXIiOiIxLjAiLCJpYXQiOjE3NjMyMTkxMzJ9.djIEX_vnp-aixWLk1NHPi292UNNq2eVKF1GDHfESl4NXuDjiUVx0Am0bGv7JXIqpOD-JtAIwuM9ccuE2LkW5buDqbT3O9bU_celWsbhG1J-x4oVjyaGjuzD2vOJ0A4WjUGbJWnN0PI_YhmLg6-h2QUquFi_GGaKGaI5ZshQGRWxcqDev0MZokvZcFLCXjFjuyrKN6qlfsxGp9h8eF0pgR3yEYatdvTwCABAfbBHbgEtJzq1ssbxQg7JWmDr72qnbx4TL6i5exWPzfMpzfg1aSZ3wk38rDmt1ET7sGxKUApfpDfZ2xs0U9681I6OYC0tEunLeTWlSbxLAhgamtHq52Q"
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
