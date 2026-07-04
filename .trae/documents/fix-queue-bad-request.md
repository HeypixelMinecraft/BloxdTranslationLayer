# 修复 Queue Bad Request 计划

## 摘要
当前 `node index.js` 运行后，Minecraft 客户端执行 `/play skywars` 时，`bloxd-matchmake` 请求返回 **400 Bad Request - Request rejected**。根本原因已基本定位：

1. `bloxd/types/browser_info.js` 的 `socialRequest` 仍在发送 **JSON** 请求体，而 Bloxd 官方客户端现在对 Social API 使用 **Avro 二进制 + Base64** 编码。
2. `socialRequest` 未携带浏览器 Cookie（`___Secure-3PSIDMC`、`___Secure-3PSIDMCPP` 等），导致身份校验失败。
3. 部分 Social 端点的响应也改为二进制/Avro，需要对应解码。

本计划将先通过浏览器抓包确认真实请求格式，然后在 `browser_info.js` 中实现 Avro 序列化/反序列化，并统一在 `socialRequest` 中附加 Cookie，最后验证 `/play` 能成功进入游戏。

## 当前状态分析

### 已验证的事实
- `checkLogin()` 能成功登录：`Logged in as FrostyPirate8719134`，`3PSIDMCPP` 已生成。
- 当前 `socialRequest` 发送的 JSON 体：
  ```json
  {"contents": {"gameNameWithVariation":"skywars",...}, "metricsCookies": {...}}
  ```
  返回 `400 Bad Request {"error":"Request rejected..."}`。
- 改为发送 **Avro 二进制** 后，状态码变为 `401 Unauthorized`，说明服务器已能识别请求体格式，但认证未通过（缺少 Cookie 或 Cookie 值不对）。
- 从 `bloxd-script.js` 反编译出的关键逻辑：
  - Social URL 仍为 `https://social{id}.bloxd.io/social/{endpoint}`（生产环境）。
  - 外层 Avro Schema：`{metricsCookies: map<string>, contents: bytes}`。
  - `bloxd-matchmake` 的 `contents` 字段为 bytes，里面再按具体端点 Schema 编码。
  - 请求体是外层 Avro 二进制字节的 **Base64 字符串**。
  - 浏览器请求函数 `Sw.d` 还会自动带上浏览器 Cookie。

### 现有代码问题
- `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`:
  - `socialRequest` 用 `JSON.stringify` 构造请求体，未使用 Avro。
  - `HEADERS` 里没有 `Cookie`。
  - 没有保存/使用浏览器返回的 `bb_u_id`、`bb_u_h_init` 等 Cookie。
- `d:\codex\bloxdtranslationlayer\index.js`:
  - `queue()` 调用 `socialRequest('bloxd-matchmake', requestData)`，数据字段正确，但依赖 `socialRequest` 的编码/认证。
- `d:\codex\bloxdtranslationlayer\bloxd\friends.js` / `party.js` 等:
  - 都复用 `socialRequest`，修复后会一并受益。

## 计划步骤

### 步骤 1：浏览器抓包确认真实请求格式
**目标**：获取浏览器端 `bloxd-matchmake` 的精确 Request Payload、Headers、Cookie。

**操作**：
1. 在浏览器打开 `https://bloxd.io` 并确保 Tampermonkey 脚本运行。
2. 打开 Chrome DevTools → Network → 过滤 `bloxd-matchmake`。
3. 点击任意游戏模式（如 SkyWars）触发匹配。
4. 右键该请求 → Copy → Copy as cURL (bash)，把结果贴到本对话。
5. 同时记录：
   - Request Headers（尤其是 `Cookie`、`Content-Type`）。
   - Request Payload（是 JSON 对象、Base64 字符串还是原始二进制）。
   - Response Headers 和 Response Body。

**责任人**：用户。

### 步骤 2：实现 Cookie 管理与保存
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

**操作**：
1. 在 `gen3PSIDMCPP` 中捕获 `metrics/cookies` 响应的 `Set-Cookie` 头，解析出：
   - `bb_u_id`
   - `bb_u_h_init`
   - 其他可能需要的 Cookie。
2. 新增 `exports.cookies` 对象保存这些值，并在 `checkLogin` 时从 `login.json` 恢复。
3. `login.json` 结构扩展为：
   ```json
   {
     "3PSIDMC": "...",
     "trafficCode": "...",
     "expireTime": 1234567890,
     "cookies": {
       "bb_u_id": "...",
       "bb_u_h_init": "..."
     }
   }
   ```
4. 保留向后兼容：旧格式没有 `cookies` 字段时回退到空对象。

### 步骤 3：实现 Social API 的 Avro 编码/解码
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

**操作**：
1. 引入 `avsc`：
   ```javascript
   const { Type } = require('avsc');
   ```
2. 定义外层 Wrapper Schema：
   ```javascript
   const SocialWrapperSchema = Type.forSchema({
     type: 'record',
     name: 'SocialRequest',
     fields: [
       { name: 'metricsCookies', type: { type: 'map', values: 'string' } },
       { name: 'contents', type: 'bytes' }
     ]
   });
   ```
3. 定义各端点的 Contents Schema（根据抓包/JS 分析结果调整）：
   - `bloxd-matchmake`：
     ```javascript
     {
       type: 'record',
       fields: [
         { name: 'gameNameWithVariation', type: 'string' },
         { name: 'lobbyNameOrDiscordContext', type: ['null', 'string'], default: null },
         { name: 'languages', type: { type: 'array', items: 'string' } }
       ]
     }
     ```
   - 其他端点（`get-social-information`、`send-friend-request` 等）按需补充。
