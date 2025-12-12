import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Get git commit hash
const getGitCommitSha = () => {
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch (e) {
    return 'unknown'
  }
}

// Get automatic version from git commit count
const getAppVersion = () => {
  try {
    // Read major.minor from config
    const versionConfigPath = resolve(__dirname, '../.version-config.json')
    console.log('📦 Reading version config from:', versionConfigPath)
    const versionConfig = JSON.parse(readFileSync(versionConfigPath, 'utf-8'))
    console.log('📦 Version config:', versionConfig)

    // Get commit count as patch/build number
    const commitCount = execSync('git rev-list --count HEAD').toString().trim()
    console.log('📦 Commit count:', commitCount)

    const version = `${versionConfig.major}.${versionConfig.minor}.${commitCount}`
    console.log('✅ Generated version:', version)
    return version
  } catch (e) {
    console.error('❌ Error generating version:', e)
    return '1.0.0'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(getGitCommitSha()),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(getAppVersion())
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 5173, // local default, overridden by $PORT on Railway
    // ✅ Allow Railway domains + localhost for local testing
    allowedHosts: [
      // TODO: Add your Railway production domain here (e.g., "your-app.up.railway.app")
      "localhost",
      "127.0.0.1"
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
