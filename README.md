# LanDrop

LanDrop 是一个基于浏览器的点对点文件和文本传输工具。当前项目已收敛为 Cloudflare Workers 部署模式：Cloudflare Worker 负责静态资源托管和 WebSocket 信令，文件内容通过 WebRTC DataChannel 在浏览器之间直接传输。

## 功能特性

- **点对点传输**：文件和文本通过 WebRTC DataChannel 直连传输
- **云端信令**：Cloudflare Workers + Durable Objects 维护房间和在线设备列表
- **静态前端**：Next.js 静态导出后由 Workers Static Assets 托管
- **跨平台**：手机、平板、电脑只要支持现代浏览器即可使用
- **同源部署**：前端、`/ws`、`/api/health` 均由同一个 Worker 域名提供

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + TypeScript |
| 信令服务 | Hono + WebSocket |
| P2P 传输 | WebRTC DataChannel |
| 云端运行时 | Cloudflare Workers + Durable Objects |

## 项目结构

```text
LanDrop/
├── client/          # Next.js 前端，静态导出到 client/out
└── worker/          # Cloudflare Worker，负责信令和静态资源托管
```

## 安装依赖

```bash
npm run install:all
```

## 本地 Worker 预览

```bash
npm run dev
```

这个命令会先构建 `client/out`，再启动 `wrangler dev`。如果只想调前端界面，可单独运行：

```bash
npm run dev:client
```

## 构建与部署

```bash
npm run build
npm run deploy
```

部署前需要先登录 Cloudflare：

```bash
npx wrangler login
```

Worker 配置在 `worker/wrangler.jsonc`：

- `assets.directory` 指向 `../client/out`
- `assets.binding` 暴露为 `ASSETS`，Worker 可用 `env.ASSETS.fetch(request)` 回退到静态资源
- `/ws` 使用 Durable Objects 管理房间内 WebSocket 连接
- `/api/health` 提供健康检查
- 其他路径交给 Workers Static Assets

## 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run install:all` | 安装 `client` 和 `worker` 依赖 |
| `npm run build` | 构建前端静态文件并检查 Worker 类型 |
| `npm run dev` | 构建前端并启动本地 Wrangler 预览 |
| `npm run dev:client` | 仅启动 Next.js 前端开发服务器 |
| `npm run deploy` | 构建并部署到 Cloudflare Workers |
| `npm run typecheck` | 检查前端和 Worker 类型 |
| `npm run lint` | 运行前端 ESLint 和 Worker 类型检查 |

## 传输流程

1. 设备 A 打开页面，生成或读取房间号
2. 设备 B 访问同一个 Worker 地址并进入同一房间
3. 双方通过 `/ws` 交换 SDP 和 ICE 候选
4. WebRTC DataChannel 建立连接
5. 文件和文本直接在浏览器之间传输，不经过 Cloudflare 存储

## 注意事项

- Cloudflare Worker 只做信令，不中转或保存文件内容
- WebRTC 直连受网络环境影响；对称 NAT 场景可能需要额外 TURN 服务
- 大文件传输时需要保持双方页面打开，刷新页面会中断传输
