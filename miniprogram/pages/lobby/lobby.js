// pages/lobby/lobby.js
const app = getApp()

Page({
  data: {
    // pages/lobby/lobby.js
    const app = getApp()

    Page({
      data: {
        players: [],
        spectators: 0,
        isPlayerOne: false,
        numDecks: 0
      },

      onLoad() {
        this.refreshPlayerList()
        // 每2秒刷新一次玩家列表
        this.playerListTimer = setInterval(() => {
          this.refreshPlayerList()
        }, 2000)
      },

      refreshPlayerList() {
        const uid = wx.getStorageSync('uid')
        if (!uid) {
          wx.navigateBack()
          return
        }

        // 调用 /players 接口获取玩家列表和游戏状态
        app.callContainer({
          path: '/players',
          method: 'GET'
        }).then((res) => {
          if (res && res.statusCode === 200 && res.data) {
            const playerList = res.data.players || []
            const gameInProgress = res.data.gameInProgress || false
            const isPlayerOne = uid && playerList.length > 0 && app.globalData.isPlayer
        
            this.setData({
              players: playerList,
              isPlayerOne: isPlayerOne
            })

            // 若本地标记为玩家但服务器不包含该用户名，提示重新加入
            const localUsername = app.globalData.username
            if (app.globalData.isPlayer && localUsername && !playerList.includes(localUsername)) {
              wx.showToast({ title: '需要重新加入游戏', icon: 'none', duration: 1500 })
              wx.removeStorageSync('uid')
              app.globalData.uid = null
              app.globalData.username = null
              app.globalData.isPlayer = false
              setTimeout(() => {
                wx.redirectTo({ url: '/pages/index/index' })
              }, 800)
              return
            }

            // 如果游戏已开始，玩家应该进入游戏界面
            if (gameInProgress && app.globalData.isPlayer) {
              // 清除定时器
              if (this.playerListTimer) {
                clearInterval(this.playerListTimer)
              }
              // 导航到游戏页面
              wx.navigateTo({
                url: '/pages/game/game'
              })
            }
          }
        }).catch((err) => {
          console.error('获取玩家列表失败:', err)
        })
      },

      onStartGame() {
        const uid = wx.getStorageSync('uid')
        if (!uid) {
          wx.showToast({
            title: '请先加入游戏',
            icon: 'error'
          })
          return
        }

        if (!this.data.isPlayerOne) {
          wx.showToast({
            title: '只有第一个玩家可以开始游戏',
            icon: 'error'
          })
          return
        }

        if (this.data.players.length % 2 !== 0) {
          wx.showToast({
            title: '玩家数量必须是偶数',
            icon: 'error'
          })
          return
        }

        // 发送开始游戏请求
        app.callContainer({
          path: '/start',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { uid: uid }
        }).then((res) => {
          if (res && res.statusCode === 200) {
            wx.showToast({ title: '游戏已开始', icon: 'success' })
            // 清除定时器
            if (this.playerListTimer) {
              clearInterval(this.playerListTimer)
            }
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/game/game' })
            }, 500)
          } else {
            wx.showToast({ title: res?.data?.error || '开始游戏失败', icon: 'error' })
          }
        }).catch((err) => {
          wx.showToast({ title: '开始游戏失败', icon: 'error' })
          console.error('开始游戏失败:', err)
        })
      },

      onLeave() {
        wx.showModal({
          title: '确认',
          content: '确定要离开游戏吗?',
          success: (res) => {
            if (res.confirm) {
              const uid = wx.getStorageSync('uid')
              app.callContainer({ path: '/leave', method: 'POST', header: { 'Content-Type': 'application/json' }, data: { uid } })
                .finally(() => {
                  wx.removeStorageSync('uid')
                  app.globalData.uid = null
                  app.globalData.username = null
                  app.globalData.isPlayer = false
                  wx.navigateBack()
                })
            }
          }
        })
      },

      onUnload() {
        // 清除定时器
        if (this.playerListTimer) {
          clearInterval(this.playerListTimer)
        }
      }
    })
