// pages/game/game.js
const app = getApp()

Page({
  // pages/game/game.js
  const app = getApp()

  Page({
    data: {
      gameTitle: '游戏进行中',
      players: [],
      myHand: [],
      selectedIndex: [],
      lastPlayCards: [],
      spectators: 0,
      isMyTurn: false,
      isTributing: false,
      gameStatus: '',
      message: '',
      myUsername: '',
      currentPlayer: '',
      gameState: 'IN_PROGRESS' // IN_PROGRESS, TEAM_ONE_WON, TEAM_TWO_WON
    },

    onLoad() {
      const uid = wx.getStorageSync('uid')
      if (!uid) {
        wx.navigateBack()
        return
      }

      // 立即请求游戏状态
      this.refreshGameState()
    
      // 每1秒轮询一次游戏状态
      this.gameStateTimer = setInterval(() => {
        this.refreshGameState()
      }, 1000)
    },

    refreshGameState() {
      const uid = wx.getStorageSync('uid')
      if (!uid) {
        return
      }

      // 通过 HTTP 接口获取游戏状态
      app.callContainer({
        path: '/game-state',
        method: 'GET',
        data: { uid: uid }
      }).then((res) => {
        if (res && res.statusCode === 200 && res.data) {
          this.updateGameState(res.data)
        } else if (res && (res.statusCode === 403 || res.statusCode === 400)) {
          // 如果服务器认为当前 uid 非法或没有游戏，回到首页重新加入
          wx.showToast({ title: '需要重新加入游戏', icon: 'none', duration: 1200 })
          wx.removeStorageSync('uid')
          app.globalData.uid = null
          app.globalData.username = null
          app.globalData.isPlayer = false
          setTimeout(() => {
            wx.redirectTo({ url: '/pages/index/index' })
          }, 800)
        }
      }).catch((err) => {
        console.error('获取游戏状态失败:', err)
      })
    },

    onShow() {
      // 页面显示时立即刷新状态（处理从后台回到前台的情况）
      this.refreshGameState()
    },

    startListeningToSocket() {
      // 已弃用：使用 HTTP 轮询代替
    },

    requestGameUpdate() {
      // 已弃用：使用 refreshGameState 代替
    },

    handleGameMessage(data) {
      switch (data.type) {
        case 'update':
          this.updateGameState(data)
          break
        case 'check ok':
          this.onCheckOk(data)
          break
        case 'check error':
          this.onCheckError(data)
          break
        case 'game over':
          wx.navigateTo({
            url: '/pages/gameOver/gameOver'
          })
          break
        case 'game error':
          wx.showToast({
            title: data.err || '游戏错误',
            icon: 'error',
            duration: 2000
          })
          break
        case 'tribute summary':
          this.showTributeSummary(data)
          break
      }
    },

    updateGameState(data) {
      if (data.gamePlayers) {
        this.setData({
          players: data.gamePlayers,
          currentPlayer: data.gamePlayers[data.currentPlayer]?.username || ''
        })
      }
    
      if (data.myHand) {
        this.setData({
          myHand: data.myHand,
          selectedIndex: []
        })
      }

      if (data.lastPlayCards) {
        this.setData({
          lastPlayCards: this.formatCards(data.lastPlayCards)
        })
      }

      if (data.spectators !== undefined) {
        this.setData({
          spectators: data.spectators
        })
      }
    },

    onCardTap(e) {
      const index = e.currentTarget.dataset.index
      const selectedIndex = this.data.selectedIndex

      if (selectedIndex.includes(index)) {
        // 取消选择
        selectedIndex.splice(selectedIndex.indexOf(index), 1)
      } else {
        // 添加选择
        selectedIndex.push(index)
      }

      selectedIndex.sort((a, b) => a - b)
      this.setData({ selectedIndex })

      // 当选中卡牌时，自动检查合法性
      if (selectedIndex.length > 0) {
        this.checkPlay()
      }
    },

    onClearSelection() {
      this.setData({
        selectedIndex: [],
        message: ''
      })
    },

    checkPlay() {
      if (this.data.selectedIndex.length === 0) {
        return
      }

      const selectedCards = this.data.selectedIndex.map(idx => this.data.myHand[idx])
      const uid = wx.getStorageSync('uid')

      // 通过 HTTP 接口检查出牌合法性
      app.callContainer({
        path: '/check',
        method: 'POST',
        data: { uid: uid, playedHand: selectedCards }
      }).then((res) => {
        if (res && res.statusCode === 200) {
          wx.showToast({ title: '出牌检查通过', icon: 'success' })
        } else {
          wx.showToast({ title: res?.data?.message || '检查失败', icon: 'error' })
        }
      }).catch((err) => {
        console.error('检查出牌失败:', err)
      })
    },

    onCheckOk(data) {
      let message = '合法的出牌'
      if (data.onlyPassOk) {
        message = '只能PASS'
      }
      this.setData({ message })
    },

    onCheckError(data) {
      this.setData({
        message: data.err || '不合法的出牌'
      })
    },

    onPlayCards() {
      if (!this.data.isMyTurn) {
        wx.showToast({
          title: '还没轮到你',
          icon: 'error'
        })
        return
      }

      if (this.data.selectedIndex.length === 0) {
        wx.showToast({
          title: '请选择要出的牌',
          icon: 'error'
        })
        return
      }

      const selectedCards = this.data.selectedIndex.map(idx => this.data.myHand[idx])
      const uid = wx.getStorageSync('uid')

      // 通过 HTTP 接口发送出牌请求
      app.callContainer({
        path: '/play',
        method: 'POST',
        data: { uid: uid, playedHand: selectedCards }
      }).then((res) => {
        if (res && res.statusCode === 200) {
          this.setData({
            selectedIndex: [],
            message: ''
          })
          wx.showToast({ title: '出牌成功', icon: 'success' })
        } else {
          wx.showToast({ title: res?.data?.message || '出牌失败', icon: 'error' })
        }
      }).catch((err) => {
        console.error('出牌失败:', err)
      })
    },

    onPass() {
      if (!this.data.isMyTurn) {
        wx.showToast({
          title: '还没轮到你',
          icon: 'error'
        })
        return
      }

      const uid = wx.getStorageSync('uid')

      // 通过 HTTP 接口发送PASS请求
      app.callContainer({
        path: '/play',
        method: 'POST',
        data: { uid: uid, playedHand: null }
      }).then((res) => {
        if (res && res.statusCode === 200) {
          this.setData({
            selectedIndex: [],
            message: ''
          })
          wx.showToast({ title: 'PASS成功', icon: 'success' })
        } else {
          wx.showToast({ title: res?.data?.message || 'PASS失败', icon: 'error' })
        }
      }).catch((err) => {
        console.error('PASS失败:', err)
      })
    },

    formatCards(cards) {
      if (!cards || cards.length === 0) {
        return []
      }
      return cards.map(card => {
        return `${this.getCardValue(card.value)}${this.getSuitSymbol(card.suit)}`
      })
    },

    getCardValue(value) {
      const values = {
        1: '3', 2: '4', 3: '5', 4: '6', 5: '7', 6: '8', 7: '9',
        8: '10', 9: 'J', 10: 'Q', 11: 'K', 12: 'A', 13: '2',
        14: 'BJ', 15: 'RJ'
      }
      return values[value] || '?'
    },

    getSuitSymbol(suit) {
      const suits = { 1: '♣', 2: '♦', 3: '♥', 4: '♠' }
      return suits[suit] || ''
    },

    showTributeSummary(data) {
      // 显示贡献卡牌的摘要
      wx.showModal({
        title: '贡献卡牌总结',
        content: data.tributes ? data.tributes.join('\n') : '贡献完成',
        confirmText: '确定',
        showCancel: false
      })
    },

    onUnload() {
      // 清除游戏状态轮询定时器
      if (this.gameStateTimer) {
        clearInterval(this.gameStateTimer)
      }
    }
  })
