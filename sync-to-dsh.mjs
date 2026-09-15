/**
 * 把本 fork 的修复同步进 DSH profile 里已安装的 workbuddy 包。
 *
 * ## 为什么必须「先删后拷」
 *
 * pnpm 用**硬链接**从内容寻址存储铺文件到 `node_modules`。也就是说
 * `profiles/web/node_modules/@axiaohungry/dsh-llm-workbuddy/index.js` 与
 * pnpm store 里的 blob、以及**其他 profile**（如 `desktop`）的同名文件
 * **共享同一个 inode**。
 *
 * 直接 `copyFileSync` 是**原地覆写**：它会顺着硬链接改掉那个共享 inode，后果是
 *
 *   1. pnpm store 的 blob 内容不再等于它的内容哈希（存储被污染，
 *      影响这台机器上**所有**使用该版本的安装）；
 *   2. 其他 profile 的副本被一并改掉，而它们**没有** `workbuddy-discovery.js`，
 *      于是那些 profile 直接坏掉。
 *
 * 因此这里先 `rmSync` 再 `copyFileSync`：删除会断开本目录的链接，复制落在新的
 * inode 上，store 与其他 profile 都不受影响。
 *
 * ## 为什么用同步而不是 `link:`
 *
 * 把 profile 依赖改成 `link:D:\my_project\dsh-llm-workbuddy` 需要跑一次
 * `pnpm install`，而那会一并重新解析 profile 的其他依赖（`dshmarket`、
 * `@linxin666/dsh-remote-web-ui` 等），可能顺带升级它们。这个脚本只动本包自己的
 * 文件，**不碰 lockfile、不碰别的包**。
 *
 * ## 本地维护模型
 *
 * 本仓库是 source of truth：修复在 git 历史里，测试用 `node --test test.js`。
 * npm 包升级会覆盖 profile 里那份，**升级后重跑本脚本即可**重新同步。
 *
 * ```bash
 * node sync-to-dsh.mjs            # 同步
 * node sync-to-dsh.mjs --check    # 只看差异，不写
 * node sync-to-dsh.mjs --restore  # 还原（移除新增模块并恢复备份）
 * ```
 *
 * @module sync-to-dsh
 */
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * 运行时真正需要的文件。刻意只同步这两个：`package.json` 的差异（`files` 数组、
 * `check` 脚本）只影响 `npm pack`，运行时用不到；少动一个共享 inode 就少一份风险。
 */
const FILES = ['index.js', 'workbuddy-discovery.js']

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

/**
 * 用「先删后拷」写入一个文件，确保不写穿硬链接。
 * @param {string} source - fork 里的源文件。
 * @param {string} target - 目标路径。
 */
function replaceFile(source, target) {
  if (existsSync(target)) rmSync(target, { force: true })
  copyFileSync(source, target)
}

const args = process.argv.slice(2)
const home = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const target = locateInstalled(home)
if (target === undefined) {
  console.error(`找不到已安装的 @axiaohungry/dsh-llm-workbuddy（在 ${home}\\profiles\\*\\node_modules 下）。`)
  process.exit(1)
}

if (args.includes('--restore')) {
  const installedIndex = join(target, 'index.js')
  const backup = `${installedIndex}${BACKUP}`
  if (existsSync(backup)) replaceFile(backup, installedIndex)
  // The added module exists only because of this fork; removing it restores the
  // published package's file set exactly.
  rmSync(join(target, 'workbuddy-discovery.js'), { force: true })
  const leftover = join(target, 'workbuddy-discovery-fallback.js')
  if (existsSync(leftover)) rmSync(leftover, { force: true })
  console.log(`已还原：${target}`)
  process.exit(0)
}

const differs = FILES.filter((name) => {
  const installed = join(target, name)
  return !existsSync(installed)
    || readFileSync(installed, 'utf8') !== readFileSync(join(HERE, name), 'utf8')
})

if (args.includes('--check')) {
  console.log(`包目录：${target}`)
  console.log(differs.length === 0 ? '状态：已同步（与 fork 一致）' : `状态：需要同步（${differs.join(', ')}）`)
  process.exit(0)
}

if (differs.length === 0) {
  console.log('已经是同步状态，无需处理。')
  process.exit(0)
}

for (const name of FILES) {
  const installed = join(target, name)
  // 备份只在第一次同步时留下，且对 index.js 用「先删后拷」，避免把它也写穿。
  const backup = `${installed}${BACKUP}`
  if (name === 'index.js' && existsSync(installed) && !existsSync(backup)) {
    copyFileSync(installed, backup)
  }
  replaceFile(join(HERE, name), installed)
}

// 早期用「运行时补丁」方式留下的残余若还在，一并删掉：那套做法往 index.js 里插了
// 一段 import 和替换，与本 fork 的实现重复，两份同时存在只会互相干扰。
for (const leftover of ['workbuddy-discovery-fallback.js', 'index.js.dsh-pixel-backup']) {
  const path = join(target, leftover)
  if (existsSync(path)) {
    rmSync(path, { force: true })
    console.log(`  清理运行时补丁残余：${leftover}`)
  }
}

console.log(`已同步到：${target}`)
console.log(`  覆盖：${FILES.join(', ')}（先删后拷，不写穿 pnpm 硬链接）`)
console.log(`  备份：index.js${BACKUP}`)
console.log('\n下一步：重启 dsh 让宿主重新加载这个包（宿主侧模块只在启动时加载）。')
