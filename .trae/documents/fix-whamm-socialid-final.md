# 修复 socialId 算法 — 使用 login response 的 whamm（最终方案）

## 摘要

bloxd-matchmake 返回 400 "Request rejected"。根因确认：**socialId 算法输入错误**。

项目使用 `3PSIDMC[21个索引字符].join('')` 作为 hashCode 输入，但官方使用 **login response 返回的 `whamm` 字段**。

从官方 bundle 分析：
- Login response 包含 `whamm` 字段（21字符字符串）
- socialId = `Object.keys(socialServerPorts)[hashCode(whamm, 0, 29)]`
- socialServerPorts keys = `[1, 2, ..., 29]`（29个服务器）

## Phase 1 探索发现

### 1. Login response 包含 `whamm` 字段

Bundle 中三个 login endpoint 的 response destructuring：

**Offset 1290814** (`/index/metrics/cookies`):
```javascript
{anonymizedAccountInfo:Eb,name:yb,cosmetics:mP,isEduTeacher:jP,availableUserContextTypes:gb,"3PSIDMCPP":Kb,whamm:tb,ranks:qb,...}
```

**Offset 1293636** (`/index/discord/login`):
```javascript
{anonymizedAccountInfo:Eb,name:yb,cosmetics:mP,ranks:jP,isEduTeacher:gb,availableUserContextTypes:Kb,guilds:tb,"3PSIDMCPP":qb,whamm:Ab,error:lb,...}
```

**Offset 1296761** (`/index/crazy-games/login`):
```javascript
{accountInfo:Hb,name:Eb,cosmetics:yb,ranks:mP,isEduTeacher:jP,availableUserContextTypes:gb,"3PSIDMCPP":Kb,whamm:tb,error:qb,...}
```

**结论**：登录成功后，server 返回 `whamm` 字段，直接使用即可。

### 2. socialServerPorts 的完整定义

**Offset 308842** (module 138):
```javascript
socialServerPorts: {1:6585,2:6586,3:6587,4:6588,5:6589,6:6590,7:6591,8:6592,9:6593,10:6594,11:6595,12:6596,13:6597,14:6598,15:6599,16:6600,17:6601,18:6602,19:6603,20:6604,21:6605,22:6606,23:6607,24:6608,25:6609,26:6610,27:6611,28:6612,29:6613}
```

生产环境有 **29 个 social server**，keys 为 `[1, 2, ..., 29]`。

### 3. socialId 算法的完整链条

#### Step 1: hashCode 函数（module 651，function `gb`）
**Offset 271854**:
```javascript
function gb(bb,Pb,xb){if(Pb===xb)return Pb;let Mb=0,Jb=0;if(bb.length>0)for(;Jb<bb.length;)Mb=(Mb<<5)-Mb+bb.charCodeAt(Jb++)|0;return Math.abs(Mb)%(xb-Pb)+Pb}
```
这是 Java String.hashCode（乘 31，`<<5` 模式），与项目中 `getRandomEntry` 函数逻辑相同。

#### Step 2: Kb 函数（module 649，socialId resolver）
**Offset 325310**:
```javascript
function Kb(bb){const Pb=Object.keys(Jb.i.socialServerPorts).map((bb=>Number(bb)));return Pb[(0,Mb.q)(bb,0,Pb.length)]}
```
- `bb` = `whamm`（输入字符串）
- `Pb` = `[1, 2, ..., 29]`（Object.keys 后 map Number）
- `(0,Mb.q)(bb, 0, Pb.length)` = hashCode(whamm, 0, 29) → 返回索引 `[0, 28]`
- `Pb[index]` = socialId `[1, 29]`

#### Step 3: makeSocialApiRequest 使用流程
**Offset 1147973**:
```javascript
const jP=(0,Mb.s)(Pb.whamm),gb=yb.e.getSocialUrl(jP),Kb=await(0,Jb.n)("".concat(gb).concat(bb),xb,Hb,Pb.getMetricsCookies());
```
- `(0,Mb.s)(Pb.whamm)` = Kb(Pb.whamm) = socialId
- `getSocialUrl(jP)` = `https://social${jP}.bloxd.io`
- 发送请求到 `https://social${socialId}.bloxd.io/social/${endpoint}`

#### Step 4: oP class constructor（UserContext）
**Offset 1281879**:
```javascript
this.whamm=null!==mP&&void 0!==mP?mP:(0,Jb.gb)(this.metricsCookies)
```
- `mP` = login response 返回的 `whamm`
- 如果 server 返回了 `whamm`，直接使用
- 如果没有，用 `(0,Jb.gb)(this.metricsCookies)` 计算（fallback，很少触发）

