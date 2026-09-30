# DSH WorkBuddy Provider（Fork）

为 DeepSeek Harness（DSH）增加 `WorkBuddy 中国区` Provider。插件通过
WorkBuddy 提供的 API Key，或 WorkBuddy 中国站的网页登录令牌调用模型，并在
DSH WebUI 中管理模型和认证方式。

> [!IMPORTANT]
> API Key 来自 **WorkBuddy**，用于调用供 WorkBuddy 使用的模型服务。本插件是第三方
> 适配器，不属于 WorkBuddy 或 DSH 官方项目。

## 关于本 Fork

本仓库是 [`@axiaohungry/dsh-llm-workbuddy`](https://github.com/Axiaohungry/dsh-llm-workbuddy)
的 Fork，维护分支为 **`clean-fix`**（`main` 与它同步）。本分支基于上游 `1.3.19`
（提交 `87a984b`）重新实现，并修复了插件在 DSH **`0.2.0-rc.2`** 上无法使用的问题。
更早那次针对 DSH `0.1.7-alpha.2` 的 Fork 改动保留在归档分支
`archive/clean-fix-1.3.18-fork.1`（`cc4923a`）中，其目标已由上游用自己的方式实现。

### 相对上游 `1.3.19` 的改动

| 提交 | 修复内容 |
| --- | --- |
| `0e80368` | **在 DSH 0.2 上保持内置 `llm-pi-ai` 启用。** `cordis.patch.yml` 的版本判断把 `0.2.0-rc.2` 误判为 `0.1.0`：正则 `^0\.1\.` 不匹配，`?? 0` 把结果兜成 minor 0，于是 `0 < 7` 成立、内置 `llm-pi-ai` 被禁用。而它是模型页整份提供商目录、模型探测与登录流程的唯一注册者——禁用后「添加提供商」列表为空，令牌登录入口也随之消失。 |
| `63717dc` | **pi-ai 改由宿主提供**（`dependencies` → `peerDependencies`）。DSH 的适配器在调用 provider 之前，会用**它自己的** pi-ai 归一化请求：把 `systemPrompt` 与 `tools` 折进一条打头的 `system` 消息。插件自带的 pi-ai `0.84.4` 没有 `system` 分支，会把该消息当成工具调用块并在 `block.name.length` 上抛出 `Cannot read properties of undefined (reading 'length')`；即使不抛，`0.84` 也只认 `context.systemPrompt` / `context.tools`，system prompt 与全部工具会**静默丢失**。 |
| `5a304f2` | **本机页面守卫接受桌面端转发的请求。** DSH Desktop 把页面请求转发给本地 Host 前会删除 `origin` 与 `sec-fetch-site`；旧守卫在缺少这两个头时要求 `sec-fetch-site === 'same-origin'`，于是积分与今日用量、模型配置、切换令牌账号、保存 API Key、登录等**全部 POST 接口**都返回 403「只允许从本机 DSH 页面」。 |

三处修复都带回归测试，当前测试套件 38 项全部通过。第三个修复同时把
`dsh-app://app`（桌面端渲染进程的特权来源）纳入允许范围。

## 功能

- 在 DSH WebUI 中使用 `WorkBuddy 中国区`；
- 支持 WorkBuddy API Key 和 WorkBuddy 中国站账号令牌；
- 两种认证模式互相独立，可以随时切换；
- API Key 支持环境变量、多个 DSH 保存值，并可通过下拉列表切换；
- 令牌支持浏览器登录、多个账号持久化、账号名称展示和下拉切换；
- 令牌模式显示剩余积分、今日请求次数和今日积分用量；
- 自动兼容 `modlens-workbuddy-cn` 等带有 WorkBuddy/CodeBuddy 标识的包装 Provider；
- 用量信息与 DSH 的 Token/缓存统计显示在输入框底部同一行；
- 自动从 WorkBuddy 获取当前账号可用模型；
- 支持编辑模型 ID、名称、上下文窗口、最大输出 Token 和模型思考档位；
- 支持添加、删除模型以及恢复在线模型目录；
- 不依赖本机 WorkBuddy CLI。

## 环境要求

- 已安装 DSH；
- Node.js `>= 22.19.0`；
- Windows、Linux 或 macOS。

插件 `1.3.7` 及以上版本要求 DSH `>= 0.1.2-alpha.2`。`1.3.9` 起兼容新版 DSH
的 settings 注册接口。该版本不再携带旧版 DSH
运行时副本，而是复用宿主 DSH 的运行时，避免更新 DSH 后出现 Provider 目录接口
（`llm/listProviders`）不兼容。`1.3.10` 起，WorkBuddy 认证助手同时兼容新旧 DSH
的 `signal` 调用约定。升级插件后请重新安装一次并重启 DSH。

本 Fork 支持 DSH `>= 0.2.0-rc.1 < 0.3.0`，并保留对 `0.1.x` 的兼容。两代 DSH 的
差别在于内置 `llm-pi-ai` 是否可用，插件据此选择两种配置方式：

- **DSH `0.1.0`–`0.1.6`**（内置 `llm-pi-ai` 尚不完善）：插件接管 `llm-pi-ai`，
  并自行声明全部内置 Provider。
- **DSH `>= 0.1.7`，含整个 `0.2.x`**：内置 `llm-pi-ai` 保持启用，继续负责内置
  Provider 目录、模型探测与登录流程；插件以**自己的配置条目**（`llm-workbuddy`）
  共存，只注册 `WorkBuddy 中国区` 一条路由。

升级后请完整退出并重新启动 DSH，再检查模型卡片与凭证模式。在 `0.2.x` 上，
命令行 `login` 只保存令牌；认证模式需在 WorkBuddy 模型卡片中选择“令牌登录”。
模型页通过插件扩展位显示 WorkBuddy 专属认证与模型管理区域。

> [!IMPORTANT]
> 插件**不再自带 `@earendil-works/pi-ai`**，而是使用 DSH 宿主提供的那一份。这一
> 点不可改回：宿主在调用 provider 前用自身版本归一化请求上下文，两边版本不一致
> 会导致请求报错或 system prompt 与工具定义被静默丢弃。因此插件把它声明为
> `peerDependencies`；用 npm/pnpm 安装时会看到一条未满足 peer 的告警，属正常现象。

## 安装

### 从本 Fork 安装

桌面端（DSH Desktop）的 `desktop` Profile 由应用自身独占管理，命令行无法操作，
请在应用内 **设置 → 插件** 中通过 GitHub 仓库地址安装本仓库，并选择 `clean-fix`
分支；安装后重启应用。

`web` / `headless` Profile 可以直接用命令行安装本仓库：

```powershell
dsh plugin --profile web add github:Fun4thinker/dsh-llm-workbuddy#clean-fix
```

也可以在 `~/.dsh/profiles/web/package.json` 中加入依赖后执行 `pnpm install`：

```json
{
  "dependencies": {
    "@axiaohungry/dsh-llm-workbuddy": "github:Fun4thinker/dsh-llm-workbuddy#clean-fix"
  }
}
```

安装完成后重启 DSH。`0.2.x` 上插件以 bundle 形式挂载，需要把
`@axiaohungry/dsh-llm-workbuddy` 加入该 Profile 的 `dsh.profile.bundles` 才会启用：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@axiaohungry/dsh-llm-workbuddy"]
    }
  }
}
```

### 安装上游发布版

若不需要本 Fork 的修复，可以安装上游 npm 包：

```powershell
npx --yes @axiaohungry/dsh-llm-workbuddy@latest install
```

安装器会为 DSH 的 `web` 和 `headless` Profile 安装插件。安装完成后重启 DSH。
只使用 WebUI 时，也可以单独安装 Web Profile：

```powershell
dsh plugin --profile web add @axiaohungry/dsh-llm-workbuddy@latest
```

从更旧的包升级（`dsh-llm-workbuddy` 或 `dsh-llm-codebuddy`）：安装器会在 `web` 和
`headless` Profile 中自动移除旧包，再安装新包；已有 Provider、模型、API Key 和令牌
凭据会保留。

新版本内部 Provider ID 为 `workbuddy-cn`。旧配置中的 `codebuddy-cn` 会在运行时兼容，并在
切换认证模式时迁移为新 ID。

## WebUI 配置

打开 **设置 → 模型**。在 DSH `0.2.x` 上，点击“添加模型提供商”，从第三方模型提供商
选择 `WorkBuddy 中国区`；已配置后直接编辑它的模型卡片。内置 `llm-pi-ai` 提供的
其它 Provider 会与它并列显示在同一份列表中。DSH `0.1.0`–`0.1.6` 上由插件接管
`llm-pi-ai`，继续从提供方列表添加或编辑。认证区域有两个模式按钮：

- `API Key`：只显示 API Key 来源和新增 Key 功能；
- `令牌登录`：只显示令牌账号、登录、切换以及账号用量信息。

切换模式后，另一种模式的账号或 Key 控件会隐藏，不会同时占用页面空间。

### 可选：会话级账号/API Key

认证区域提供“会话级账号/API Key”开关：

- **关闭（默认）**：保持旧版行为。所有会话共用模型设置中当前选中的全局账号或 API Key；
  不会改变已有配置和调用方式。
- **打开**：模型设置中选择的账号或 API Key 作为未绑定会话的默认预选。每个会话也可以在
  输入框底部单独选择“令牌 / API Key”以及对应账号或 Key。切换当前会话的凭证不会修改
  其他会话，也不会中断已有会话上下文。

会话级绑定只保存会话 ID 与账号 ID/API Key 引用，不会把令牌或 API Key 写入会话路由配置。
关闭开关后，已保存的绑定会暂时停用；重新打开后会继续生效。新增或删除账号、Key 时，
对应的无效绑定会自动清理。

开启后，点击“新会话”时会在输入框上方显示“新会话默认凭证”，可以在发送第一条消息前
选择令牌账号或 API Key。新会话或历史未绑定会话第一次调用 WorkBuddy 模型时，插件会先把
当时的默认预选固化到该 `sessionId`，再发出模型请求。固化后，即使模型设置中的默认预选发生
变化，该会话仍继续使用自己的绑定；也可以在会话底部再次切换或解除绑定。解除后，下一次发送
会重新固化当时的默认预选。运行时请求如果缺少 `sessionId`，则使用原有全局认证配置。

模型目录仍由 DSH 统一管理，模型选择本身按会话保存。更换会话凭证后，如果该账号的模型
权限不同，请在模型设置中重新获取一次在线模型目录。

### 方式一：WorkBuddy API Key

#### 使用环境变量中的 Key

插件会自动检测：

```text
WORKBUDDY_API_KEY
```

如果这个环境变量存在，API Key 来源下拉列表会显示“环境变量 WORKBUDDY_API_KEY”。
选择它即可使用；密钥值不会显示在页面中，也不会写入插件配置。

旧版插件使用的 `CODEBUDDY_API_KEY` 仍会作为兼容环境变量自动识别，但新配置建议统一使用
`WORKBUDDY_API_KEY`。

#### 在 DSH 中保存新的 Key

1. 选择 `API Key` 模式；
2. 在“新增 API Key”输入框粘贴 WorkBuddy Key；
3. 可填写一个名称，例如“工作账号”或“测试账号”；
4. 点击“添加并使用”；
5. 新 Key 会出现在“当前 API Key”下拉列表中，并立即切换为当前 Key。

DSH 保存的 Key 存放在 DSH 凭据服务中。可以保存多个 Key 并随时切换；环境变量 Key
和 DSH 保存的 Key 互不覆盖。删除操作只允许删除 DSH 保存的 Key，不会删除环境变量。

### 方式二：WorkBuddy 账号令牌

1. 选择 `令牌登录` 模式；
2. 点击“令牌登录”（已有账号时为“添加账号”），插件会打开 WorkBuddy 中国站；
3. 在浏览器完成账号登录；
4. 返回 DSH 后，账号会保存到本地凭据并自动启用。

再次打开页面时，可以在“令牌账号”下拉列表中切换账号。点击“添加账号”可以登录
另一个账号，点击“删除账号”会移除当前账号的本地令牌。令牌登录不需要安装
本机 WorkBuddy 命令行工具。

令牌模式下，插件会尝试显示：

- 剩余积分或企业账号的“不限量”；
- 今日请求次数；
- 今日请求消耗的积分。

积分接口属于 WorkBuddy 中国站的账号服务，仅令牌模式使用；API Key 模式不会调用该
接口。如果服务暂时不可用，页面会保留账号登录状态并显示“暂不可用”。

## 获取和编辑模型

1. 在 `WorkBuddy 中国区` 的设置中点击“获取可用模型”；
2. 插件会使用当前选中的 API Key 或令牌请求 WorkBuddy 模型目录；
3. 选择要使用的模型，按需使用“添加模型”补充，然后点击“保存模型”；
4. 再次编辑时，可以直接修改模型 ID、显示名称、上下文窗口和最大输出 Token。

“恢复在线目录”会移除手工覆盖的模型列表，恢复按在线目录读取。获取在线模型后，
若要固定当前选择或编辑结果，仍需点击“保存模型”。

模型目录按当前账号权限返回。更换 API Key 或令牌账号后，建议重新点击“获取可用模型”。
如果在线目录暂时失败，插件会使用内置目录作为兜底。
在 headless 模式指定内置目录尚未收录的 WorkBuddy 模型时，插件会在调用前查询当前
凭证可用的在线模型目录；模型仍不存在或查询失败时会明确报错。若在配置中手动指定了
模型列表，请把要使用的模型 ID 也加入该列表。

DSH `0.1.0`–`0.1.6` 中，插件接管 `llm-pi-ai` 后也负责自定义 OpenAI Completions、
OpenAI Responses 和 Anthropic Messages 提供方的模型探测；DSH `0.1.7` 及以上（含
`0.2.x`）保留内置的自定义提供方页面与探测器，两者都请求已配置的模型端点；服务未
提供标准目录时，可手工填写模型 ID。

## ModLens 兼容性

插件兼容 `modlens-workbuddy-cn`、`modlens-codebuddy-cn` 等包装 Provider。包装 Provider
会先由 ModLens 处理图片，再把请求转发给 WorkBuddy，因此它不是另一个 WorkBuddy 账号：

- 会话历史中有图片时，首次响应可能比 WorkBuddy 直连慢；旧会话中的历史图片也可能再次参与处理；
- 超时、无响应或 `429`/“配额耗尽”通常来自 ModLens 的视觉引擎，不代表 WorkBuddy 令牌或 API Key 失效；
- 纯文本任务可切换到 `workbuddy-cn/<model-id>`，绕过视觉桥接；
- WorkBuddy 的令牌积分和请求量与 ModLens 视觉引擎额度相互独立，插件不会混合统计。
- ModLens 会保留原始 `sessionId`，因此与 WorkBuddy 直连使用同一套会话凭证固化和切换规则。

遇到包装模型异常时，可运行 ModLens 提供的诊断命令检查视觉引擎状态：

```powershell
modlens doctor --json
```

如果纯文本直连正常、而带历史图片的请求变慢或失败，优先检查 ModLens 的视觉引擎登录状态、网络
和额度；切换 WorkBuddy 账号不会恢复已经耗尽的视觉引擎配额。

## 思考程度

思考档位按模型分别决定，插件不会给所有模型强行使用同一套选项。在线模型目录会声明
每个模型是否支持思考、支持哪些档位以及默认档位，WebUI 会据此显示可用选项。

常见档位包括：

```text
off / minimal / low / medium / high / xhigh / max
```

实际选项可能因模型不同而不同。未手动指定时，使用 WorkBuddy 返回的默认档位；服务端
没有声明思考能力时，插件不会额外发送思考参数。

## 认证和请求说明

- API Key 请求使用 WorkBuddy 的 OpenAI-compatible 接口；
- 令牌请求使用 WorkBuddy 中国站的登录令牌，并在过期前自动刷新；
- DSH 负责 Agent 循环、上下文、工具调用和权限；
- WorkBuddy 负责模型推理并返回结果；
- 访问令牌、刷新令牌和 DSH 保存的 API Key 不会写入模型目录或插件配置。

## 更新

从本 Fork 更新时，重新执行安装命令指向 `clean-fix` 分支即可拉取最新提交：

```powershell
dsh plugin --profile web add github:Fun4thinker/dsh-llm-workbuddy#clean-fix
```

桌面端请在 **设置 → 插件** 中重新安装或更新该插件。更新后重启 DSH；已有的模型配置、
API Key 和登录令牌会保留。

上游发布版的更新方式：

```powershell
npx --yes @axiaohungry/dsh-llm-workbuddy@latest install
```

## 卸载

上游发布版提供卸载命令：

```powershell
npx --yes @axiaohungry/dsh-llm-workbuddy@latest uninstall
```

卸载会移除 `WorkBuddy 中国区` 的 Provider 和插件包，并备份 DSH 设置文件。为方便以后
重新安装，API Key 和登录令牌默认保留在 DSH 凭据服务中。

从本 Fork 卸载时，把该包从 Profile 的 `dependencies` 与 `dsh.profile.bundles` 中移除后
重新执行 `pnpm install`，再重启 DSH。

## 常见问题

### 看不到 WorkBuddy Provider

重启 DSH 后重新打开 **设置 → 模型**。也可以检查：

```powershell
dsh plugin --profile web list --depth 0
```

如果「添加提供商」列表整体为空、连内置 Provider 也一起消失，说明内置 `llm-pi-ai`
被误禁用了。这是 `1.3.20` 之前 `cordis.patch.yml` 版本判断的缺陷：`0.2.0-rc.2`
不匹配 `^0\.1\.`，`?? 0` 把结果兜成 minor 0，于是被当成 `0.1.0` 处理。更新到本仓库
`clean-fix` 后重启即可。用下面的命令可以看到组合结果中该条目的实际状态：

```powershell
dsh --profile web --dump-config
```

### 模型列表出现但无法使用

说明插件版本早于 `1.3.21`：Provider 与模型能注册，但每次请求都会失败。参见下文
「调用模型时报 `Cannot read properties of undefined`」。

### API Key 下拉列表只有环境变量

不要使用 DSH 原生的旧密钥输入框提交。选择 `API Key` 模式，在插件自己的“新增 API Key”
区域粘贴 Key 并点击“添加并使用”。成功后新 Key 会出现在“当前 API Key”下拉列表。

### 获取模型失败

确认当前选中的 Key 来自 WorkBuddy 且仍然有效，或确认令牌账号登录状态正常。更换认证
凭据后重新获取模型目录。如果出现 `Unexpected end of JSON input`、空响应或模型页接口
`404`，请先完整退出并重新启动 DSH，再刷新页面；只刷新浏览器不会更新正在运行的后端插件。
若返回 `401` 或 `403`，则检查当前凭证及该账号的模型权限。

### 请求卡住或超时

插件会在 DSH 日志中记录不含密钥、令牌和消息内容的请求阶段：认证、HTTP 响应头、
首个模型事件、完成或取消。可用同一请求编号判断停在认证、连接还是生成阶段；
若使用 ModLens 包装 Provider，还应单独检查其视觉引擎状态与额度。

### 令牌登录后没有积分

积分查询只支持令牌模式，并依赖 WorkBuddy 中国站 billing 接口。网络、账号类型或接口
暂时不可用时，页面会显示“暂不可用”，不影响模型调用。

用量栏会识别 `workbuddy` 或 `codebuddy` 词段的 Provider ID，因此通过 ModLens 等插件
包装的 Provider（例如 `modlens-workbuddy-cn`）也可以显示当前账号用量。

### 提示“只允许从本机 DSH 页面”

这条提示来自插件的本机页面守卫，它保护所有会改状态的接口（积分与用量、模型配置、
切换认证、保存或删除 API Key、登录、解绑账号）。守卫要求请求来自环回地址，并且
不属于跨站来源。

若在 DSH Desktop 中出现，说明插件版本早于 `1.3.22`：桌面端把页面请求转发给本地
Host 时会删除 `origin` 与 `sec-fetch-site`，旧守卫在这两个头都缺失时一律拒绝，
于是上述接口全部返回 403。请把插件更新到本仓库的 `clean-fix`（`1.3.22` 及以上）
后重启应用。

若在 `dsh web` 中出现，检查是否通过反向代理或非本机地址访问页面：守卫只接受
`127.0.0.1`、`localhost`、`[::1]` 三种页面来源，以及在缺少来源头时的本机直连请求。

### 调用模型时报 `Cannot read properties of undefined (reading 'length')`

说明插件版本早于 `1.3.21`。旧版自带 pi-ai `0.84.x`，而 DSH `0.2.x` 会用宿主自己的
pi-ai 归一化请求上下文，两者约定不一致导致该错误（即使不报错，system prompt 与工具
定义也会被丢弃）。更新到 `1.3.21` 及以上并重启 DSH 即可；该版本改为使用宿主提供的
pi-ai。

### 调用时报 `500 status code (no body)`

先更新插件并重启 DSH。从本 Fork 更新：

```powershell
dsh plugin --profile web add github:Fun4thinker/dsh-llm-workbuddy#clean-fix
```

最新版会恢复 WorkBuddy 官方请求标识，兼容 API Key 和令牌模式。

### 修改后页面仍显示旧布局

完整退出并重新启动 DSH，再在浏览器执行 `Ctrl+F5` 强制刷新。

## License

[MIT](./LICENSE)
