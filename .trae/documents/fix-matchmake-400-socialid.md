# 修复 bloxd-matchmake 400 Bad Request — socialId 不匹配 + 完整代理方案

## 摘要

bloxd-matchmake 请求持续返回 400 Bad Request。经过 13 个版本的迭代调试，已确认：
- **TLS 指纹检测是真实存在的**（Node/curl 被 Cloudflare 拒绝）
- **page-context fetch（版本 m）能通过 TLS 检测**（返回 400 而非 "Failed to fetch"）
- **但仍返回 400**——根因是 **socialId 不匹配** + **MCPP 来源问题**

## 当前状态分析

### 已确认的事实

1. **官方客户端能成功 matchmake**（用户确认浏览器点击 Play 能正常进入游戏）
2. **版本 m（page-context fetch）返回 400**——请求到达服务器但被拒绝
3. **官方客户端用 `social22.bloxd.io`**（用户 curl 捕获）
4. **Node 端用 `social${socialId}.bloxd.io`，socialId 范围 1-17**（browser_info.js 第 17 行）
5. **Node 的 socialId 基于 guest 3PSIDMC 计算**（第 600-604 行），与浏览器账户的 3PSIDMC 不同
6. **官方 body 的 MCPP 与我们 login 获取的 MCPP 不同**（对比发现 `5ORdi` vs `5Ysdh`）

### 根本原因

**socialId 不匹配**：
- Node 端 `socialId = 1 + getRandomEntry([...].map(ind => exports.metrics['3PSIDMC'][ind]), 0, 24)`
- `exports.metrics['3PSIDMC']` 是 Node 生成的 **guest token**（如 `Gp_g4EdCGBM-78P...`）
- 但 body 中的 `3PSIDMC` 是**浏览器真实账户的 token**（如 `GV_g4EdCyaM-7TP...`）
- 两个不同账户的 token 算出不同的 socialId
- 服务器可能根据 3PSIDMC 路由到特定的 social 服务器，发到错误的服务器 → 400

**MCPP 不匹配**（次要问题）：
- 版本 3g/3h 用 login 获取的 MCPP，但 login 用的 SP 是 Node 的（虽然值相同，但服务器可能验证 MC/MCPP/SP 三元组关联性）
- 官方客户端用浏览器已有的 MCPP（可能是初始登录时签发的）

### 已尝试的方案

| 版本 | 方法 | 结果 | 原因 |
|------|------|------|------|
| Node fetch | 直接 Node 请求 | 400 | TLS 指纹被拒 |
| curl | 命令行 | 400 | TLS 指纹被拒 |
| 3b (GM_xmlhttpRequest) | 浏览器 TLS + Node SP + login MCPP | 400 | socialId 错误 |
| 3g (GM_xmlhttpRequest) | 浏览器 MC + login MCPP + 浏览器 langs | 400 | socialId 错误 + GM 不带浏览器头 |
| 3l (GM_xmlhttpRequest) | replay 官方 body | 400 | GM 不带浏览器头 |
| 3m (page-context fetch) | 注入 helper + replay 官方 body | 400 | socialId 错误（用 Node 的 URL） |

## 提议的修改

### 核心思路

让 Tampermonkey 脚本**完全自主**完成 matchmake：
1. 从浏览器 cookie 读取真实 `3PSIDMC`
2. 用与 Node 相同的算法计算正确的 `socialId`
3. 用 `3PSIDMC` + Node 的 `3PSIDMCSP` 登录获取匹配的 `3PSIDMCPP`
4. 用 page-context fetch（原生 `window.fetch`）发送 matchmake 到正确的 `socialN.bloxd.io`

### 文件 1: `d:\codex\bloxdtranslationlayer\tampermonkey.js`

**完全重写**，关键改动：

1. **保留 page-context helper 注入**（版本 m 的方式）——用原生 `window.fetch` 绕过 TLS 指纹
2. **添加 socialId 计算逻辑**——从浏览器 `3PSIDMC` 计算，与 Node 端算法一致
3. **helper 中实现完整流程**：login → matchmake，全部用 page-context fetch
4. **不再依赖 sniffer**——主动构造请求，不依赖用户点击 Play
5. **保留 sniffer**仅用于诊断（可选）

