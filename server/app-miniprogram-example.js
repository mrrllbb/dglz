// 微型小程序WebSocket服务器示例
// 此文件展示如何将现有的Socket.IO服务器改写为WebSocket服务器

const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')
const WebSocket = require('ws')
const cookie = require('cookie')
const fs = require('fs')
const hb = require('handlebars')
const path = require('path')
const qs = require('querystring')
const _ = require('lodash')

// Express应用设置
const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// 中间件
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// 游戏状态
const gameState = {
  IN_PROGRESS: 0,
  TEAM_ONE_WON: 1,
  TEAM_TWO_WON: 2,
}

let numDecks = 0
let game = null
let tributes = null
let players = [] // 玩家名称数组
let uidToPlayer = new Map() // uid -> 用户名
let spectators = [] // 旁观者UID数组
let clients = new Map() // uid -> WebSocket连接

const port = process.env.PORT || 8000

// ==================== WebSocket 处理 ====================

wss.on('connection', (ws) => {
  let uid = null
  ws.isAlive = true

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)
      uid = data.uid

      if (!uid) {
        sendError(ws, '无效的用户ID')
        return
      }

      // 保存连接
      clients.set(uid, ws)

      // 处理不同类型的消息
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
          handleGameMessage(uid, data.message)
          break
        default:
          console.warn(`未知的消息类型: ${data.type}`)
      }
    } catch (err) {
      console.error('处理WebSocket消息错误:', err)
      sendError(ws, '消息处理错误')
    }
  })

  ws.on('close', () => {
    if (uid) {
      console.log(`用户 ${uid} 断开连接`)
      clients.delete(uid)
    }
  })

  ws.on('error', (err) => {
    console.error('WebSocket错误:', err)
  })
})

// 心跳检测
setInterval(() => {
  clients.forEach((ws, uid) => {
    if (ws.isAlive === false) {
      console.log(`用户 ${uid} 心跳超时，关闭连接`)
      clients.delete(uid)
      ws.terminate()
    } else {
      ws.isAlive = false
      ws.ping()
    }
  })
}, 30000)

// ==================== 游戏消息处理 ====================

function handleCheck(uid, data) {
  if (!isPlayer(uid)) {
    sendToUser(uid, { type: 'check error', err: '无效的用户ID' })
    return
  }

  const username = uidToPlayer.get(uid)
  const playedHand = data.playedHand

  if (tributes) {
    try {
      game.validateTribute(username, playedHand)
      sendToUser(uid, { type: 'check ok' })
    } catch (err) {
      sendToUser(uid, { 
        type: 'check error', 
        err: err.message 
      })
    }
  } else {
    try {
      const currentPlay = game.validate(username, playedHand)
      sendToUser(uid, {
        type: 'check ok',
        isPassOk: game.isPassOk(),
        onlyPassOk: currentPlay.play === 0 // PASS
      })
    } catch (err) {
      sendToUser(uid, {
        type: 'check error',
        isPassOk: game.isPassOk(),
        err: err.message
      })
    }
  }
}

function handlePlay(uid, data) {
  if (!isPlayer(uid)) {
    broadcastError('非法的用户尝试出牌')
    return
  }

  try {
    const username = uidToPlayer.get(uid)
    const playedHand = data.playedHand
    const result = game.advance(username, playedHand)

    if (result.state !== gameState.IN_PROGRESS) {
      broadcastToAll({ type: 'game over' })
      return
    }

    // 更新所有玩家的游戏状态
    broadcastUpdate()
  } catch (err) {
    console.error('出牌错误:', err)
    broadcastError(err.message)
  }
}

function handleSendCard(uid, data) {
  if (!isPlayer(uid)) {
    broadcastError('非法的用户尝试发送卡牌')
    return
  }

  try {
    const username = uidToPlayer.get(uid)
    const selectedCards = data.selectedCards
    const result = game.sendTribute(username, selectedCards)

    // 更新出牌此尝试该玩家的手牌
    if (result && result.receiverUid) {
      sendToUser(result.receiverUid, {
        type: 'update',
        gameHand: result.newHand
      })
    }

    // 广播更新给所有玩家
    broadcastUpdate()

    // 检查所有贡献是否已完成
    let allTributesComplete = true
    for (let t of tributes) {
      if (!t.hasOwnProperty('giverSent') || !t.hasOwnProperty('receiverSent')) {
        allTributesComplete = false
        break
      }
    }

    if (allTributesComplete) {
      tributes = null
      // 发送贡献摘要
      const tributeStrings = []
      for (let t of tributes) {
        tributeStrings.push(`${t.giver} sent ${t.receiver} a card`)
        tributeStrings.push(`${t.receiver} returned ${t.giver} a card`)
      }
      broadcastToAll({
        type: 'tribute summary',
        tributes: tributeStrings
      })
    }
  } catch (err) {
    console.error('发送贡献卡牌错误:', err)
    broadcastError(err.message)
  }
}

function handleGetUpdate(uid, data) {
  sendGameUpdate(uid)
}

function handleGameMessage(uid, message) {
  if (message === 'play again') {
    try {
      tributes = game.getTributes()
      game = createGame()
      broadcastToAll({ type: 'reload' })
    } catch (err) {
      broadcastError(err.message)
    }
  } else if (message === 'exit') {
    resetAllState()
    broadcastToAll({ type: 'reload' })
  }
}

// ==================== HTTP 端点 ====================

app.get('/players', (req, res) => {
  res.status(200).json({
    players: players,
    gameInProgress: game !== null
  })
})

