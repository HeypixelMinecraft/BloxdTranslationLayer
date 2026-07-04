# 修复 Social API 401/400 错误 — 回退到 JSON 格式

## 摘要

通过反向分析 `bloxd-script.js` 官方客户端代码，发现 **Social API 请求使用的是 JSON 格式，而非 Avro 二进制编码**。当前实现错误地使用了 Avro + Base64 + `text/plain`，导致 `bloxd-matchmake` 返回 401 Unauthorized。

根本原因：
1. `socialRequest` 改成了 Avro 编码，但官方客户端走的是 **JSON 路径**（`Yw` → `mv` with `Ew.json`）
2. Cookie 头缺少 `___Secure-3PSIDMCSP`
3. Content-Type 应为 `application/json`，不是 `text/plain`

## 当前状态分析

### 官方客户端请求流程（从 bloxd-script.js 反编译确认）

1. **`matchmakePlayer`** 构造 contents 对象 `{gameNameWithVariation, languages, lobbyNameOrDiscordContext?, partyCode?}`
2. **`makeSocialApiRequest`** 调用 `Yw(url, contentsData, retryOptions, metricsCookies)`
3. **`Yw`** 调用 `mv(TT, wT, vT, Ew.json, Ew.json, metricsCookies, extraHeaders)`
4. **`mv`** 中 `jw === Ew.json` 为 `true`，走 JSON 路径：
   ```javascript
   const vT = {metricsCookies: eT};
   if (wT && Object.entries(wT).length > 0) vT.contents = wT;
   iw = await Sw.g(TT, vT, uT);  // JSON POST
   ```
5. **`Sw.g`** 发送：
   ```javascript
   fetch(url, {
     method: "POST",
     headers: {Accept: "application/json", "Content-Type": "application/json", ...extraHeaders},
     body: JSON.stringify({metricsCookies: {...}, contents: {...}})
   })
   ```
6. **Cookie**：浏览器自动发送 `___Secure-3PSIDMC`、`___Secure-3PSIDMCPP`、`___Secure-3PSIDMCSP` 等

### 当前实现的问题

- `browser_info.js` 的 `socialRequest` 对已知端点使用 `encodeSocialRequest`（Avro + Base64），Content-Type 设为 `text/plain`
- `buildCookieHeader()` 缺少 `___Secure-3PSIDMCSP`
- `index.js` 的 `queue` 设置 `lobbyNameOrDiscordContext: null`，但官方客户端在不指定房间时**不包含该字段**

### 关键证据

| 官方客户端 | 当前实现 |
|---|---|
| `Yw` → `mv(jw=Ew.json)` → JSON 路径 | `encodeSocialRequest` → Avro + Base64 |
| `Content-Type: application/json` | `Content-Type: text/plain` |
| Cookie 自动发送 3PSIDMC + 3PSIDMCPP + 3PSIDMCSP | 仅 3PSIDMC + 3PSIDMCPP (+ bb_u_id) |
| `JSON.stringify({metricsCookies, contents})` | `base64(avroWrapper)` |

## 计划步骤

