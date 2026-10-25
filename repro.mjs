// 一键复现：启动 watch → 修改源码触发增量重建 → 观察是否 Rust panic。
// panic 会直接 abort 进程（退出码 134/Abort），脚本无法捕获，因此以
// 「存活满观察期」判定未复现。
import { readFile, writeFile } from 'node:fs/promises'
import { rspack } from '@rspack/core'
import config from './rspack.config.mjs'

const mode = process.env.MODE === 'production' ? 'production' : 'development'
console.log(`[repro] mode = ${mode}`)

const depPath = new URL('./src/dep.js', import.meta.url).pathname
const original = await readFile(depPath, 'utf8')

const compiler = rspack(config)
compiler.hooks.done.tap('repro', (stats) => {
  const info = stats.toJson({ errors: true, warnings: true })
  console.log(`[repro] build done, errors: ${info.errors.length}`)
})

await new Promise((resolve, reject) => {
  compiler.watch({}, (err) => (err ? reject(err) : resolve()))
})
console.log('[repro] watching started')

// 触发增量重建：改写 dep.js（真实插件的 watch 场景里这是任意源码修改）。
await new Promise((resolve) => setTimeout(resolve, 1500))
await writeFile(depPath, original.replace('initial', 'changed'))
console.log('[repro] touched src/dep.js — waiting for incremental rebuild')

// 观察期 6 秒：panic 发生时进程会在此期间 abort。
await new Promise((resolve) => setTimeout(resolve, 6000))

// 走到这里说明没有 panic。
await writeFile(depPath, original)
console.log('[repro] survived the observation window — no panic')
await new Promise((resolve) => compiler.close(() => resolve()))
process.exit(0)