app.get('/game-state', (req, res) => {
  const uid = parseCookie(req) || (req.query && parseInt(req.query.uid))
  
  if (!uid || !isPlayer(uid)) {
    return res.status(403).json({ error: 'Not a player' })
  }

  if (!game) {
    return res.status(400).json({ error: 'No game in progress' })
  }

  const username = uidToPlayer.get(uid)
  const player = game.gamePlayers.find(p => p.username === username)
  const currentPlayerIndex = game.currentPlayer || 0
  
  const gameState = {
    type: 'update',
    gamePlayers: game.gamePlayers,
    currentPlayer: currentPlayerIndex,
    lastPlayCards: game.previousPlayedHand || [],
    spectators: spectators.length,
    myHand: player ? player.hand || [] : []
  }

  res.status(200).json(gameState)
})

app.post('/join', (req, res) => {
  if (game != null) {
    return res.status(403).json({ error: 'Cannot join a game in progress' })
  }

  const uid = parseCookie(req)
  if (isPlayer(uid)) {
    return res.status(400).json({ error: 'Player already in game' })
  }

  let newUid = uid >= 0 ? uid : createUid()
  
  if (isSpectator(newUid)) {
    spectators = spectators.filter(s => s !== newUid)
    broadcastToAll({ type: 'num spectators', numSpectators: spectators.length })
  }

  let username = 'user'
  if (req.body && req.body.username) {
    username = _.escape(req.body.username)
  }
  
  // 处理重名
  if (players.includes(username)) {
    let suffix = 1
    while (players.includes(username + suffix)) {
      suffix++
    }
    username += suffix
  }

  players.push(username)
  uidToPlayer.set(newUid, username)

  // 返回 JSON（不用 Set-Cookie，小程序会在本地存储 uid）
  res.status(200).json({ uid: newUid, username: username })

  broadcastToAll({ type: 'new player', username: username })
})

app.post('/spectate', (req, res) => {
  const uid = parseCookie(req)
  
  if (isSpectator(uid)) {
    return res.status(400).json({ error: 'Already spectating' })
  }

  let newUid = uid >= 0 ? uid : createUid()

  if (isPlayer(uid)) {
    const username = uidToPlayer.get(uid)
    players = players.filter(p => p !== username)
    uidToPlayer.delete(uid)
    broadcastToAll({ type: 'player left', username: username })
  }

  spectators.push(newUid)
  res.status(200).json({ uid: newUid })

  broadcastToAll({ type: 'num spectators', numSpectators: spectators.length })
})

app.post('/start', (req, res) => {
  if (game != null) {
    return res.status(400).json({ error: 'Game already in progress' })
  }

  // 优先从 body 读取 uid，否则从 Cookie 读取
  let uid = (req.body && req.body.uid) ? parseInt(req.body.uid) : parseCookie(req)
  
  if (!isPlayerOne(uid)) {
    return res.status(403).json({ error: 'Only player 1 can start the game' })
  }

  try {
    game = createGame()
    res.status(200).json({ message: 'Game started' })
    broadcastToAll({ type: 'game started' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/check', (req, res) => {
  // 检查出牌合法性（游戏操作暂时禁用，返回成功）
  res.status(200).json({ message: 'Check ok' })
})

app.post('/play', (req, res) => {
  // 出牌操作（暂时禁用，返回成功）
  res.status(200).json({ message: 'Play ok' })
})

app.post('/send-card', (req, res) => {
  // 发送贡献卡牌操作（暂时禁用，返回成功）
  res.status(200).json({ message: 'Send card ok' })
})

// ==================== 辅助函数 ====================

function parseCookie(req) {
  const cookies = cookie.parse(req.headers.cookie || '')
  return cookies.uid ? parseInt(cookies.uid) : -1
}

function isPlayer(uid) {
  return uidToPlayer.has(uid)
}

function isSpectator(uid) {
  return spectators.includes(uid)
}

function isPlayerOne(uid) {
  return isPlayer(uid) && uidToPlayer.get(uid) === players[0]
}

function createUid() {
  let uid = 0
  do {
    uid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
  } while (isPlayer(uid) || isSpectator(uid))
  return uid
}

function createGame() {
  if (players.length % 2 != 0) {
    throw new Error('Must have an even number of players')
  }
  // 这里应该实现完整的游戏创建逻辑
  // 为了简洁，这里省略了具体实现
  return {
    gamePlayers: players.map(p => ({ username: p })),
    currentPlayer: 0,
    previousPlayedHand: [],
    lastActions: new Array(players.length).fill(''),
    gameState: gameState.IN_PROGRESS
  }
}

function resetAllState() {
  game = null
  tributes = null
  players = []
  uidToPlayer = new Map()
  spectators = []
  numDecks = 0
}

// ==================== 消息发送函数 ====================

function sendToUser(uid, message) {
  const ws = clients.get(uid)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function broadcastToAll(message) {
  const data = JSON.stringify(message)
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })
}

function broadcastUpdate() {
  clients.forEach((ws, uid) => {
    if (ws.readyState === WebSocket.OPEN) {
      sendGameUpdate(uid)
    }
  })
}

function sendGameUpdate(uid) {
  if (!game) return

  const username = uidToPlayer.get(uid)
  const update = {
    type: 'update',
    requestUpdate: false,
    gamePlayers: game.gamePlayers,
    currentPlayer: game.currentPlayer,
    lastPlayCards: game.previousPlayedHand,
    spectators: spectators.length
  }

  if (username) {
    const player = game.gamePlayers.find(p => p.username === username)
    if (player) {
      update.myHand = player.hand || []
    }
  }

  sendToUser(uid, update)
}

function sendError(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }))
  }
}

function broadcastError(message) {
  broadcastToAll({ type: 'error', message })
}

// 启动服务器
server.listen(port, () => {
  console.log(`大怪路子服务器运行在 ws://localhost:${port}`)
  console.log(`支持小程序WebSocket连接`)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})

module.exports = { app, server, wss }
