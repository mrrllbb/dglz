部署到 Tencent CloudBase（CloudBase / 云开发）以避免自己托管服务器

概述
- 微信小程序本身无法作为持续运行的后端服务器。
- 你可以把后端部署到腾讯云的 CloudBase（云开发）/ 云托管，这样无需自己在外网起服务器并维护，只需在控制台或使用 CLI 部署一次即可。

我在仓库中已新增一个可直接部署的示例服务：
- 文件: `server/app-miniprogram-example.js`（使用 `express` + `ws`，并提供 HTTP /join, /spectate, /start 等端点以及 WebSocket 实时通信）

快速部署（控制台方式，推荐）
1. 登录腾讯云控制台 -> 云开发 CloudBase（https://console.cloud.tencent.com/tcb）。
2. 新建/选择环境（Env）。
3. 在“应用托管 / Web 托管”或“云托管”中创建一个新服务；选择 Node.js 运行环境。
4. 上传或连接代码仓库，指定根目录为项目根（包含 `package.json`）。
5. 在构建/启动命令中填写：
   - 构建命令（可留空）
   - 启动命令：`npm run start:miniprogram`
6. 部署完成后，在服务详情中会看到域名（请使用 `wss://` 协议，如果控制台返回 `https://`，把协议替换为 `wss://` 并添加端口/路径，或使用云托管提供的 WebSocket 专用域名）。
7. 将该 WSS 地址填入小程序 `miniprogram/app.js` 中的 `serverUrl`（例如 `wss://your-service-xxx.tencentcloudbase.com`）。

快速部署（CLI 方式）
- 如果你熟悉 CLI，可使用 CloudBase 的控制台上传或框架化部署。控制台方式更直观，CLI 的命令和流程随 CloudBase 版本可能变化，建议使用控制台。

小程序端设置
- 打开 `miniprogram/app.js`，将 `globalData.serverUrl` 设置为部署后返回的 `wss://` 地址。
- 在小程序管理后台（mp.weixin.qq.com）将该域名加入 WebSocket 合法域名（以及 HTTPS/下载域名等），并通过审核。

注意与限制
- 小程序在真实发布时强制使用 HTTPS/WSS，且域名必须在小程序后台配置并通过 ICP 备案（国内站点）。
- 云托管会托管你的 Node.js 进程并保持 WebSocket 连接；你无需自己维护 VPS，但仍是外部托管服务（由腾讯云负责运行）。
- 如果你确实不想使用任何外部服务（包括云托管），则无法实现多人实时对战功能，因为小程序端不能持久监听或接收来自其他客户端的实时连接。

我可以为你做的事
- 把 `server/app-miniprogram-example.js` 清理为可部署版并确认它监听 `process.env.PORT` 与 `0.0.0.0`（已完成）。
- 把 `miniprogram/app.js` 的 `serverUrl` 默认设置为 `wss://<YOUR_CLOUDBASE_DOMAIN>` 的占位，并写好部署后需要替换的说明（我可以直接做）。
- 如果你确认使用 CloudBase，我可以继续把项目配置文件（如 cloudbaserc / cloudbase.yaml）和部署步骤写成一键部署脚本。

下一步建议
- 若接受 CloudBase：回复“部署 CloudBase”，我将把 `miniprogram/app.js` 填入占位地址并生成一份一键部署说明（包含控制台步骤和可选 CLI 命令）。
- 若你偏好其它托管（例如阿里云/腾讯云 CVM/Heroku），告知我目标平台，我会调整部署说明和必要配置。
