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
    this.startListeningToSocket()
    this.requestGameUpdate()
    
    // 监听返回按钮
    wx.onBackPress(() => {
      return false
    })
  },

  startListeningToSocket() {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    
    currentPage.onSocketMessage = (data) => {
      this.handleGameMessage(data)
    }
  },

  requestGameUpdate() {
    const uid = wx.getStorageSync('uid')
    if (!uid) {
      wx.navigateBack()
      return
    }

    // 向服务器请求游戏更新
    app.sendMessage({
      type: 'get update',
      uid: uid
    })
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
    
    if (data.gameHand) {
      const hand = data.gameHand
      this.setData({
        myHand: hand,
        selectedIndex: []
      })
    }

    if (data.lastPlay) {
      this.setData({
        lastPlayCards: this.formatCards(data.lastPlay)
      })
    }

    if (data.title) {
      this.setData({
        gameTitle: data.title,
        isMyTurn: data.title.includes('Your turn')
      })
    }

    if (data.spectators !== undefined) {
      this.setData({
        spectators: data.spectators
      })
    }

    if (data.tributing !== undefined) {
      this.setData({
        isTributing: data.tributing
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

    // 发送检查请求到服务器
    app.sendMessage({
      type: 'check',
      uid: uid,
      playedHand: selectedCards
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

    // 发送出牌请求
    app.sendMessage({
      type: 'play',
      uid: uid,
      playedHand: selectedCards
    })

    this.setData({
      selectedIndex: [],
      message: ''
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

    // 发送PASS请求
    app.sendMessage({
      type: 'play',
      uid: uid,
      playedHand: null
    })

    this.setData({
      selectedIndex: [],
      message: ''
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

  onHide() {
    const pages = getCurrentPages()
    if (pages.length > 0) {
      pages[pages.length - 1].onSocketMessage = null
    }
  }
})
