# 本仓库是什么

`@axiaohungry/dsh-llm-workbuddy` 的**本地维护副本**，用于修复一个上游尚未处理的问题。

- 上游：<https://github.com/Axiaohungry/dsh-llm-workbuddy>（fork 自 `349a04d`）
- 分支：`fix/generic-provider-model-discovery`
- 原有的插件说明见 [`README.md`](README.md)（上游原文，未改动）

> **为什么单独放一个仓库。** 这个修复与 UI 插件 `dsh-pixel-dashboard` 毫无关系——
> 后者只做主题皮肤与用量看板。把第三方 LLM 插件的补丁塞进 UI 插件会让两个仓库的
> 职责互相污染，也让 UI 插件被迫携带一个它不负责的运行时改动。因此修复独立在这里维护。

## 修的是什么

装了本插件后，任何**手写声明**的 pi-ai 路由（火山方舟、Command Code 这类通用网关）
在「设置 → 模型 → 获取可用模型」上都会失败：

```
没有 Provider "zijie" 的模型目录
```

「添加自定义提供方」卡片（还没有 Provider ID）则是 `没有 Provider "" 的模型目录`。

### 根因

插件内部对通用路由的处理是**自相矛盾**的：

- `genericProvider()` 接受 `openai-completions` / `openai-responses` /
  `anthropic-messages`，并为完整配置的路由构造 pi-ai `Provider`；
- `ownsProvider()` 据此把它注册为适配器路由，**模型调用因此本来就能用**；
- `directoryEntries()` 以 `declared: true` 把它列进「模型」页面，**因此它可配置**。

但 `registerModelDiscovery()` 的处理器只有两个分支——WorkBuddy 自有路由、以及
`@earendil-works/pi-ai` 内置 Provider。手写路由两边都不沾，于是必然落到那句 throw 上。

DSH 内置的 `llm-pi-ai` 插件本来会为这类路由询问端点，但本插件的
`cordis.patch.yml` 第一件事就是把它 `disabled: true`，而 `LlmRuntime` 的探测注册表
**以 settings 命名空间为键、只允许一个注册者**（冲突时报 `DUPLICATE_DISCOVERY`）。
因此内置那套可用能力被一并关掉，却没有等价实现补上。

### 修复

新增 `workbuddy-discovery.js`，按 DSH 内置探测相同的规则询问端点，并在处理器
未知分支上委托给它（`index.js` 仅此一处改动）：

```js
const provider = builtins.get(request.provider);
if (!provider) return probeEndpoint(request, { profiles, resolveCredential });
```

对齐的规则：列表 URL（OpenAI 系 `GET {baseURL}/models`；Anthropic 原生
`GET /v1/models?limit=1000`）、base 按前缀拼接以保留部署路径、认证头、响应格式
（`data` 数组或富信息 `models` 对象）、容量字段拼写、4 MiB 上限、凭据优先级。

**WorkBuddy 自有路径完全不受影响**：它的分支在探测函数最前且提前 `return`，
执行不到新代码，模型调用也从不经过这条路径。实测覆盖 API Key 模式、已存登录令牌
模式，以及凭据缺失时的失败文本。

## 装到本机

**当前采用 `link:` 方式**：profile 的依赖直接指向本仓库，pnpm 不再覆盖修复。

```jsonc
// ~/.dsh/profiles/web/package.json
"@axiaohungry/dsh-llm-workbuddy": "link:D://my_project//dsh-llm-workbuddy",
```

改完跑一次 `pnpm install` 即可（之后会显示 `Already up to date`，不再改动任何文件）。
**之后改本仓库的代码即时生效**，重启 dsh 后加载新版本。

### 为什么 `link:` 比「同步文件」好

早先的做法是把修复文件**拷进** `node_modules`。那样每跑一次 `pnpm install`，
pnpm 就会从 registry 重新铺包、**覆盖掉修复**（已实测发生过一次），必须重跑同步脚本。

`link:` 把 `node_modules/@axiaohungry/dsh-llm-workbuddy` 变成一个指向本仓库的软链，
pnpm 不再往里铺文件，覆盖问题从根上消失。

### 前提：本仓库必须能自己解析依赖

`link:` 的代价是**本仓库要自己解析依赖**（pnpm 不会替 `link:` 目标安装依赖）。
因此本仓库的 `node_modules/` 放了三个 junction，指向本机 DSH 安装里的对应目录：

| junction | 用途 |
|---|---|
| `@deepseek-ai/` | 宿主运行时服务（`dsh-llm`、`dsh-settings`、`dsh-credentials`、`dsh-launch-environment`、`dsh-llm-pi-ai`） |
| `@earendil-works/` | `pi-ai`（构造 Provider 用） |
| `yaml` | 仅 `cli.js`（安装器）用，宿主不加载 |

