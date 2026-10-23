import { defineConfig, mergeConfig } from 'vite'
import base from '../vite.config'

// Screenshot runs: no HMR / file watching, so editing code mid-run never reloads the page under the harness.
export default mergeConfig(base, defineConfig({
  server: { hmr: false, watch: { ignored: ['**/*'] } },
}))
