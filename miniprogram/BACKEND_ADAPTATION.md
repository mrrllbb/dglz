# 微信小程序版本 - 后端适配指南

## 概述
本文档说明如何将现有的Node.js服务器适配为支持微信小程序的WebSocket连接。

## 主要改动

### 1. 安装必要的依赖包

```bash
npm install ws express body-parser cors
```

### 2. 修改服务器代码结构

原始代码使用HTTP + Socket.IO的方式：
- HTTP用于页面请求和POST操作
- Socket.IO用于实时通信

小程序版本需要：
- HTTP用于初始HTTP操作（加入、旁观、开始游戏等）
- WebSocket用于实时游戏通信（替代Socket.IO）

### 3. 关键改动点

#### 3.1 用户认证改为基于uid
```javascript
// 原始：使用cookie
// 新版：使用uid参数或消息头
const uid = req.headers['x-user-id'] || message.uid
```

#### 3.2 WebSocket消息格式
所有消息应该是JSON格式：
```javascript
{
  type: 'message_type',
  uid: user_id,
  data: {...}
}
```

#### 3.3 广播消息
使用WebSocket而不是Socket.IO：
```javascript
// 原始
io.emit('new player', {username: username})

// 新版
broadcastToAll({
  type: 'new player',
  username: username
})
```

### 4. 建议的服务器改进

创建文件 `server/app-miniprogram.js`：

```javascript
const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const WebSocket = require('ws')
const gameLogic = require('./gameLogic') // 提取游戏逻辑

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// 中间件
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// WebSocket连接管理
const clients = new Map() // uid -> WebSocket

wss.on('connection', (ws) => {
  let uid = null

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)
      uid = data.uid

      if (!uid) {
        ws.send(JSON.stringify({
          type: 'error',
          message: '无效的用户ID'
        }))
        return
      }

      clients.set(uid, ws)
      handleMessage(uid, data)
    } catch (err) {
      console.error('处理消息错误:', err)
    }
  })

  ws.on('close', () => {
    if (uid) {
      clients.delete(uid)
      // 处理用户离线
    }
  })

  ws.on('error', (err) => {
    console.error('WebSocket错误:', err)
  })
})

// HTTP端点（保持现有的POST操作）
app.post('/join', (req, res) => {
  // 保持原有逻辑
  res.json({ success: true })
})

app.post('/spectate', (req, res) => {
  // 保持原有逻辑
  res.json({ success: true })
})

app.post('/start', (req, res) => {
  // 保持原有逻辑
  res.json({ success: true })
})

// 广播消息给所有连接的客户端
function broadcastToAll(message) {
  const data = JSON.stringify(message)
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })
}

// 发送消息给特定用户
function sendToUser(uid, message) {
  const ws = clients.get(uid)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

// 处理来自客户端的消息
function handleMessage(uid, data) {
  switch (data.type) {
    case 'check':
      handleCheck(uid, data)
      break
    case 'play':
      handlePlay(uid, data)
      break
    case 'send card':
      handleSendCard(uid, data)
      break
    case 'get update':
      handleGetUpdate(uid, data)
      break
    case 'message':
      handleMessage(uid, data.message)
      break
  }
}

server.listen(8000, () => {
  console.log('服务器运行在 ws://localhost:8000')
})
```

### 5. 小程序服务器地址配置

在小程序中修改服务器地址：
```javascript
// miniprogram/app.js
globalData: {
  serverUrl: 'ws://your.server.com:8000'
  // 或使用环境变量
  // serverUrl: process.env.WX_SERVER_URL || 'ws://localhost:8000'
}
```

### 6. 注意事项

1. **HTTPS/WSS**: 微信小程序在生产环境中要求使用HTTPS和WSS（安全WebSocket）
2. **域名备案**: 服务器域名需要在微信公众平台配置和备案
3. **消息大小限制**: WebSocket单条消息大小限制为16MB
4. **连接保活**: 实现心跳机制保持连接活跃
5. **错误处理**: 实现重连机制处理网络中断

### 7. 推荐的生产环境部署

```javascript
// 生产环境配置
const wsProtocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws'
const serverHost = process.env.SERVER_HOST || 'localhost'
const serverPort = process.env.SERVER_PORT || 8000

// 心跳机制
setInterval(() => {
  clients.forEach((ws, uid) => {
    if (ws.isAlive === false) {
      clients.delete(uid)
      ws.terminate()
    } else {
      ws.isAlive = false
      ws.ping()
    }
  })
}, 30000)

ws.on('pong', () => {
  ws.isAlive = true
})
```

### 8. 测试WebSocket连接

```bash
# 使用wscat工具测试
npm install -g wscat
wscat -c ws://localhost:8000

# 发送测试消息
{"type":"init","uid":123}
```

## 总结

通过这些改动，原有的Web版游戏逻辑基本保持不变，只需要适配通信层从Socket.IO改为WebSocket，同时注意小程序特定的安全和限制要求。

更多信息请参考：
- [微信小程序WebSocket文档](https://developers.weixin.qq.com/miniprogram/dev/api/network/websocket/wx.connectWebSocket.html)
- [Node.js WebSocket库](https://github.com/websockets/ws)
