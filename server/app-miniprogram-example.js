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

// 多房间机制
const rooms = new Map() // roomId -> roomObj
const ROOM_TIMEOUT = 30 * 60 * 1000 // 30分钟无操作自动关闭

function createRoom(roomId) {
  const room = {
    roomId,
    numDecks: 0,
    game: null,
    tributes: null,
    players: [], // 玩家名称数组
    uidToPlayer: new Map(), // uid -> 用户名
    spectators: [], // 旁观者UID数组
    clients: new Map(), // uid -> WebSocket连接
    lastActive: Date.now(),
    timeoutTimer: null
  }
  // 启动超时自动销毁
  room.timeoutTimer = setTimeout(() => {
    rooms.delete(roomId)
  }, ROOM_TIMEOUT)
  rooms.set(roomId, room)
  return room
}

function getRoom(roomId) {
  return rooms.get(roomId)
}

function touchRoom(roomId) {
  const room = rooms.get(roomId)
  if (room) {
    room.lastActive = Date.now()
    if (room.timeoutTimer) clearTimeout(room.timeoutTimer)
    room.timeoutTimer = setTimeout(() => {
      rooms.delete(roomId)
    }, ROOM_TIMEOUT)
  }
}

const port = process.env.PORT || 8000

// ==================== WebSocket 处理 ====================

// WebSocket多房间支持
wss.on('connection', (ws) => {
  let uid = null;
  let roomId = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      uid = data.uid;
      roomId = data.roomId;

      if (!uid || !roomId) {
        sendError(ws, '无效的用户ID或房间号');
        return;
      }

      const room = getRoom(roomId);
      if (!room) {
        sendError(ws, '房间不存在');
        return;
      }

      // 保存连接到房间
      room.clients.set(uid, ws);

      // 处理不同类型的消息
      switch (data.type) {
        case 'check':
          handleCheckRoom(room, ws, data);
          break;
        case 'play':
          handlePlayRoom(room, ws, data);
          break;
        case 'sendCard':
          handleSendCardRoom(room, ws, data);
          break;
        case 'getUpdate':
          handleGetUpdateRoom(room, ws, data);
          break;
        case 'gameMessage':
          handleGameMessageRoom(room, ws, data);
          break;
        default:
          sendError(ws, `未知的消息类型: ${data.type}`);
      }
    } catch (err) {
      console.error('处理WebSocket消息错误:', err);
      sendError(ws, '消息处理错误');
    }
  });

  ws.on('close', () => {
    if (uid && roomId) {
      const room = getRoom(roomId);
      if (room) room.clients.delete(uid);
      console.log(`用户 ${uid} 断开连接 房间 ${roomId}`);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket错误:', err);
  })
})

// 心跳检测
setInterval(() => {
  rooms.forEach((room) => {
    room.clients.forEach((ws, uid) => {
      if (ws.isAlive === false) {
        console.log(`用户 ${uid} 心跳超时，关闭连接 房间 ${room.roomId}`)
        room.clients.delete(uid)
        ws.terminate()
      } else {
        ws.isAlive = false
        ws.ping()
      }
    })
  })
}, 30000)

// ==================== 游戏消息处理（多房间） ====================

function handleCheckRoom(room, uid, data) {
  if (!room.uidToPlayer.has(uid)) {
    sendToUserRoom(room, uid, { type: 'check error', err: '无效的用户ID' })
    return
  }
  const username = room.uidToPlayer.get(uid)
  const playedHand = data.playedHand
  if (room.tributes) {
    try {
      room.game.validateTribute(username, playedHand)
      sendToUserRoom(room, uid, { type: 'check ok' })
    } catch (err) {
      sendToUserRoom(room, uid, { type: 'check error', err: err.message })
    }
  } else {
    try {
      const currentPlay = room.game.validate(username, playedHand)
      sendToUserRoom(room, uid, {
        type: 'check ok',
        isPassOk: room.game.isPassOk(),
        onlyPassOk: currentPlay.play === 0 // PASS
      })
    } catch (err) {
      sendToUserRoom(room, uid, {
        type: 'check error',
        isPassOk: room.game.isPassOk(),
        err: err.message
      })
    }
  }
}

function handlePlayRoom(room, uid, data) {
  if (!room.uidToPlayer.has(uid)) {
    broadcastErrorRoom(room, '非法的用户尝试出牌')
    return
  }
  try {
    const username = room.uidToPlayer.get(uid)
    const playedHand = data.playedHand
    const result = room.game.advance(username, playedHand)
    if (result.state !== gameState.IN_PROGRESS) {
      broadcastToAllRoom(room, { type: 'game over' })
      return
    }
    broadcastUpdateRoom(room)
  } catch (err) {
    console.error('出牌错误:', err)
    broadcastErrorRoom(room, err.message)
  }
}

