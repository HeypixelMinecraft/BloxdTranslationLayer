# 修复 `/play skywars` 400 Bad Request — 抓包对比官方客户端

## 摘要

版本号已更新为 761，登录成功（`Logged in as ...`），但 Minecraft 客户端执行 `/play skywars` 时，`bloxd-matchmake` 请求返回 **400 Bad Request**：
```
{"error":"Request rejected. If you think this is a bug, please inform a Bloxd admin..."}
```

当前发送的请求体：
```json
{"metricsCookies":{...},"contents":{"gameNameWithVariation":"skywars","languages":["en-US","en","En-GB"]}}
```

可疑点：
1. `"En-GB"` 大小写异常（标准 locale 为 `en-GB`），来自 [anticheat_constants.js](file:///d:/codex/bloxdtranslationlayer/bloxd/types/anticheat_constants.js#L10) 的 `LANGUAGE_KEY: 'En-GB'`
2. 可能缺少 `partyCode` 字段（官方 `matchmakePlayer` 构造 `{gameNameWithVariation, languages, lobbyNameOrDiscordContext?, partyCode?}`）
3. `languages` 数组可能多了一个元素（官方客户端通常只发 `navigator.languages` 如 `["en-US","en"]`）

**根因无法通过静态分析确定**，需要抓取官方 bloxd.io 客户端发出的真实 `bloxd-matchmake` 请求进行对比。

## 当前状态分析

### 已确认的事实
- `checkLogin()` 成功：生成 `3PSIDMCPP`，输出 `Logged in as FrostyPirate8719134`
- `socialRequest` 已改为 JSON 格式（`Content-Type: application/json`，body = `{metricsCookies, contents}`）
- `buildCookieHeader()` 已包含 `___Secure-3PSIDMC` / `3PSIDMCPP` / `3PSIDMCSP`
- `index.js` 的 `queue()` 已按官方逻辑：未指定 roomId 时不包含 `lobbyNameOrDiscordContext`
- `exports.version = 761`（已从 bloxd.io JS bundle 模块 63 提取）
- 之前的 `fix-bad-request-error.md` 建议"添加 matchmaking 字段"是**错误**的（project_memory.md 明确记录：添加 matchmaking 会导致 Bad Request）

### 当前请求构造链路
1. [index.js:21-38](file:///d:/codex/bloxdtranslationlayer/index.js#L21-L38) `queue()` 构造 `requestData = {gameNameWithVariation: 'skywars', languages: ['en-US','en','En-GB']}`
2. [browser_info.js:589-603](file:///d:/codex/bloxdtranslationlayer/bloxd/types/browser_info.js#L589-L603) `socialRequest('bloxd-matchmake', requestData)` 包装为 `{metricsCookies, contents: requestData}`
3. POST 到 `https://social{1-17}.bloxd.io/social/bloxd-matchmake`
4. 服务器返回 400

### 关键文件
- [index.js](file:///d:/codex/bloxdtranslationlayer/index.js) — `queue()` 函数（第 21-38 行）
- [bloxd/types/browser_info.js](file:///d:/codex/bloxdtranslationlayer/bloxd/types/browser_info.js) — `socialRequest`（第 589-603 行）、`buildCookieHeader`（第 43-52 行）、`exports.languages`（第 608 行）、`exports.metrics`（第 618-626 行）
- [bloxd/types/anticheat_constants.js](file:///d:/codex/bloxdtranslationlayer/bloxd/types/anticheat_constants.js) — `LANGUAGE_KEY: 'En-GB'`（第 10 行）

## 计划步骤

### 步骤 1：用 Chrome DevTools MCP 抓取官方客户端的真实请求

**目标**：获取官方 bloxd.io 客户端发出的 `bloxd-matchmake` 请求的完整 Request Payload、Headers、Cookie、Response。

**操作**：
1. 调用 `navigate_page`（type=url, url=https://bloxd.io）打开 bloxd.io 主页
2. 通知用户：在浏览器里登录 Bloxd 账号（如未登录），然后点击 Skywars 的 Play 按钮
3. 调用 `list_network_requests`（resourceTypes=["fetch","xhr"]）列出请求
4. 在请求列表中找到 URL 包含 `bloxd-matchmake` 的请求，记录其 `reqid`
5. 调用 `get_network_request(reqid)` 获取完整请求详情：
   - Request URL（确认 socialId 和路径）
   - Request Method
   - Request Headers（重点：`Cookie`、`Content-Type`、`Origin`、`Referer`、`User-Agent`）
   - Request Body（重点：`metricsCookies`、`contents` 的字段结构和值）
   - Response Status + Body（确认官方请求成功返回什么）

**关键对比项**：
| 对比项 | 当前实现 | 官方客户端（待抓取） |
|---|---|---|
| `contents.gameNameWithVariation` | `"skywars"` | ? |
| `contents.languages` | `["en-US","en","En-GB"]` | ? |
| `contents.lobbyNameOrDiscordContext` | 不包含 | ? |
| `contents.partyCode` | 不包含 | ? |
| `contents` 其他字段 | 无 | ? |
| Cookie | `3PSIDMC; 3PSIDMCPP; 3PSIDMCSP` | ? |
| 其他 Header | 标准 HEADERS | ? |

### 步骤 2：根据抓包结果修复代码

**文件**：`d:\codex\bloxdtranslationlayer\index.js` 和/或 `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js` 和/或 `d:\codex\bloxdtranslationlayer\bloxd\types\anticheat_constants.js`

**预期修复方向**（以抓包结果为准）：
- 若官方 `languages` 不含 `En-GB` 或大小写不同 → 修改 [anticheat_constants.js:10](file:///d:/codex/bloxdtranslationlayer/bloxd/types/anticheat_constants.js#L10) 的 `LANGUAGE_KEY`，或修改 [browser_info.js:608](file:///d:/codex/bloxdtranslationlayer/bloxd/types/browser_info.js#L608) 的 `exports.languages` 构造
- 若官方 `contents` 包含 `partyCode: null` → 在 [index.js:24-27](file:///d:/codex/bloxdtranslationlayer/index.js#L24-L27) 的 `requestData` 中添加 `partyCode: null`
- 若官方 `contents` 包含其他字段 → 按抓包结果补齐
- 若 Cookie/Header 不同 → 调整 `buildCookieHeader()` 或 `HEADERS`

**约束**（来自 project_memory.md）：
- `socialRequest` 的请求体**只能**包含 `metricsCookies`（和 `contents`），**不能**添加 `matchmaking` 字段
- `buildCookieHeader` 必须包含全部三个 `___Secure-3PSIDMC*` Cookie

### 步骤 3：验证

1. 运行 `node index.js`，确认 `Logged in as ...` 输出
2. Minecraft 1.8.9 客户端连接 `localhost`
3. 执行 `/play skywars`：
   - 期望：控制台输出 `Queue request: {...}` 后，返回 200，输出 `Connecting to wss://... : Lobby ...`
   - 若仍 400，打印响应体继续排查
4. 验证 `friends.js` 的社交数据刷新不回归（`/f list` 不报 TypeError）

### 步骤 4：更新项目记忆

在 `c:\Users\merryzz\.trae-cn\memory\projects\-d-codex-bloxdtranslationlayer\project_memory.md` 中记录：
- `bloxd-matchmake` 请求体的正确字段结构（来自抓包）
- `languages` 数组的正确内容
- `partyCode` 字段是否必需

## 假设与决策

1. **抓包是唯一可靠手段**：官方客户端 JS 高度混淆，静态分析已花费多轮仍未确定 `matchmakePlayer` 的精确请求体；抓包可直接获得真相
2. **不引入 Avro**：`fix-social-request-format.md` 已证明官方走 JSON 路径，不回退到 Avro
3. **不添加 matchmaking 字段**：project_memory.md 明确记录这会导致 Bad Request
4. **最小改动**：只修改 `queue()` 的 `requestData` 构造、`languages` 定义、必要时 `LANGUAGE_KEY`；不改 `socialRequest` 的 JSON 包装结构
5. **用户手动点 Play**：用户选择手动在浏览器点击 Play 按钮触发 matchmake，最接近真实流量

## 风险与回退

- **风险**：若官方客户端的 `bloxd-matchmake` 请求体包含复杂嵌套对象（如 `partyCode` 是对象而非 null），需要更深入还原
- **风险**：若抓包显示请求体不是 JSON 而是 Avro/二进制（与之前分析矛盾），需重新评估
- **回退**：保留当前 JSON 实现作为基线，若修复后仍 400，可逐步回退变更逐项测试
