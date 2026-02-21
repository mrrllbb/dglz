# 小程序配置说明

## 1. 服务器地址配置

编辑 `miniprogram/app.js`，修改服务器URL：

```javascript
globalData: {
  // 开发环境：使用本地IP或localhost
  serverUrl: 'ws://192.168.1.100:8000',
  
  // 生产环境：使用正式域名，必须是HTTPS/WSS
  // serverUrl: 'wss://api.your-domain.com:443',
}
```

## 2. 微信小程序配置

### 2.1 创建小程序
1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 点击 "新建" → "小程序"
3. 填写基本信息（名称、简介等）
4. 获取 AppID 和 AppSecret

### 2.2 配置服务器域名

在微信公众平台 → 设置 → 开发者工具 → 开发设置中配置：

**WebSocket合法域名:**
```
wss://api.your-domain.com
ws://192.168.1.100  (仅开发调试)
```

**业务域名:**
```
https://api.your-domain.com
```

### 2.3 在微信开发者工具中配置

1. 打开项目设置
2. 输入 AppID
3. 选择后端框架（可不选）
4. 启用 ES6转ES5（推荐）
5. 启用增强编译（推荐）

## 3. 开发模式 vs 生产模式

### 开发模式配置

```javascript
// miniprogram/app.js
const isDev = true

globalData: {
  serverUrl: isDev 
    ? 'ws://192.168.1.100:8000'  // 内网IP
    : 'wss://api.your-domain.com'
}
```

### 生产模式配置

```javascript
// 需要SSL/TLS证书，使用HTTPS/WSS
globalData: {
  serverUrl: 'wss://api.your-domain.com:443',
  // 确保后端服务器配置了SSL证书
}
```

## 4. 后端服务器配置

### 4.1 安装依赖

```bash
cd server
npm install ws express body-parser cors cookie handlebars socket.io lodash
```

### 4.2 环境变量

创建 `.env` 文件：

```env
# 开发环境
NODE_ENV=development
PORT=8000
HOST=0.0.0.0

# 生产环境
# NODE_ENV=production
# PORT=443
# HTTPS_KEY=/path/to/ssl/key.pem
# HTTPS_CERT=/path/to/ssl/cert.pem
```

### 4.3 启动服务器

```bash
# 开发: 使用HTTP/WS
npm run dev
# 或：node server/app-miniprogram-example.js

# 生产: 使用HTTPS/WSS
npm run start

# 后台运行（使用pm2）
npm install -g pm2
pm2 start server/app.js --name "dglz"
```

## 5. 开发调试

### 5.1 使用微信开发者工具

1. 打开 `miniprogram` 文件夹
2. 点击 "预览"
3. 扫码在手机上运行
4. 查看 "调试" 标签页的日志

### 5.2 本地调试

```javascript
// 在 miniprogram/app.js 中启用调试模式
wx.setEnableDebug(true)

// 或在开发者工具中启用调试
```

### 5.3 虚拟机调试

```bash
# 启用虚拟机调试模式
npm run debug
```

## 6. 性能优化

### 6.1 代码主包优化

编辑 `app.json` 使用分包加载：

```json
{
  "pages": [
    "pages/index/index",
    "pages/lobby/lobby"
  ],
  "subpackages": [
    {
      "root": "game-pages",
      "pages": [
        "pages/game/game",
        "pages/gameOver/gameOver"
      ]
    }
  ]
}
```

### 6.2 图片优化

- 使用 WebP 格式
- 压缩图片大小（推荐 < 100KB）
- 使用图标字体而不是图片

### 6.3 网络优化

- 启用消息压缩
- 实现请求缓存
- 优化WebSocket消息大小

## 7. 测试

### 7.1 单元测试

```bash
npm test
```

### 7.2 集成测试

```bash
npm run test:integration
```

### 7.3 性能测试

使用微信开发者工具内置的性能分析工具

## 8. 常见问题解决

### 问题：WebSocket连接拒绝

**原因**: 域名未配置或防火墙阻止

**解决**:
- 检查微信小程序后台的域名配置
- 确保服务器可公网访问
- 检查防火墙规则

### 问题：消息乱码

**原因**: 编码问题

**解决**:
```javascript
// 确保使用UTF-8编码
JSON.stringify(data) // 自动使用UTF-8
```

### 问题：内存泄漏

**原因**: WebSocket连接未正确关闭

**解决**:
```javascript
// 页面卸载时关闭连接
onUnload() {
  if (socket) {
    socket.close()
  }
}
```

## 9. 部署清单

生产部署前检查：

- [ ] SSL/TLS证书已安装
- [ ] WSS域名已配置
- [ ] 服务器IP白名单已配置（如需要）
- [ ] 数据库连接已配置
- [ ] 日志系统已配置
- [ ] 监控告警已配置
- [ ] 备份策略已制定
- [ ] 灾难恢复计划已准备

## 10. 相关文档

- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [WebSocket API](https://developers.weixin.qq.com/miniprogram/dev/api/network/websocket/wx.connectWebSocket.html)
- [Node.js WebSocket库](https://github.com/websockets/ws)
- [SSL/TLS证书申请](https://certbot.eff.org/)