4. 新增辅助函数 `encodeSocialRequest(endpoint, contentsData)`：
   - 用对应端点 Schema 把 `contentsData` 编码为 `Buffer`。
   - 用 `SocialWrapperSchema.toBuffer({metricsCookies, contents})` 得到外层二进制。
   - 返回 Base64 字符串。
5. 新增 `decodeSocialResponse(buffer, endpoint)`：
   - 若响应是 JSON（如错误信息），直接 `JSON.parse`。
   - 若响应是二进制/Avro，用对应端点的 Response Schema 解码。
   - 先做容错：如果 JSON 解析成功就用 JSON，否则尝试 Avro。

### 步骤 4：重写 `socialRequest`
**文件**：`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

**操作**：
1. 构造 `Cookie` 头：
   ```javascript
   const cookies = [
     `___Secure-3PSIDMC=${exports.metrics['3PSIDMC']}`,
     `___Secure-3PSIDMCPP=${exports.metrics['3PSIDMCPP']}`,
     exports.cookies.bb_u_id ? `bb_u_id=${exports.cookies.bb_u_id}` : '',
     exports.cookies.bb_u_h_init ? `bb_u_h_init=${exports.cookies.bb_u_h_init}` : ''
   ].filter(Boolean).join('; ');
   ```
2. 根据抓包结果选择发送方式：
   - **方案 A（Avro + Base64 字符串体）**：
     - `Content-Type` 保持 `application/json` 或按抓包改为 `text/plain`。
     - `body` 为 `encodeSocialRequest(url, data)` 返回的 Base64 字符串。
   - **方案 B（Avro + JSON 包装）**：
     - `body` 为 `JSON.stringify({metricsCookies, contents: base64InnerAvro})`。
   - 实际采用哪种以浏览器抓包为准；目前证据更偏向 **方案 A**。
3. 返回的 Response 统一包装：
   - 保留 `.ok`、`.status`、`.statusText`。
   - `.text()` 和 `.json()` 在内部根据 Content-Type 决定解码方式。

### 步骤 5：更新 `index.js` 的 `queue` 函数
**文件**：`d:\codex\bloxdtranslationlayer\index.js`

**操作**：
1. 保持 `requestData` 字段不变：
   ```javascript
   {
     gameNameWithVariation: gamemode ?? 'skywars',
     lobbyNameOrDiscordContext: roomId ?? '',
     languages: languages
   }
   ```
2. 把 `lobbyNameOrDiscordContext: ''` 改为 `null` 当未指定时，避免空字符串导致 Avro 编码异常或服务器校验失败。
3. 保留现有重试/Unauthorized 处理逻辑。

### 步骤 6：清理调试文件
**操作**：
- 删除为排查创建的临时文件：
  - `d:\codex\bloxdtranslationlayer\analyze-script.js`
  - `d:\codex\bloxdtranslationlayer\analyze-output.txt`
  - `d:\codex\bloxdtranslationlayer\test-queue.js`
  - `d:\codex\bloxdtranslationlayer\test-queue2.js`
  - `d:\codex\bloxdtranslationlayer\test-queue3.js`
  - `d:\codex\bloxdtranslationlayer\test-queue4.js`
  - `d:\codex\bloxdtranslationlayer\test-queue5.js`
  - `d:\codex\bloxdtranslationlayer\test-queue6.js`
  - `d:\codex\bloxdtranslationlayer\test-queue7.js`
  - `d:\codex\bloxdtranslationlayer\test-cookies.js`
- 若需要保留回归测试，可把最终测试脚本合并为 `test-social-request.js`。

### 步骤 7：验证
**操作**：
1. 删除旧的 `login.json`，重新运行 `node index.js`，按提示加载 Tampermonkey 脚本完成登录。
2. Minecraft 1.8.9 客户端连接 `localhost`。
3. 执行 `/play skywars`：
   - 期望：`Queue request` 返回 200，随后输出 `Connecting to wss://...`。
   - 若仍 400/401，打印请求体、Cookie、响应体到控制台继续排查。
4. 验证 `friends.js` 的社交数据仍能正常刷新，不回归之前的 `TypeError` 修复。

## 假设与决策

1. **请求格式假设**：基于 `bloxd-script.js` 反编译，Social API 请求体已改为 Avro 二进制 + Base64。最终编码细节（外层是 JSON 包装还是纯 Base64 字符串）以浏览器抓包为准。
2. **Cookie 假设**：`___Secure-3PSIDMC`、`___Secure-3PSIDMCPP` 以及 `bb_u_id`/`bb_u_h_init` 都是 Social 端点认证所必需。`bb_u_*` Cookie 由 Bloxd 主站设置，需从响应头捕获。
3. **不引入第三方库**：使用项目已有的 `avsc` 进行 Avro 编解码，不新增依赖。
4. **向后兼容**：`login.json` 扩展 `cookies` 字段；旧格式无该字段时正常运行但可能缺少部分 Cookie。
5. **最小改动范围**：只修改 `browser_info.js` 的 `socialRequest`/`gen3PSIDMCPP`/`checkLogin` 和 `index.js` 的 `queue`；其他调用 `socialRequest` 的模块（friends/party/handlers）不需要改动。

## 风险与回退

- **风险**：若浏览器抓包显示请求格式与当前 JS 分析不一致，需要重新调整 Schema。
- **回退**：保留 `socialRequest` 的 JSON 发送分支作为开关，若 Avro 仍失败可临时切回旧逻辑继续调试。