### 4. 当前代码的错误

**tampermonkey.js** 第 86-92 行：
```javascript
function __computeSocialId(mc) {
    return 1 + __getRandomEntry([
        95, 16, 46, 198, 195, 196, 132,
        72, 201, 215, 26, 113, 110, 77,
        25, 73, 210, 241, 239, 54, 109
    ].map(function(ind) { return mc[ind]; }).join(''), 0, 24);
}
```
- 输入错误：用 `mc`（3PSIDMC）而非 `whamm`
- 算法错误：用 21 元素索引数组 + 模数 24，而非 `[1,...,29]`
- Login 流程没有提取 `whamm`（第 139 行只提取了 `name` 和 `3PSIDMCPP`）

### 5. 正确算法（JavaScript）

```javascript
function computeSocialId(whamm) {
    // hashCode: Java String.hashCode (乘 31)
    let hash = 0, i = 0;
    if (whamm.length > 0) {
        for (; i < whamm.length;) {
            hash = (hash << 5) - hash + whamm.charCodeAt(i++) | 0;
        }
    }
    // socialServerPortsKeys = [1, 2, ..., 29]
    // index = Math.abs(hash) % 29 (range: 0-28)
    // socialId = keys[index] (range: 1-29)
    const keys = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29];
    return keys[Math.abs(hash) % keys.length];
}
```

## Phase 2 提议修改

### 文件 1: `d:\codex\bloxdtranslationlayer\tampermonkey.js`

**修改点 1：替换 `__computeSocialId` 函数（第 86-92 行）**

Old:
```javascript
function __computeSocialId(mc) {
    return 1 + __getRandomEntry([
        95, 16, 46, 198, 195, 196, 132,
        72, 201, 215, 26, 113, 110, 77,
        25, 73, 210, 241, 239, 54, 109
    ].map(function(ind) { return mc[ind]; }).join(''), 0, 24);
}
```

New:
```javascript
function __computeSocialIdFromWhamm(whamm) {
    // hashCode: Java String.hashCode (乘 31)
    let hash = 0, i = 0;
    if (whamm.length > 0) {
        for (; i < whamm.length;) {
            hash = (hash << 5) - hash + whamm.charCodeAt(i++) | 0;
        }
    }
    // socialServerPortsKeys = [1, 2, ..., 29]
    const keys = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29];
    return keys[Math.abs(hash) % keys.length];
}
```

**修改点 2：Login 流程提取 `whamm`（第 139-142 行）**

Old:
```javascript
}).then(function(loginData) {
    if (!loginData) return;
    log('Login OK, name=' + loginData.name + ', got 3PSIDMCPP:', loginData['3PSIDMCPP'].substring(0, 30) + '...');
```

New:
```javascript
}).then(function(loginData) {
    if (!loginData) return;
    var whamm = loginData.whamm;
    if (!whamm) {
        callback({error: 'Login response missing whamm field. Server may have changed API.'});
        return;
    }
    log('Login OK, name=' + loginData.name + ', whamm=' + whamm.substring(0, 15) + '..., got 3PSIDMCPP:', loginData['3PSIDMCPP'].substring(0, 30) + '...');
```

**修改点 3：用 `whamm` 计算 socialId（第 115-118 行）**

Old:
```javascript
var socialId = __computeSocialId(mc);
var matchmakeUrl = 'https://social' + socialId + '.bloxd.io/social/bloxd-matchmake';
log('Computed socialId:', socialId);
log('Matchmake URL:', matchmakeUrl);
```

New:
```javascript
var socialId = __computeSocialIdFromWhamm(whamm);
var matchmakeUrl = 'https://social' + socialId + '.bloxd.io/social/bloxd-matchmake';
log('Computed socialId from whamm:', socialId);
log('Matchmake URL:', matchmakeUrl);
```

**修改点 4：移除无用的 `__getRandomEntry` 函数（第 76-84 行）**

删除整个 `__getRandomEntry` 函数，不再需要。

**修改点 5：更新版本号（第 4 行）**

Old: `// @version      2026-07-03n`
New: `// @version      2026-07-03o`

**修改点 6：更新连接消息（第 242-243 行）**

Old:
```javascript
status.textContent = 'Bloxd Communication Script Status: Connected! (v2026-07-03n)';
console.log('[BloxdComm] WebSocket connected, script version 2026-07-03n (CORRECT SOCIALID)');
```

New:
```javascript
status.textContent = 'Bloxd Communication Script Status: Connected! (v2026-07-03o)';
console.log('[BloxdComm] WebSocket connected, script version 2026-07-03o (USE WHAMM FROM LOGIN)');
```

### 文件 2: `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