function handleSendCardRoom(room, uid, data) {
  if (!room.uidToPlayer.has(uid)) {
    broadcastErrorRoom(room, '非法的用户尝试发送卡牌')
    return
  }
  try {
    const username = room.uidToPlayer.get(uid)
    const selectedCards = data.selectedCards
    const result = room.game.sendTribute(username, selectedCards)
    if (result && result.receiverUid) {
      sendToUserRoom(room, result.receiverUid, { type: 'update', gameHand: result.newHand })
    }
    broadcastUpdateRoom(room)
    let allTributesComplete = true
    for (let t of room.tributes) {
      if (!t.hasOwnProperty('giverSent') || !t.hasOwnProperty('receiverSent')) {
        allTributesComplete = false
        break
      }
    }
    if (allTributesComplete) {
      room.tributes = null
      const tributeStrings = []
      for (let t of room.tributes) {
        tributeStrings.push(`${t.giver} sent ${t.receiver} a card`)
        tributeStrings.push(`${t.receiver} returned ${t.giver} a card`)
      }
      broadcastToAllRoom(room, { type: 'tribute summary', tributes: tributeStrings })
    }
  } catch (err) {
    console.error('发送贡献卡牌错误:', err)
    broadcastErrorRoom(room, err.message)
  }
}

function handleGetUpdateRoom(room, uid, data) {
  sendGameUpdateRoom(room, uid)
}

function handleGameMessageRoom(room, uid, message) {
  if (message === 'play again') {
    try {
      room.tributes = room.game.getTributes()
      room.game = createGameRoom(room)
      broadcastToAllRoom(room, { type: 'reload' })
    } catch (err) {
      broadcastErrorRoom(room, err.message)
    }
  } else if (message === 'exit') {
    // 清空房间状态
    room.game = null
    room.tributes = null
    room.players = []
    room.uidToPlayer = new Map()
    room.spectators = []
    broadcastToAllRoom(room, { type: 'reload' })
  }
}

// ==================== HTTP 端点 ====================

app.get('/players', (req, res) => {
  const roomId = req.query && req.query.roomId
  if (!roomId) return res.status(400).json({ error: '缺少房间号' })
  let room = getRoom(roomId)
  if (!room) return res.status(404).json({ error: '房间不存在' })
  touchRoom(roomId)
  res.status(200).json({
    players: room.players,
    gameInProgress: room.game !== null
  })
})

app.get('/game-state', (req, res) => {
  const roomId = req.query && req.query.roomId
  if (!roomId) return res.status(400).json({ error: '缺少房间号' })
  let room = getRoom(roomId)
  if (!room) return res.status(404).json({ error: '房间不存在' })
  touchRoom(roomId)
  let uid = -1
  if (req.query && req.query.uid) uid = parseInt(req.query.uid)
  else if (req.body && req.body.uid) uid = parseInt(req.body.uid)
  else uid = parseCookie(req)

  if (!room.uidToPlayer.has(uid)) {
    return res.status(403).json({ error: 'Not a player' })
  }

  if (!room.game) {
    return res.status(400).json({ error: 'No game in progress' })
  }

  const username = room.uidToPlayer.get(uid)
  const player = room.game.gamePlayers.find(p => p.username === username)
  const currentPlayerIndex = room.game.currentPlayer || 0
  
  const gameState = {
    type: 'update',
    gamePlayers: room.game.gamePlayers,
    currentPlayer: currentPlayerIndex,
    lastPlayCards: room.game.previousPlayedHand || [],
    spectators: room.spectators.length,
    myHand: player ? player.hand || [] : []
  }

  res.status(200).json(gameState)
})

// 创建房间
app.post('/create-room', (req, res) => {
  const roomId = Math.floor(Math.random() * 1000000).toString()
  createRoom(roomId)
  res.status(200).json({ roomId })
})

