// pages/index/index.js
const app = getApp()

Page({
  data: {
    showUsernameModal: false,
    username: '',
    mode: null // 'player' 或 'spectator'
  },

  onLoad() {
    // 检查是否已有用户ID
    const uid = wx.getStorageSync('uid')
    if (uid) {
      app.globalData.uid = uid
    }
  },

  onJoinAsPlayer() {
    this.setData({
      showUsernameModal: true,
      mode: 'player'
    })
  },

  onSpectate() {
    this.setData({
      showUsernameModal: true,
      mode: 'spectator'
    })
  },

  onUsernameChange(e) {
    this.setData({
      username: e.detail.value || 'user'
    })
  },

  confirmJoin() {
    const { username, mode } = this.data

    if (!username || username.trim() === '') {
      wx.showToast({
        title: '请输入名字',
        icon: 'error',
        duration: 2000
      })
      return
    }

    if (mode === 'player') {
      this.joinAsPlayer(username)
    } else if (mode === 'spectator') {
      this.joinAsSpectator()
    }
  },

  joinAsPlayer(username) {
    // 通过 HTTP callContainer 调用 /join
    const trimmed = username.trim()
    app.callContainer({
      path: '/join',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { username: trimmed }
    }).then((res) => {
      if (res && res.statusCode === 200 && res.data && res.data.uid) {
        wx.setStorageSync('uid', res.data.uid)
        app.globalData.uid = res.data.uid
        app.globalData.username = res.data.username || trimmed
        app.globalData.isPlayer = true
        this.navigateToLobby()
      } else {
        wx.showToast({ title: res?.data?.error || '加入失败', icon: 'error', duration: 2000 })
      }
    }).catch((err) => {
      wx.showToast({ title: '加入失败', icon: 'error', duration: 2000 })
      console.error('加入失败:', err)
    })
  },

  joinAsSpectator() {
    app.callContainer({
      path: '/spectate',
      method: 'POST',
      header: { 'Content-Type': 'application/json' }
    }).then((res) => {
      if (res && res.statusCode === 200 && res.data && res.data.uid) {
        wx.setStorageSync('uid', res.data.uid)
        app.globalData.uid = res.data.uid
        app.globalData.isSpectator = true
        this.navigateToLobby()
      } else {
        wx.showToast({ title: res?.data?.error || '加入失败', icon: 'error', duration: 2000 })
      }
    }).catch((err) => {
      wx.showToast({ title: '加入失败', icon: 'error', duration: 2000 })
      console.error('加入失败:', err)
    })
  },

  parseUidFromCookie(cookieString) {
    // 若仍需从 Cookie 解析 uid（备用方案）
    if (typeof cookieString === 'string') {
      const match = cookieString.match(/uid=(\d+)/)
      return match ? parseInt(match[1]) : null
    } else if (Array.isArray(cookieString)) {
      for (let cookie of cookieString) {
        const match = cookie.match(/uid=(\d+)/)
        if (match) {
          return parseInt(match[1])
        }
      }
    }
    return null
  },

  navigateToLobby() {
    this.setData({
      showUsernameModal: false,
      username: ''
    })
    wx.navigateTo({
      url: '/pages/lobby/lobby'
    })
  },

  onCloseModal() {
    this.setData({
      showUsernameModal: false,
      username: '',
      mode: null
    })
  }
})
