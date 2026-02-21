// pages/gameOver/gameOver.js
const app = getApp()

Page({
  data: {
    winnerMessage: '恭喜获胜！',
    finalPlayers: [],
    gameState: 'TEAM_ONE_WON'
  },

  onLoad() {
    this.requestGameResult()
  },

  requestGameResult() {
    // 从app中获取游戏结果
    const gameState = app.globalData.game?.gameState || 'UNKNOWN'
    
    const teams = {
      TEAM_ONE_WON: '第一队获胜！',
      TEAM_TWO_WON: '第二队获胜！',
      TIE: '平局'
    }

    this.setData({
      winnerMessage: teams[gameState] || '游戏结束',
      gameState: gameState,
      finalPlayers: this.getMockFinalPlayers() // 实际应从服务器获取
    })

    // 监听游戏消息
    this.startListeningToSocket()
  },

  getMockFinalPlayers() {
    // 这是示例数据，实际应从服务器获取
    return [
      { username: '玩家1', team: '第一队' },
      { username: '玩家2', team: '第一队' },
      { username: '玩家3', team: '第二队' },
      { username: '玩家4', team: '第二队' }
    ]
  },

  startListeningToSocket() {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    
    currentPage.onSocketMessage = (data) => {
      if (data.type === 'reload') {
        wx.navigateTo({
          url: '/pages/lobby/lobby'
        })
      } else if (data.type === 'game error') {
        wx.showToast({
          title: data.err || '游戏错误',
          icon: 'error'
        })
      }
    }
  },

  onPlayAgain() {
    // 发送"再来一局"消息到服务器
    app.sendMessage({
      type: 'message',
      message: 'play again'
    })

    wx.showToast({
      title: '正在准备新游戏...',
      icon: 'loading',
      duration: 2000
    })
  },

  onExit() {
    // 发送"退出"消息到服务器
    app.sendMessage({
      type: 'message',
      message: 'exit'
    })

    wx.navigateBack({
      delta: 2
    })
  },

  onHide() {
    const pages = getCurrentPages()
    if (pages.length > 0) {
      pages[pages.length - 1].onSocketMessage = null
    }
  }
})
