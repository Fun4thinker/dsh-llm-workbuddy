# 自定义 Provider 无法「获取可用模型」：探测处理器不认自己服务的路由

## 问题

在手写声明一条通用网关路由（例如火山方舟、Command Code 这类自定义 Provider）后，在
**设置 → 模型 → 获取可用模型**点一下，得到：

```
没有 Provider "zijie" 的模型目录
```

自定义提供方卡片（还没保存、没有 Provider ID）则是 `没有 Provider "" 的模型目录`。
无论哪种，都无法从端点拉取模型列表。

## 根因

插件内部对「通用路由」的处理是**自相矛盾**的：注册与服务都认，唯独探测不认。

`index.js` 里已经把这类路由当作一等公民：

- `genericProvider()` 接受 `openai-completions` / `openai-responses` /
  `anthropic-messages`，并为完整配置的路由构造 pi-ai `Provider`；
- `ownsProvider()` 用它判定归属，于是这些路由会被 `registerAdapter()` 注册；
- `directoryEntries()` 把 `declared: true` 的条目放进可配置提供方目录，
  **因此在「模型」页面被列出、可配置**。

但 `registerModelDiscovery()` 的处理器只有两个分支：

```js
ctx.llm.registerModelDiscovery(NS, async (request) => {
  if (WORKBUDDY_PROVIDERS.has(request.provider)) { … }   // WorkBuddy 自有路由
  const provider = builtins.get(request.provider);        // pi-ai 内置 Provider
  if (!provider) throw new LlmError(`没有 Provider "${request.provider ?? ""}" 的模型目录`, "DISCOVERY_FAILED");
  …
});
```

手写声明的通用路由**既不是** WorkBuddy 路由，**也不在** `builtins` 里，于是必然落到那句
throw 上——尽管页面上刚刚把这条路由提供给用户去配置。

这不是「缺少功能」，因为 DSH 内置的 `llm-pi-ai` 插件**本来就会**为同一条路由询问端点。
问题在于 `LlmRuntime` 的探测注册表以 settings 命名空间为键、**每个命名空间只允许一个
注册者**：

```ts
// packages/llm/llm/src/index.ts
if (this.discoveries.has(settingsNs)) {
  throw new LlmError(`model discovery for "${settingsNs}" is already registered`, 'DUPLICATE_DISCOVERY')
}
```

而本插件的 `cordis.patch.yml` 第一条就把内置插件关掉、自己接管了同一个命名空间：

```yaml
- id: llm-pi-ai
  disabled: true
```

于是这个命名空间的探测响应者只剩本插件一个，**内置那套本来可用的端点探测被一起关掉了，
却没有等价实现补上**。这是本插件接管命名空间时应自行承接的责任。

## 复现

1. 任意 DSH + 本插件，`settings.yaml` 中手写一条通用路由：

   ```yaml
   llm-pi-ai:
     providers:
       zijie:
         displayName: 方舟
         apiKeyEnv: ZIJIE_API_KEY
         api: openai-responses
         baseURL: https://ark.cn-beijing.volces.com/api/coding/v3
         models:
           - id: deepseek-v4-1-flash-260910
   ```

2. 重启 DSH，打开**设置 → 模型**；
3. 在该路由的**模型目录**区域点**获取可用模型**；
4. 得到 `没有 Provider "zijie" 的模型目录`。

同样的失败也出现在「添加自定义提供方」卡片上（此时 `provider` 为空 → `没有 Provider ""`）。

## 修复

新增 `workbuddy-discovery.js`，按 DSH 内置探测**相同的规则**询问端点，并在处理器
的未知分支上委托给它：

```js
const provider = builtins.get(request.provider);
// A hand-declared gateway is neither a WorkBuddy route nor an installed
// pi-ai provider, yet `genericProvider()` already registers it as a route
// and `directoryEntries()` already offers it on the Models page.
if (!provider) return probeEndpoint(request, { profiles, resolveCredential });
```

规则与内置实现对齐：

| 方面 | 行为 |
|---|---|
| 列表 URL | OpenAI 协议 `GET {baseURL}/models`；Anthropic 原生 `GET {root}/v1/models?limit=1000` |
| URL 处理 | base 按前缀拼接，保留部署路径段（`…/openai/v1` 不丢段） |
| 认证 | OpenAI 系 `Authorization: Bearer`；Anthropic 用 `x-api-key` + `anthropic-version` |
| 响应格式 | 标准 `data` 数组，或富信息 `models` 对象（属性键为请求 id） |
| 容量字段 | `contextWindow` / `context_window` / `context_length` / `max_input_tokens` / `limit.context`；输出侧含 `max_output_tokens` / `maxTokens` / `max_tokens` / `top_provider.max_completion_tokens` |
| 上限 | 4 MiB，按实际读到的字节强制 |
| 凭据 | 表单键入的密钥优先；否则用该路由已存凭据。两者都只在真正联网的分支解析 |
| 部署 headers | 已配置路由的 profile `headers` 随请求发出 |

只有既非 WorkBuddy、也非内置 Provider 的路由会走到这条分支，因此**不查询任何已安装
目录**——那里本来就没有它的条目。未支持的协议以 `DISCOVERY_UNSUPPORTED` 拒绝，让界面
回退到手工填写。没有 `baseURL` 时保持原有诊断文本不变。

## 测试

`test.js` 新增 6 条，全部走本地 HTTP 服务器，不依赖外网：

- 标准 `data` 数组，逐一验证四种容量字段拼写，并确认无 id 的行被跳过；
- 富信息 `models` 对象以属性键为请求 id，原始类型属性被忽略；
- 无 `baseURL` 保持原诊断；未知协议以 `DISCOVERY_UNSUPPORTED` 拒绝；
- 已存凭据与 profile headers 到达请求，**表单键入的密钥优先且不解析已存凭据**
  （否则用户无法用新密钥替换失效的旧密钥）；
- Anthropic 走原生路径与认证头，末尾 `/v1` 只对列表 URL 归一化；
- 401、非列表响应、非 JSON 响应给出**互相可区分**的失败。

```
ℹ tests 26
ℹ pass 26
ℹ fail 0
```

（20 条既有测试全部保持通过，无回归。）

## 兼容性

- 不改动任何既有导出或行为，只填补原先必定抛错的分支；
- 不影响 WorkBuddy 自有路由与 pi-ai 内置 Provider 的探测路径；
- 新文件已加入 `package.json` 的 `files` 与 `check` 脚本；
- 未支持协议仍回退手工填写，与内置插件一致。
