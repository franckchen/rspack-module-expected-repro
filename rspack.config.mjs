import * as rspack from '@rspack/core'

// 模拟内容重写型插件的用法：在 finishModules 里对入口模块调用 rebuildModule，
// 让重写后的模块内容进入本次产物（rebuildModule 的官方文档场景）。
class RebuildEntryInFinishModulesPlugin {
  name = 'RebuildEntryInFinishModulesPlugin'

  apply(compiler) {
    compiler.hooks.compilation.tap(this.name, (compilation) => {
      compilation.hooks.finishModules.tapPromise(this.name, async (modules) => {
        let entryModule = null
        for (const m of modules) {
          if (m.resource && m.resource.endsWith('src/index.js')) {
            entryModule = m
            break
          }
        }
        if (entryModule === null) return
        await new Promise((resolve) => {
          compilation.rebuildModule(entryModule, () => resolve())
        })
      })
    })
  }
}

export default {
  // 默认 development；复现对照用 MODE=production。
  mode: process.env.MODE === 'production' ? 'production' : 'development',
  context: process.cwd(),
  entry: './src/index.js',
  output: {
    filename: 'index.js',
    path: new URL('./dist/', import.meta.url).pathname,
    module: false,
    iife: true,
  },
  devtool: 'source-map',
  plugins: [new RebuildEntryInFinishModulesPlugin()],
  stats: 'errors-warnings',
}