// 加入房间
app.post('/join', (req, res) => {
  const roomId = req.body && req.body.roomId
  if (!roomId) return res.status(400).json({ error: '缺少房间号' })
  let room = getRoom(roomId)
  if (!room) return res.status(404).json({ error: '房间不存在' })
  if (room.game != null) {
    return res.status(403).json({ error: '房间游戏已开始，无法加入' })
  }
  touchRoom(roomId)

  const uid = parseCookie(req)
  if (room.uidToPlayer.has(uid)) {
    return res.status(400).json({ error: '玩家已在房间' })
  }

  let newUid = uid >= 0 ? uid : createUid()
  if (room.spectators.includes(newUid)) {
    room.spectators = room.spectators.filter(s => s !== newUid)
    // 不广播旁观者变化
  }

  let username = 'user'
  if (req.body && req.body.username) {
    username = _.escape(req.body.username)
  }
  // 处理重名
  if (room.players.includes(username)) {
    let suffix = 1
    while (room.players.includes(username + suffix)) {
      suffix++
    }
    username += suffix
  }
  room.players.push(username)
  room.uidToPlayer.set(newUid, username)

  res.status(200).json({ uid: newUid, username: username })
  // 不广播新玩家，前端可轮询
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
  const roomId = req.body && req.body.roomId
  if (!roomId) return res.status(400).json({ error: '缺少房间号' })
  let room = getRoom(roomId)
  if (!room) return res.status(404).json({ error: '房间不存在' })
  if (room.game != null) {
    return res.status(400).json({ error: '房间游戏已开始' })
  }
  touchRoom(roomId)

  let uid = (req.body && req.body.uid) ? parseInt(req.body.uid) : parseCookie(req)
  if (!(room.uidToPlayer.has(uid) && room.uidToPlayer.get(uid) === room.players[0])) {
    return res.status(403).json({ error: '只有第一个玩家可以开始游戏' })
  }

  try {
    room.game = createGameRoom(room)
    res.status(200).json({ message: 'Game started' })
    // 不广播，前端可轮询
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

app.post('/leave', (req, res) => {
  const uid = (req.body && req.body.uid) ? parseInt(req.body.uid) : parseCookie(req)
  if (!uid) return res.status(400).json({ ok: false, error: 'missing uid' })
  if (isPlayer(uid)) {
    const username = uidToPlayer.get(uid)
    players = players.filter(p => p !== username)
    uidToPlayer.delete(uid)
    broadcastToAll({ type: 'player left', username })
  }
  if (isSpectator(uid)) {
    spectators = spectators.filter(s => s !== uid)
    broadcastToAll({ type: 'num spectators', numSpectators: spectators.length })
  }
  res.status(200).json({ ok: true })
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

function createGameRoom(room) {
  if (room.players.length % 2 != 0) {
    throw new Error('房间玩家必须为偶数')
  }
  // 构建牌组 (标准 52 + 2 joker)
  const deck = []
  for (let v = 1; v <= 13; v++) {
    for (let s = 1; s <= 4; s++) {
      deck.push({ value: v, suit: s })
    }
  }
  // 小王/大王
  deck.push({ value: 14, suit: 0 })
  deck.push({ value: 15, suit: 0 })

  // 支持多副牌
  let fullDeck = []
  for (let i = 0; i < Math.max(1, room.numDecks); i++) {
    fullDeck = fullDeck.concat(deck.map(d => Object.assign({}, d)))
  }

  // 洗牌 (Fisher-Yates)
  for (let i = fullDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = fullDeck[i]
    fullDeck[i] = fullDeck[j]
    fullDeck[j] = tmp
  }

  // 分牌
  const numPlayers = room.players.length
  const hands = Array.from({ length: numPlayers }, () => [])
  let idx = 0
  while (fullDeck.length > 0) {
    hands[idx % numPlayers].push(fullDeck.shift())
    idx++
  }

  const gamePlayers = room.players.map((username, i) => ({
    username,
    hand: hands[i],
    handSize: hands[i].length,
    lastPlayed: null
  }))

  return {
    gamePlayers: gamePlayers,
    currentPlayer: 0,
    previousPlayedHand: [],
    lastActions: new Array(room.players.length).fill(''),
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

// ==================== 消息发送函数（多房间） ====================

function sendToUserRoom(room, uid, message) {
  const ws = room.clients.get(uid)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function broadcastToAllRoom(room, message) {
  const data = JSON.stringify(message)
  room.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })
}

function broadcastUpdateRoom(room) {
  room.clients.forEach((ws, uid) => {
    if (ws.readyState === WebSocket.OPEN) {
      sendGameUpdateRoom(room, uid)
    }
  })
}

function sendGameUpdateRoom(room, uid) {
  if (!room.game) return
  const username = room.uidToPlayer.get(uid)
  const update = {
    type: 'update',
    requestUpdate: false,
    gamePlayers: room.game.gamePlayers,
    currentPlayer: room.game.currentPlayer,
    lastPlayCards: room.game.previousPlayedHand,
    spectators: room.spectators.length
  }
  if (username) {
    const player = room.game.gamePlayers.find(p => p.username === username)
    if (player) {
      update.myHand = player.hand || []
    }
  }
  sendToUserRoom(room, uid, update)
}

function sendError(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }))
  }
}

function broadcastErrorRoom(room, message) {
  broadcastToAllRoom(room, { type: 'error', message })
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
