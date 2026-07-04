# 修复 socialId 算法 — 从官方 bundle 提取真实算法

## 摘要

bloxd-matchmake 持续返回 400 Bad Request。已确认根因是 **socialId 算法与官方客户端不一致**：
- 我们的算法 + 真实浏览器 3PSIDMC → socialId = 6
- 官方客户端 + 同一 3PSIDMC → socialId = 22

同一 token 算出不同结果，证明我们的索引数组/模数/输入字段已过时。需从当前 bloxd.io 主 bundle 重新提取真实算法。

## 当前状态分析

### 已确认事实

1. **page-context fetch 能通过 TLS 检测**（版本 m/n 返回 400 而非 "Failed to fetch"）
2. **登录能成功**（版本 3g 验证 login response: 200）
3. **socialId 算法不匹配**（用户测试：我们算出 6，官方用 22）
4. **手工验算确认**：对官方抓包的真实 3PSIDMC，我们的算法确实算出 6
5. **bundle 频繁更新**（版本 557→760→761），索引数组极可能已变更
6. **本项目索引数组无来源文档**：`[95,16,46,198,195,196,132,72,201,215,26,113,110,77,25,73,210,241,239,54,109]` 没有任何注释说明来源

### 当前算法（错误）

`d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js` 第 427-435 行 + 第 600-604 行：
```javascript
function getRandomEntry(socialWhamm, start, length) {
    let result = 0, i = 0;
    if (socialWhamm.length > 0) {
        for (; i < socialWhamm.length; ) {
            result = (result << 5) - result + socialWhamm.charCodeAt(i++) | 0;
        }
    }
    return Math.abs(result) % (length - start) + start;
}

socialId = 1 + getRandomEntry([
    95, 16, 46, 198, 195, 196, 132,
    72, 201, 215, 26, 113, 110, 77,
    25, 73, 210, 241, 239, 54, 109
].map((ind) => exports.metrics['3PSIDMC'][ind]).join(''), 0, 24);
```

`d:\codex\bloxdtranslationlayer\tampermonkey.js` 第 76-92 行复制了同一错误算法。

## 提议的修改

### 阶段 1: 从官方 bundle 提取真实算法（研究阶段）

用 `mcp_fetch` 工具抓取 bloxd.io 主页 HTML，找到 main bundle URL，抓取 bundle 内容，搜索 hashCode 特征模式：

1. **抓取 bloxd.io 主页**：`https://bloxd.io/`（raw=true）
2. **从 HTML 提取 main bundle URL**：匹配 `src="/static/js/...main....js"` 模式
3. **抓取 main bundle**：`https://bloxd.io<bundle_path>`（max_length=1000000，可能需要分段抓取）
4. **搜索 hashCode 算法特征**：
   - `(t<<5)-t` 或 `<<5` 配合 `charCodeAt` 与 `|0`
   - 紧邻的大整数数组（元素值 0-250 之间，约 21 个元素）
   - 模数 `% N`
   - 传入哈希的 token 字段名（3PSIDMC / 3PSIDMCPP / 其他）
5. **用官方抓包的真实 token 验证**：用 `official-matchmake-req.network-request` 中的 3PSIDMC 代入新参数，确认算出 22

### 阶段 2: 更新代码（实施阶段）

#### 文件 1: `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`

更新第 600-604 行的 socialId 计算：
- 替换索引数组为新提取的真实索引
- 替换模数（如果变化）
- 替换输入 token 字段（如果用 3PSIDMCPP 而非 3PSIDMC）

#### 文件 2: `d:\codex\bloxdtranslationlayer\tampermonkey.js`

更新第 76-92 行的 `__getRandomEntry` 和 `__computeSocialId`：
- 同步使用新的索引数组、模数、输入字段
- 注意：helper 脚本注入到页面上下文，需要用 `var` 而非 `let`（已是这样）

#### 文件 3: `d:\codex\bloxdtranslationlayer\.trae\documents\fix-socialid-algorithm.md`

记录新算法的来源、索引数组、模数、验证结果，供未来维护参考。

### 阶段 3: 验证

1. 重启 Node（`node index.js`）
2. 更新 Tampermonkey 脚本（版本 o）
3. Ctrl+F5 刷新 bloxd.io，确认显示 "Connected! (v2026-07-03o)"
4. MC 1.8.9 连 localhost → /play skywars
5. Console 应显示：
   - `[BloxdProxy] Computed socialId: 22` ← 必须是 22
   - `[BloxdProxy] Matchmake response: 200` ← 成功

## 假设与决策

1. **假设**：hashCode 函数本身（Java String.hashCode，乘 31）仍然正确，只是索引数组/模数/输入字段变化
2. **假设**：bundle 中能找到 hashCode 特征模式（`<<5` + `charCodeAt` + `|0`）
3. **假设**：bundle 是 webpack 打包的，模块化但未深度混淆，能通过特征搜索定位
4. **决策**：优先用 `mcp_fetch` 自动抓取，避免用户手动操作
5. **决策**：如果 bundle 太大无法一次抓取，分段抓取并搜索关键片段
6. **决策**：如果搜索不到特征，回退到 sniffer 方案——在 Tampermonkey 脚本里 hook 官方 fetch，捕获官方 socialId 后直接使用（不依赖算法）

## 验证步骤

### 阶段 1 验证（算法提取）
- mcp_fetch 能抓取 bloxd.io 主页 HTML
- 能从 HTML 中提取 main bundle URL
- 能抓取 bundle 内容
- 能在 bundle 中搜索到 hashCode 特征
- 能提取索引数组、模数、输入字段
- 用官方真实 token 代入验算得 22

### 阶段 2 验证（代码更新）
- browser_info.js 和 tampermonkey.js 的算法同步更新
- 语法正确，无错误

### 阶段 3 验证（端到端）
- Node 控制台：`[*] Matchmake proxy response: status=200`
- Node 控制台：`[*] Connecting to wss://... : Lobby ... : skywars`
- MC 客户端成功进入游戏

## 风险与回退

- **风险**：bundle 深度混淆，搜索不到 hashCode 特征
  - 回退：用 sniffer 捕获官方 socialId，直接使用（不依赖算法）
- **风险**：bundle 太大，mcp_fetch 截断
  - 回退：用 start_index 分段抓取，或用 Grep 搜索特定片段
- **风险**：算法提取正确但仍 400
  - 回退：说明 socialId 不是唯一问题，继续诊断其他差异（如 MCPP 来源、headers 等）
