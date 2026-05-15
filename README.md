# LanDrop

一款轻量级的局域网文件传输工具，支持浏览器点对点传输和服务器中转两种模式。

## 功能特性

- **点对点传输**：基于 WebRTC DataChannel，文件直接在设备间传输，不经过服务器
- **局域网发现**：自动获取本机 IP 并生成二维码，手机扫码即可加入
- **跨平台**：任何支持浏览器的设备（手机、平板、电脑）均可使用
- **双模式部署**：
  - **本地模式**：Node.js 服务器，支持文件中转和局域网共享
  - **云端模式**：Cloudflare Workers 部署，纯信令服务，全球可用
- **实时状态**：WebSocket 实时显示在线设备列表和传输进度

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + TypeScript |
| 服务端框架 | Hono |
| P2P 传输 | WebRTC DataChannel |
| 信令服务 | WebSocket |
| 本地运行时 | Node.js + `ws` + `@hono/node-server` |
| 云端运行时 | Cloudflare Workers + Durable Objects |

## 项目结构

```
LanDrop/
├── client/          # Next.js 前端（React SPA）
├── server/          # Node.js 本地服务器（开发 + 本地部署）
└── worker/          # Cloudflare Worker（云端部署）
```

### 各模块职责

| 模块 | 功能 |
|------|------|
| `client` | 网页界面、WebRTC 连接管理、文件收发、二维码生成 |
| `server` | 本地 HTTP 服务、WebSocket 信令、文件上传/下载中转、静态资源托管 |
| `worker` | Cloudflare Worker 信令服务、DurableObject 管理 WebSocket 房间、静态资源托管 |

## 本地开发

### 1. 安装依赖

```bash
npm run install:all
```

### 2. 启动开发服务器

同时启动服务端和客户端（需要两个终端）：

```bash
# 终端 1：启动服务端
npm run dev:server

# 终端 2：启动客户端
npm run dev:client
```

或者先构建再启动：

```bash
npm run build
npm start
```

客户端默认运行在 `http://localhost:3000`，服务端在另一个端口。构建后服务端会托管 `client/out` 静态文件，可直接访问。

### 3. 局域网传输

启动后会打印本机局域网地址和二维码。用另一台设备扫码或访问该地址，即可加入同一个房间进行文件传输。

## Cloudflare 部署

### 首次部署

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 构建并部署：

```bash
npm run install:all
npm run build:cloudflare
npm run deploy:cloudflare
```

### 本地测试 Cloudflare Worker

```bash
npm run dev:cloudflare
```

这会在本地启动 Wrangler dev server，模拟 Cloudflare Workers 运行环境。

### 部署说明

- 前端静态文件（`client/out`）作为 Workers Static Assets 部署
- WebSocket 信令通过 `RoomDurableObject` 实现房间状态管理
- 文件传输仍走浏览器 WebRTC P2P，不经过 Cloudflare 服务器

## 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run install:all` | 安装 client、server、worker 三方依赖 |
| `npm run build` | 构建客户端静态文件 + 编译服务端 |
| `npm run build:cloudflare` | 构建客户端静态文件 + 检查 Worker 类型 |
| `npm run deploy:cloudflare` | 构建并部署到 Cloudflare Workers |
| `npm start` | 启动生产环境服务端（需先 build） |
| `npm run dev:server` | 服务端热重载开发 |
| `npm run dev:client` | 客户端 Next.js 开发服务器 |
| `npm run dev:cloudflare` | 本地 Wrangler 开发环境 |
| `npm run typecheck` | 类型检查（client + server + worker） |
| `npm run lint` | 代码检查 |

## 传输流程

1. 设备 A 打开网页，生成/输入房间号
2. 设备 B 通过扫码或输入同一房间号加入
3. 双方通过 WebSocket 交换 ICE 候选和 SDP 信息（信令）
4. WebRTC P2P 连接建立成功
5. 文件通过 DataChannel 直接传输，不经过服务器

## 注意事项

- WebRTC 连接需要双方都能访问对方的网络。如果处于对称型 NAT 后，可能需要 TURN 服务器辅助
- 本地模式的文件中转功能仅在 `server/` 运行时可用，Cloudflare 部署不支持服务器中转文件
- 大文件传输时请保持页面打开，传输过程中刷新页面会导致传输中断
