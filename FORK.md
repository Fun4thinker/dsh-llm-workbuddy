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

```bash
node sync-to-dsh.mjs            # 同步到 profile 里已安装的包
node sync-to-dsh.mjs --check    # 只看差异
node sync-to-dsh.mjs --restore  # 还原（移除新增模块并恢复备份）
```

用同步而不是把 profile 的依赖改成 `link:`，是因为后者要跑 `pnpm install`，
会一并重新解析 profile 的其他依赖（`dshmarket`、`@linxin666/dsh-remote-web-ui` 等），
可能顺带升级它们。这个脚本只动本包自己的文件，不碰 lockfile。

> [!WARNING]
> **必须「先删后拷」，不能直接 `copyFileSync` 覆盖。**
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

**同步后需要重启 dsh**（宿主侧模块只在启动时加载），再刷新页面。

上游发新版本时 pnpm 会覆盖 profile 里那份，**升级后重跑一次 `sync-to-dsh.mjs` 即可**。

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
