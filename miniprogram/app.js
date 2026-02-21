// app.js
App({
  onLaunch() {
    // 初始化应用
    this.globalData = {
      // 部署到 CloudBase 后，请将此处替换为你的 WSS 地址，例如:
      // 'wss://your-service-xxxxx.tcloudbaseapp.com'
      // 开发时可使用本地地址: 'ws://localhost:8001'
      // 已替换为你的 CloudBase 域名（WSS）
      serverUrl: 'wss://express-e1ci-226732-8-1405450566.sh.run.tcloudbase.com',
      // CloudBase 配置：把 envId 设置为你的云开发环境 ID
      cloudEnv: 'prod-6g06yxudfeff8587',
      // 云托管服务名（在 CloudBase 控制台创建云托管服务时的名称）
      cloudServiceName: 'express-e1ci',
      socket: null,
      uid: null,
      username: null,
      isPlayer: false,
      isSpectator: false,
      players: [],
      game: null,
      tributes: null
    }
    
    // 从本地存储恢复用户ID
    const uid = wx.getStorageSync('uid')
    if (uid) {
      this.globalData.uid = uid
    }

    // 初始化云能力（如需使用 wx.cloud.callContainer，请先在小程序后台开通云开发）
    if (wx.cloud && this.globalData.cloudEnv) {
      try {
        wx.cloud.init({ env: this.globalData.cloudEnv })
      } catch (e) {
        console.warn('wx.cloud.init failed', e)
      }
    }
  },

  // 连接WebSocket
  connectWebSocket() {
    const app = this
    const serverUrl = app.globalData.serverUrl
    
    if (app.globalData.socket) {
      return
    }

    const socket = wx.connectSocket({
      url: serverUrl,
      success: () => {
        console.log('WebSocket连接成功')
      },
      fail: () => {
        console.error('WebSocket连接失败')
        // 3秒后重试
        setTimeout(() => app.connectWebSocket(), 3000)
      }
    })

    socket.onOpen(() => {
      console.log('WebSocket已打开')
      // 发送初始化消息，包含用户信息
      if (app.globalData.uid) {
        app.sendMessage({
          type: 'init',
          uid: app.globalData.uid
        })
      }
    })

    socket.onMessage((res) => {
      const data = JSON.parse(res.data)
      app.handleSocketMessage(data)
    })

    socket.onClose(() => {
      console.log('WebSocket已关闭')
      app.globalData.socket = null
      // 尝试重新连接
      setTimeout(() => app.connectWebSocket(), 5000)
    })

    socket.onError((res) => {
      console.error('WebSocket错误:', res)
      app.globalData.socket = null
    })

    app.globalData.socket = socket
  },

  // 发送消息到服务器
  sendMessage(message) {
    const app = this
    if (!app.globalData.socket) {
      console.error('WebSocket未连接')
      return
    }

    wx.sendSocketMessage({
      data: JSON.stringify(message),
      success: () => {
        console.log('消息已发送:', message)
      },
      fail: (err) => {
        console.error('发送消息失败:', err)
      }
    })
  },

  // 使用 wx.cloud.callContainer 调用云托管服务（封装）
  callContainer(opts) {
    const app = this

    // Helper: fallback to direct HTTPS call to the deployed domain
    const httpFallback = () => {
      return new Promise((resolve, reject) => {
        try {
          const httpsBase = (app.globalData.serverUrl || '').replace(/^wss?:\/\//, (m) => m === 'ws://' ? 'http://' : 'https://')
          const url = `${httpsBase.replace(/\/$/, '')}${opts.path || '/'}`
          wx.request({
            url: url,
            method: (opts.method || 'GET').toUpperCase(),
            header: Object.assign({}, opts.header || {}, { 'X-WX-SERVICE': app.globalData.cloudServiceName }),
            data: opts.data || null,
            dataType: opts.dataType || 'json',
            success: (res) => resolve(res),
            fail: (err) => reject(err)
          })
        } catch (e) {
          reject(e)
        }
      })
    }

    // If wx.cloud is not available, fall back to HTTPS+wx.request
    if (!wx.cloud) {
      console.warn('wx.cloud is not available — falling back to wx.request to the public domain')
      return httpFallback()
    }

    const headers = Object.assign({}, opts.header || {}, {
      'X-WX-SERVICE': app.globalData.cloudServiceName,
      'content-type': 'application/json'
    })

    const callConfig = {
      config: {
        env: app.globalData.cloudEnv
      },
      path: opts.path || '/',
      method: (opts.method || 'GET').toUpperCase(),
      header: headers,
      data: opts.data || null
    }

    try {
      return wx.cloud.callContainer(callConfig)
    } catch (e) {
      // If cloud API isn't initialized, try to init if we have env, then retry.
      console.warn('wx.cloud.callContainer threw:', e)
      if (app.globalData.cloudEnv) {
        try {
          wx.cloud.init({ env: app.globalData.cloudEnv })
          return wx.cloud.callContainer(callConfig)
        } catch (e2) {
          console.error('wx.cloud.init or callContainer retry failed:', e2)
          return Promise.reject(e2)
        }
      }
      // No env to init, fallback to HTTP
      return httpFallback()
    }
  },

  // 处理来自服务器的消息
  handleSocketMessage(data) {
    const app = this
    const eventName = data.type

    // 触发全局事件，页面可以通过监听这些事件更新UI
    wx.getApp().triggerEvent = wx.getApp().triggerEvent || {}
    
    switch (data.type) {
      case 'new player':
        app.globalData.players.push(data.username)
        break
      case 'player left':
        app.globalData.players = app.globalData.players.filter(p => p !== data.username)
        break
      case 'game started':
        // 游戏开始，导航到游戏页面
        wx.redirectTo({
          url: '/pages/game/game'
        })
        break
      case 'game over':
        // 游戏结束，导航到结束页面
        wx.redirectTo({
          url: '/pages/gameOver/gameOver'
        })
        break
      case 'update':
        // 更新游戏状态
        app.globalData.game = data
        break
      case 'error':
        wx.showToast({
          title: data.message,
          icon: 'error',
          duration: 2000
        })
        break
    }

    // 广播消息到所有打开的页面
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page.onSocketMessage) {
        page.onSocketMessage(data)
      }
      // 或者通过回调函数
      if (page.socketMessageCallback) {
        page.socketMessageCallback(data)
      }
    })
  },

  globalData: {}
})