它们不是入库内容（`.gitignore` 已忽略 `node_modules/`）。若解析报
`ERR_MODULE_NOT_FOUND`，按当前实际位置重建 junction 即可：

```powershell
$prof = "$env:DSH_HOME\profiles\node_modules"
Remove-Item .\node_modules -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory .\node_modules | Out-Null
foreach ($s in @('@deepseek-ai','@earendil-works','yaml')) {
  if (Test-Path "$prof\$s") { New-Item -ItemType Junction -Path ".\node_modules\$s" -Target "$prof\$s" | Out-Null }
}
```

自检（任一条 FAIL 就按上表重建）：

```powershell
node -e "for (const p of ['@deepseek-ai/dsh-llm','@earendil-works/pi-ai','yaml']) console.log(p, require.resolve(p))"
```

> [!IMPORTANT]
> **`@deepseek-ai/dsh-llm` 必须与宿主解析到同一个文件**，否则 `LlmError` 之类的
> `instanceof` 判定会因双实例而失效。可这样复核：
>
> ```powershell
> node --input-type=module -e "console.log(await import.meta.resolve('@deepseek-ai/dsh-llm'))"
> ```
>
> 在 `profiles/web/node_modules/@axiaohungry/dsh-llm-workbuddy` 与
> `E:\deepseek-harness\apps\cli` 两处执行，输出的**路径必须相同**（本机当前都指向
> `E:/deepseek-harness/packages/llm/llm/lib/index.js`）。

**同步后需要重启 dsh**（宿主侧模块只在启动时加载），再刷新页面。

### 备用：仍然可以同步文件

若某天不想用 `link:`（例如不希望本仓库需要自带 junction），`sync-to-dsh.mjs`
仍然可用，且已修掉硬链接写穿的缺陷：

```bash
node sync-to-dsh.mjs --check    # 只看差异
node sync-to-dsh.mjs            # 同步
node sync-to-dsh.mjs --restore  # 还原
```

> [!WARNING]
> **该路径必须「先删后拷」，不能直接 `copyFileSync` 覆盖。**
>
> pnpm 用**硬链接**从内容寻址存储铺文件到 `node_modules`。`index.js` 因此同时与
> pnpm store 里的 blob、以及**其他 profile**（如 `desktop`）的同名文件**共享同一个
> inode**。`copyFileSync` 是原地覆写，会顺着硬链接写穿，后果有两个：
>
> 1. pnpm store 的 blob 内容不再等于它的内容哈希——存储被污染，影响这台机器上
>    **所有**使用该版本的安装；
> 2. 其他 profile 的副本被一并改掉，而它们**没有** `workbuddy-discovery.js`，
>    于是那些 profile 直接坏掉。
>
> 脚本用 `rmSync` + `copyFileSync` 断开链接，复制落在新 inode 上。
> 同步后可用 `fsutil hardlink list <包目录>\index.js` 复核：只应列出它自己一条路径。
>
> 走这条路时，上游发新版本后 pnpm 会覆盖，**需要重跑一次 `sync-to-dsh.mjs`**。

## 验证

```bash
node --test test.js
```

26 项：20 项上游原有（无回归）+ 6 项新增，全部通过。新增的 6 项覆盖：

- 标准 `data` 数组，含全部容量字段拼写，无 id 的行被跳过；
- 富信息 `models` 对象以属性键为请求 id，原始类型属性被忽略；
- 无 `baseURL` 保持原诊断；未知协议以 `DISCOVERY_UNSUPPORTED` 拒绝；
- 已存凭据与 profile headers 到达请求，且**表单键入的密钥优先、不解析已存凭据**
  （否则无法用新密钥替换失效的旧密钥）；
- Anthropic 原生路径与认证头，末尾 `/v1` 只对列表 URL 归一化；
- 401、非列表响应、非 JSON 响应给出**互相可区分**的失败。

测试需要宿主的 `@deepseek-ai/*` 与 `@earendil-works/pi-ai` 才能解析。本仓库的
`node_modules/` 是指向本机 DSH 安装目录的 junction，不是真实依赖，因此不入库。

## 上游

同一修复已备成可直接提交的补丁与问题报告，位于 `upstream/`：

| 文件 | 说明 |
|---|---|
| `upstream/fix.patch` | `git format-patch` 产物，基线 `349a04d` |
| `upstream/issue.md` | 问题报告：根因、复现、修复、测试 |

补丁基线与本仓库的上游父提交一致，可干净应用。若上游合并，本 fork 即可弃用。