### 步骤 1：重写 `socialRequest` 为 JSON 格式
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`（第 689-721 行）

将 `socialRequest` 改回 JSON 格式，并附加 Cookie 头：

```javascript
exports.socialRequest = async function(url, data) {
  const fullUrl = url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`;
  const body = {metricsCookies: exports.metrics};
  if (data && Object.keys(data).length > 0) {
    body.contents = data;
  }
  return await fetch(fullUrl, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Cookie': buildCookieHeader()
    },
    body: JSON.stringify(body)
  });
};
```

要点：
- `HEADERS` 已包含 `Content-Type: application/json`，无需覆盖
- 当 `data` 为空/undefined 时不包含 `contents` 字段（与官方一致）
- Cookie 头通过 `buildCookieHeader()` 构造

### 步骤 2：在 `buildCookieHeader` 中添加 `___Secure-3PSIDMCSP`
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`（第 145-153 行）

```javascript
function buildCookieHeader() {
  const parts = [
    `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
    `___Secure-3PSIDMCPP=${exports.metrics['3PSIDMCPP']}`,
    `___Secure-3PSIDMCSP=${exports.metrics['3PSIDMCSP']}`
  ];
  if (exports.cookies.bb_u_id) parts.push(`bb_u_id=${exports.cookies.bb_u_id}`);
  if (exports.cookies.bb_u_h_init) parts.push(`bb_u_h_init=${exports.cookies.bb_u_h_init}`);
  return parts.join('; ');
}
```

### 步骤 3：删除 Avro 相关代码
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

删除以下不再使用的代码：
- `const { Type } = require('avsc');`（第 3 行）
- `SOCIAL_WRAPPER_SCHEMA` 常量（第 24-31 行）
- `SOCIAL_CONTENT_SCHEMAS` 常量（第 36-101 行）
- `encodeSocialRequest` 函数（第 109-120 行）

保留 `parseSetCookie` 函数和 `exports.cookies`（仍用于 `gen3PSIDMCPP` 中的 Set-Cookie 捕获）。

### 步骤 4：更新 `index.js` 的 `queue` 函数
**文件**：`d:\codex\bloxdtranslationlayer\index.js`（第 21-36 行）

按官方客户端逻辑，不指定房间时不包含 `lobbyNameOrDiscordContext` 字段：

```javascript
async function queue(gamemode, roomId) {
  let fetched;
  try {
    const requestData = {
      gameNameWithVariation: gamemode ?? 'skywars',
      languages: languages
    };
    if (roomId != null) {
      requestData.lobbyNameOrDiscordContext = roomId;
    }
    console.log(`\x1b[36m[*] Queue request: ${JSON.stringify(requestData)}\x1b[0m`);
    fetched = socialRequest('bloxd-matchmake', requestData);
  } catch (exception) {
    console.log(`\x1b[36m[*] Queue request exception: ${exception}\x1b[0m`);
    fetched = {text: function() { return exception; }};
  }
  return fetched;
}
```

### 步骤 5：清理临时调试文件
**操作**：删除以下文件：
- `analyze-script.js`
- `analyze-output.txt`
- `bloxd-script.js`（2.4MB 反编译脚本）
- `test-queue.js` ~ `test-queue8.js`
- `test-cookies.js`
- `test-json-cookie.js`
- `test-search.js`
- `test-social-request.js`

### 步骤 6：验证
1. 运行 `node index.js`，确认 `Logged in as ...` 输出
2. Minecraft 1.8.9 客户端连接 `localhost`
3. 执行 `/play skywars`：
   - 期望：`Queue request` 返回 200，输出 `Connecting to wss://...`
   - 若失败，打印响应状态和体继续排查
4. 验证 `friends.js` 的社交数据刷新不回归

## 假设与决策

1. **JSON 格式**：官方客户端 `Yw` 函数明确设置 `jw = Ew.json`，走 JSON POST 路径（`Sw.g`），非 Avro 路径
2. **Cookie 认证**：Social 服务器通过 Cookie 头中的 `___Secure-3PSIDMC`/`3PSIDMCPP`/`3PSIDMCSP` 验证身份，`metricsCookies` 在 body 中作为附加校验
3. **不删除 `parseSetCookie`/`exports.cookies`**：`gen3PSIDMCPP` 仍需要从 `metrics/cookies` 响应中捕获 `bb_u_id` 等 Cookie
4. **向后兼容**：`login.json` 的 `cookies` 字段保留，旧格式无该字段时正常工作

## 风险与回退

- **风险**：若 JSON 格式仍返回 400/401，可能是 `metricsCookies` 中的 token 值不被 Social 服务器接受（本地生成的 3PSIDMC 是随机 token）
- **回退**：保留 Avro schema 定义代码在 git 历史中，可随时恢复