helper 脚本（注入到页面上下文）需要包含：
```javascript
// socialId 计算函数（复制自 browser_info.js）
function getRandomEntry(socialWhamm, start, length) {
    let result = 0, i = 0;
    if (socialWhamm.length > 0) {
        for (; i < socialWhamm.length;) {
            result = (result << 5) - result + socialWhamm.charCodeAt(i++) | 0;
        }
    }
    return Math.abs(result) % (length - start) + start;
}

function computeSocialId(mc) {
    return 1 + getRandomEntry([
        95, 16, 46, 198, 195, 196, 132,
        72, 201, 215, 26, 113, 110, 77,
        25, 73, 210, 241, 239, 54, 109
    ].map((ind) => mc[ind]).join(''), 0, 24);
}
```

helper 的 `doMatchmake` 函数流程：
1. 读取 `document.cookie` 中的 `___Secure-3PSIDMC`
2. 计算 `socialId = computeSocialId(mc)`
3. 构造 `matchmakeUrl = https://social${socialId}.bloxd.io/social/bloxd-matchmake`
4. 用 page-context fetch 登录 `https://bloxd.io/index/metrics/cookies` 获取 `3PSIDMCPP`
5. 用 page-context fetch 发送 matchmake 请求

### 文件 2: `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

**无需修改 socialRequest 代理逻辑**——仍通过 WebSocket 发送 matchmake 请求到 Tampermonkey。

但需要修改发送给 Tampermonkey 的消息：**不再发送 matchmakeUrl**（因为 URL 中的 socialId 是错的），改为只发送 `gameNameWithVariation`、`languages`、`sp`，让 Tampermonkey 自己计算 URL。

具体改动（第 636-642 行）：
```javascript
lSocket.send(JSON.stringify({
    type: 'matchmake',
    id: id,
    // 不再发送 matchmakeUrl —— Tampermonkey 会用浏览器 3PSIDMC 计算正确的 socialId
    gameNameWithVariation: data?.gameNameWithVariation,
    languages: data?.languages,
    sp: exports.metrics['3PSIDMCSP']
}));
```

### 文件 3: `d:\codex\bloxdtranslationlayer\index.js`

**无需修改**。queue/connect 函数已经能正确处理代理返回的响应。

## 假设与决策

1. **假设**：服务器根据 3PSIDMC 路由到特定的 social 服务器。发到错误 social 服务器的请求会被拒绝（400）。
2. **假设**：page-context fetch（版本 m 验证）能通过 Cloudflare TLS 指纹检测。
3. **假设**：用浏览器 3PSIDMC + Node 3PSIDMCSP 登录能获取匹配的 3PSIDMCPP（版本 3g 验证 login 能成功）。
4. **决策**：不再用 sniffer replay 模式——太依赖用户手动操作，且可能 MCPP 已被消费。改为主动构造请求。
5. **决策**：保留 page-context helper 注入方式（版本 m 验证可行），而非 GM_xmlhttpRequest（缺少浏览器安全头）。

## 验证步骤

1. 更新 Tampermonkey 脚本（版本 n）
2. Ctrl+F5 刷新 bloxd.io，确认显示 "Connected! (v2026-07-03n)"
3. F12 Console 确认看到：
   - `[BloxdProxy] Helper initialized`
   - `[BloxdComm] Page-context helper ready`
4. MC 1.8.9 连接 localhost → `/play skywars`
5. Console 应显示：
   - `[BloxdProxy] Browser 3PSIDMC: GV_g...`
   - `[BloxdProxy] Computed socialId: 22`（或其他 1-24 的数字）
   - `[BloxdProxy] Login response: 200`
   - `[BloxdProxy] Got 3PSIDMCPP: ztJ9...`
   - `[BloxdProxy] Matchmake URL: https://social22.bloxd.io/social/bloxd-matchmake`
   - `[BloxdProxy] Matchmake response: 200` ← 成功标志
6. Node 控制台应显示：
   - `[*] Matchmake proxy response: status=200`
   - `[*] Connecting to wss://... : Lobby ... : skywars`

如果仍然 400，检查 Console 中 `Computed socialId` 是否与官方 curl 的 `social22` 一致。如果不一致，说明 socialId 算法有误，需要进一步调试。
