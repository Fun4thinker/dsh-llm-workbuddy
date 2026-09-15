/**
 * 把本 fork 的修复同步进 DSH profile 里已安装的 workbuddy 包。
 *
 * ## 为什么用「同步」而不是 `link:`
 *
 * profile 里换成 `link:D:\my_project\dsh-llm-workbuddy` 需要跑一次
 * `pnpm install`，而那会一并重新解析 profile 的其他依赖（`dshmarket`、
 * `@linxin666/dsh-remote-web-ui` 等），有可能顺带升级它们。这个脚本只覆盖本包
 * 自己的文件，**不碰 lockfile、不碰别的包**，因此可以在有并行开发时安全使用。
 *
 * ## 本地维护模型
 *
 * 本仓库是 source of truth：修复在 `git` 历史里，测试用 `node --test test.js`。
 * npm 包升级会覆盖 profile 里的那份，**升级后重跑本脚本即可**重新同步。
 *
 * ```bash
 * node sync-to-dsh.mjs            # 同步
 * node sync-to-dsh.mjs --check    # 只看差异，不写
 * node sync-to-dsh.mjs --restore  # 从备份还原
 * ```
 *
 * @module sync-to-dsh
 */
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 本 fork 里构成修复的文件；其余文件与上游一致，无需同步。 */
const FILES = ['index.js', 'workbuddy-discovery.js', 'package.json', 'test.js']

/** 备份后缀。 */
const BACKUP = '.pre-fork-backup'

/**
 * 找一个装着 workbuddy 的 profile 目录。
 * @param {string} home - DSH_HOME。
 * @returns {string|undefined} 已安装包目录，找不到时为 undefined。
 */
function locateInstalled(home) {
  const candidates = ['web', 'desktop', 'headless'].map(profile =>
    join(home, 'profiles', profile, 'node_modules', '@axiaohungry', 'dsh-llm-workbuddy'))
  return candidates.find(candidate => existsSync(join(candidate, 'index.js')))
}

const args = process.argv.slice(2)
const home = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const target = locateInstalled(home)
if (target === undefined) {
  console.error(`找不到已安装的 @axiaohungry/dsh-llm-workbuddy（在 ${home}\\profiles\\*\\node_modules 下）。`)
  process.exit(1)
}

if (args.includes('--restore')) {
  let restored = 0
  for (const name of FILES) {
    const backup = join(target, `${name}${BACKUP}`)
    if (existsSync(backup)) { copyFileSync(backup, join(target, name)); restored += 1 }
  }
  console.log(restored === 0 ? '没有找到备份，无需还原。' : `已还原 ${restored} 个文件。`)
  process.exit(0)
}

// 只比对真正构成修复的两个文件；package.json 的 version 等字段在两份之间可能有
// 无意义的差异，因此不参与「是否已同步」的判断。
const SIGNATURE = ['index.js', 'workbuddy-discovery.js']
const differs = SIGNATURE.filter((name) => {
  const installed = join(target, name)
  return !existsSync(installed)
    || readFileSync(installed, 'utf8') !== readFileSync(join(HERE, name), 'utf8')
})

if (args.includes('--check')) {
  console.log(`包目录：${target}`)
  console.log(differs.length === 0 ? '状态：已同步（与 fork 一致）' : `状态：需要同步（${differs.join(', ')}）`)
  if (differs.length > 0 && existsSync(join(target, `${SIGNATURE[0]}${BACKUP}`))) {
    console.log('（已存在备份，重跑不会覆盖它）')
  }
  process.exit(0)
}

if (differs.length === 0) {
  console.log('已经是同步状态，无需处理。')
  process.exit(0)
}

for (const name of FILES) {
  const installed = join(target, name)
  // 备份只在第一次同步时留下，避免用「已同步后的内容」覆盖最初的上游原件。
  if (existsSync(installed) && !existsSync(`${installed}${BACKUP}`)) {
    copyFileSync(installed, `${installed}${BACKUP}`)
  }
  copyFileSync(join(HERE, name), installed)
}

// 早期用「运行时补丁」方式留下的残余若还在，一并删掉：那套做法往 index.js 里插
// 了一段 import 和替换，与本 fork 的实现重复，两份同时存在只会互相干扰。
// 它们的原始内容已在 `index.js.pre-fork-backup` 里，删掉不会丢失恢复路径。
for (const leftover of ['workbuddy-discovery-fallback.js', 'index.js.dsh-pixel-backup']) {
  const path = join(target, leftover)
  if (existsSync(path)) {
    rmSync(path, { force: true })
    console.log(`  清理运行时补丁残余：${leftover}`)
  }
}

console.log(`已同步到：${target}`)
console.log(`  覆盖：${FILES.join(', ')}`)
console.log(`  备份后缀：${BACKUP}`)
console.log('\n下一步：重启 dsh 让宿主重新加载这个包（宿主侧模块只在启动时加载）。')