**修改点 1：替换 socialId 计算（第 600-604 行）**

Old:
```javascript
socialId = 1 + getRandomEntry([
    95, 16, 46, 198, 195, 196, 132,
    72, 201, 215, 26, 113, 110, 77,
    25, 73, 210, 241, 239, 54, 109
].map((ind) => exports.metrics['3PSIDMC'][ind]).join(''), 0, 24);
```

New:
```javascript
// NOTE: socialId is now computed in tampermonkey.js from login response's whamm field.
// This fallback is only used when Tampermonkey is not connected.
// We keep a placeholder value (1) since Node fetch will get 400 from TLS fingerprint anyway.
socialId = 1;
```

**说明**：Node.js 端不再计算 socialId，因为：
1. Login response 的 `whamm` 只在 browser proxy 中可用
2. Node fetch 会触发 Cloudflare TLS 检测，返回 400
3. 实际 matchmake 都通过 Tampermonkey proxy，那里的 socialId 是正确的

**修改点 2：添加注释说明算法已废弃（第 420-435 行附近）**

在 `getRandomEntry` 函数前添加注释：
```javascript
/**
 * DEPRECATED: This function is no longer used for socialId computation.
 * The correct algorithm uses login response's `whamm` field, computed in tampermonkey.js.
 * This function is kept for potential future use or other hashCode needs.
 */
```

### 文件 3: `d:\codex\bloxdtranslationlayer\.trae\documents\fix-whamm-socialid-final.md`

（此文件）记录完整发现和修改方案。

## Phase 3 验证步骤

### 验证 1：算法验算

用 bundle 中的 hashCode 函数，对任意 21字符字符串验算：
- 输入: `"abc...xyz"`（21字符）
- hashCode 输出: `[0, 28]` 范围索引
- socialId: `[1, 29]`

### 验证 2：端到端测试

1. 重启 Node: `node index.js`
2. 更新 Tampermonkey 脚本到版本 o
3. Ctrl+F5 刷新 bloxd.io，确认显示 "Connected! (v2026-07-03o)"
4. MC 1.8.9 连 localhost → `/play skywars`
5. Browser console 应显示：
   ```
   [BloxdProxy] Login OK, name=..., whamm=..., got 3PSIDMCPP: ...
   [BloxdProxy] Computed socialId from whamm: 22  ← 或其他 1-29 的值
   [BloxdProxy] Matchmake response: 200
   ```
6. Node console 应显示：
   ```
   [*] Matchmake proxy response: status=200
   [*] Connecting to wss://... : Lobby ... : skywars
   ```

### 验证 3：成功标志

- MC 客户端成功进入 Skywars 游戏
- Browser console 无 400 错误
- Node console 显示 "Connecting to wss://..."

## 假设与决策

1. **假设**：Login response 总是返回 `whamm` 字段
   - 证据：bundle 中三个 login endpoint 都有 `whamm:XX` destructuring
   - 决策：直接使用 login response 的 `whamm`，不实现 fallback 计算

2. **假设**：hashCode 函数（Java String.hashCode）未变
   - 证据：bundle 中 `gb` 函数与项目中 `getRandomEntry` 逻辑完全一致
   - 决策：保留 hashCode 实现，只替换输入和 lookup 数组

3. **假设**：socialServerPorts 有 29 个 server
   - 证据：bundle 中 `{1:6585,...,29:6613}` 对象
   - 决策：使用 `[1,...,29]` 作为 lookup 数组

4. **决策**：不在 Node.js 端实现正确算法
   - 原因：Node fetch 会触发 TLS fingerprint → 400
   - 实际 matchmake 通过 Tampermonkey proxy，那里有正确的 socialId

5. **决策**：不移除 `getRandomEntry` 函数
   - 原因：可能其他地方用到 hashCode（如 party code）
   - 只废弃 socialId 相关调用

## 风险与回退

- **风险**：Login response 不返回 `whamm`（罕见情况）
  - 回退：在 tampermonkey.js 添加检查，提示 "Server API changed"

- **风险**：算法正确但仍 400（其他原因）
  - 回退：对比官方抓包的其他差异（headers、body structure）

- **风险**：socialServerPorts 数量变化（bundle 更新）
  - 回退：定期检查 bundle，更新 keys 数组

## 来源引用

- Bundle 文件: `d:\codex\bloxdtranslationlayer\ju7fs.main.a3ef6281.js`
- 关键 offset:
  - Login response whamm: 1290814, 1293636, 1296761
  - socialServerPorts 定义: 308842
  - hashCode `gb`: 271854
  - socialId resolver `Kb`: 325310
  - makeSocialApiRequest: 1147973
  - oP constructor: 1281879