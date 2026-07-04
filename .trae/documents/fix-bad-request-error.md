# 修复计划：Queue Request Failed - Bad Request

## 问题分析

### 错误信息
```
Queue request failed: Bad Request
```

### 根本原因分析

经过代码探索，我发现了问题的根源：

#### 问题定位
**文件**: `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`
**位置**: 第 549-558 行的 `socialRequest` 函数

**当前代码**:
```javascript
exports.socialRequest = async function(url, data) {
	return await fetch(url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({
			contents: data,
			metricsCookies: exports.metrics  // ❌ 只发送了 metrics，缺少 matchmaking 数据
		})
	});
};
```

#### 为什么会返回 "Bad Request"？

1. **缺少必要字段**: `socialRequest` 函数只发送了 `contents` 和 `metricsCookies`，但缺少了 `matchmaking` 数据

2. **matchmaking 数据的重要性**:
   - 从 `client.js` 第 44-62 行可以看到，WebSocket 连接时需要完整的 `matchmaking` 对象
   - `matchmaking` 包含两个重要字段：
     - `trafficCode`: 用于验证的令牌
     - `compliance`: 合规性字符串

3. **数据流程**:
   - 启动时调用 `checkLogin()` (index.js 第 133 行)
   - 从 `login.json` 加载 `trafficCode` (browser_info.js 第 524 行)
   - 但 `socialRequest` 函数发送请求时没有包含这些数据

#### 对比正确的数据结构

**login.json 中的有效数据**:
```json
{
  "3PSIDMC": "...",
  "trafficCode": "ztJ9nmiMPMJ36O6FRM37314CiB3l3...",
  "expireTime": 1783690166656
}
```

**matchmaking 对象的定义** (browser_info.js 第 583-586 行):
```javascript
exports.matchmaking = {
	trafficCode: '',  // 启动时会从 login.json 加载
	compliance: genCompliance('bloxd') + '_' + genCompliance('bloxd') + '_non-eu_secure=true'
}
```

**client.js 中需要的数据** (第 44-62 行):
```javascript
wsClient.joinOrCreate(fetched.gameNameWithVariation, {
	generalCookies: {
		...metrics,
		...matchmaking  // ✅ 这里需要完整的 matchmaking 对象
	}
})
```

### 影响范围

- 无法连接到游戏服务器
- 每次 playerJoin 都会触发错误
- 用户无法进入游戏

## 解决方案

### 方案概述
修改 `socialRequest` 函数，使其在发送请求时包含完整的 `matchmaking` 数据。

### 具体修复步骤

#### 步骤 1：更新 socialRequest 函数

**文件**: `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js`
**位置**: 第 549-558 行

**当前代码**:
```javascript
exports.socialRequest = async function(url, data) {
	return await fetch(url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({
			contents: data,
			metricsCookies: exports.metrics
		})
	});
};
```

**修改为**:
```javascript
exports.socialRequest = async function(url, data) {
	return await fetch(url.includes('bloxd.io') ? url : `https://social${socialId}.bloxd.io/social/${url}`, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({
			contents: data,
			metricsCookies: exports.metrics,
			matchmaking: exports.matchmaking  // ✅ 添加 matchmaking 数据
		})
	});
};
```

#### 步骤 2：验证 trafficCode 是否正确加载

检查启动流程确保 `trafficCode` 正确加载：

1. `checkLogin()` 会从 `login.json` 加载 `trafficCode` (第 524 行)
2. 如果 `login.json` 不存在或 `expireTime` 已过期，会生成新的 token
3. 确保 `exports.matchmaking.trafficCode` 在发送请求前已正确设置

### 为什么这样修复？

1. **数据完整性**: 确保发送请求时包含所有必要的验证数据
2. **一致性**: 与 WebSocket 连接时使用的数据结构保持一致
3. **向后兼容**: 不改变其他逻辑，只添加缺失的字段
4. **符合协议**: Bloxd 服务器的 API 期望接收完整的 matchmaking 数据

### 验证步骤

修复后的验证：
1. 启动服务器，确认没有 "Bad Request" 错误
2. 测试连接游戏服务器：
   - 使用 Minecraft 1.8.9 客户端连接
   - 执行 `/play skywars` 命令
3. 检查日志输出，确认成功连接
4. 验证 trafficCode 是否正确加载：
   - 查看启动日志中的 "Logged in as" 消息
   - 确认没有 "Expired trafficCode" 警告

## 其他发现

### trafficCode 的作用

从代码分析来看，`trafficCode` 是一个关键的安全令牌：
- 用于防止滥用和未授权访问
- 需要通过 tampermonkey 脚本定期更新
- 有效期为 7 天（6048e5 毫秒 = 604800000ms = 7天）
- 如果过期，需要重新生成（browser_info.js 第 471 行）

### 相关错误处理

**文件**: `d:\codex\bloxdtranslationlayer\bloxd\types\kicks.js`

代码中已经定义了 trafficCode 相关的错误提示：
- 第 78-87 行：定义了 trafficCode 错误的详细说明
- 提示用户需要使用 tampermonkey 脚本

### 正确的数据结构

从 WebSocket 连接代码（client.js）可以看出，完整的请求应该包含：
- `metricsCookies`: 身份验证数据
- `matchmaking`: 包含 trafficCode 和 compliance
- `browserInfo`: 浏览器信息
- `languages`: 语言设置
- `version`: 版本号

## 实施计划

### 需要修改的文件
1. `d:\codex\bloxdtranslationlayer\bloxd\types\browser_info.js` (主要修复)

### 修改类型
- 添加缺失的数据字段
- 确保数据完整性
- 符合 API 协议要求

### 风险评估
- **低风险**: 只是添加缺失的字段，不改变现有逻辑
- **向后兼容**: 不影响其他功能
- **易于测试**: 可以立即验证修复效果

## 假设与决策

### 假设
1. Bloxd 服务器 API 要求请求包含 `matchmaking` 数据
2. `trafficCode` 是必需的验证字段
3. 当前 `socialRequest` 函数缺少这个字段导致 "Bad Request"

### 决策
1. 在 `socialRequest` 函数中添加 `matchmaking` 字段
2. 不修改其他验证逻辑
3. 保持现有错误处理机制

## 完成标准

修复完成后应该满足：
1. ✅ 没有 "Queue request failed: Bad Request" 错误
2. ✅ 可以成功连接游戏服务器
3. ✅ trafficCode 正确加载和使用
4. ✅ matchmaking 数据完整发送