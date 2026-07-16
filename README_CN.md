<div align="center">

<p><strong>中文</strong> · <a href="README.md">English</a></p>

<img src="public/app-icon.png" alt="地震实时监测系统" width="92">

<h1>地震实时监测系统</h1>

<p>面向桌面端、手机端和 OBS 的实时地震数据监测大屏。</p>

<p>
  <a href="https://github.com/NJyutong/Earthquake-Live-Monitoring-System/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-3b82f6" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/release-r1.1-10b981" alt="Release r1.1">
  <img src="https://img.shields.io/badge/runtime-Node.js%2018%2B-339933" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/views-desktop%20%7C%20mobile%20%7C%20OBS-7c3aed" alt="桌面端、手机端和 OBS">
  <a href="https://cnquake.xyz/"><img src="https://img.shields.io/badge/demo-cnquake.xyz-0b72b9" alt="在线示例"></a>
</p>

</div>

---

> 本项目聚合公共地震数据源。信息可能存在延迟、缺失或误差，不是官方应急预警渠道，不应作为涉及人身安全决策的唯一信息来源。

## 项目简介

服务端连接公共地震数据源，统一事件格式，并通过 WebSocket 向浏览器发送更新。前端提供桌面端、手机端和 OBS 页面，包含地图、历史事件、波达时间估算、语音提醒和浏览器推送通知。

## 在线示例与截图

点击任意截图即可打开对应的在线页面。

### 桌面端

<a href="https://cnquake.xyz/"><img src="docs/images/desktop-cn.png" alt="中文桌面端地震监测界面" width="100%"></a>

<a href="https://cnquake.xyz/"><img src="docs/images/desktop-en.png" alt="英文桌面端地震监测界面" width="100%"></a>

<p align="center">
  <a href="https://cnquake.xyz/"><img src="docs/images/desktop-compact-en.png" alt="桌面端紧凑布局" width="360"></a>
</p>

### 手机端

<p align="center">
  <a href="https://cnquake.xyz/mobile.html"><img src="docs/images/mobile-cn.png" alt="中文手机端地震监测界面" width="360"></a>
</p>

## 在线页面

- [桌面端](https://cnquake.xyz/)
- [手机端](https://cnquake.xyz/mobile.html)

## 主要功能

- 桌面端、手机端和 OBS 三种展示模式。
- 多个公共 WebSocket 与 REST 地震数据源，支持标准化、去重、缓存和断线重连。
- 台湾 CWA 数据在事件处理前统一将繁体中文文本转换为简体中文。
- 支持高德、天地图、Google、Yandex、OpenStreetMap 和 Esri 地图选项。
- 根据用户授权定位估算 P 波、S 波、震中距离和本地烈度。
- 中英文界面、设备时区以及浅色/深色主题。
- Web Speech 语音提醒和 Web Push 通知。
- 统一的推送 Worker 处理，并检查桌面端/手机端通知展示及测试通知设备回执。
- 密码保护的调试工具、请求限流和 WebSocket 限制。
- Cookie 选择和浏览器端加密偏好存储。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 服务端 | Node.js 18+、Express 4 |
| 实时通信 | WebSocket（`ws`） |
| 地图 | OpenLayers 与已配置的地图服务商 |
| 推送 | Web Push API 与 `web-push` |
| 前端 | HTML、CSS、JavaScript |
| 本地化 | 中文、English |

## 快速开始

```bash
npm ci
cp .env.example .env
npm start
```

Windows PowerShell：

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

默认监听地址为 `http://127.0.0.1:3000`。

| 页面 | 路径 |
| --- | --- |
| 桌面端/自动入口 | `/` |
| 手机端 | `/mobile` |
| OBS | `/obs` |
| 健康检查 | `/health` |

## 环境变量

复制 `.env.example` 为 `.env`，只配置实际使用的服务。不要提交 `.env`。

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_ORIGIN` | 生产环境公开 HTTPS Origin |
| `DEBUG_PASSWORD` | 受保护调试工具的密码 |
| `OBS_ENABLED` | 服务端 OBS 路由开关，默认 `true` |
| `AMAP_JS_KEY` | 高德 Web JS Key |
| `AMAP_SECURITY_JSCODE` | 高德安全密钥 |
| `YANDEX_MAPS_API_KEY` | Yandex Maps Key |
| `GOOGLE_MAPS_API_KEY` | 可选 Google Maps Key |
| `TIANDITU_TK` | 可选天地图 Token |
| `ESRI_API_KEY` | 可选 Esri Key |
| `CWA_API_KEY` | 可选台湾 CWA 开放数据 Token |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | 可选 Web Push 密钥对 |
| `WEB_PUSH_ENABLED` | 启用 Web Push 生产检查；开启后必须配置 VAPID 密钥和联系地址 |
| `PUSH_RELAY_URL`、`PUSH_RELAY_SECRET` | 可选推送中继配置 |
| `PUSH_TEST_DEVICE_ACK_TIMEOUT_MS` | 测试通知等待设备回执的时限，默认 `20000` |

没有地图凭证时服务仍可启动，但需要密钥的地图服务不可用。填写 `.env` 后运行生产配置检查：

```bash
npm run config-check
```

## 项目检查

```bash
npm run check
npm run feature-check
npm run security-check
npm run ui-check
```

`security-check` 与 `ui-check` 会自动启动隔离的本地服务，不需要预先运行 `npm start`。发布版本和缓存版本统一以 `package.json` 为来源；使用 `npm version <patch|minor|major>` 可同步 HTML、Service Worker 缓存与 `release.json`。

服务器启动后 OBS 默认自动可用，浏览器设置中不再提供开关。若要关闭，请在服务器设置 `OBS_ENABLED=false`，此时 `/obs` 与 `/obs.html` 返回 `404`。

## 部署

生产部署和随附的 systemd 工作流程见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

数据发布机构、技术中转、更新方式和故障降级规则见 [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)。

## 项目结构

```text
.
├─ .github/            # CI 与安全分析工作流
├─ cloudflare/          # 可选推送中继 Worker
├─ data/.gitkeep       # 空运行数据目录
├─ docs/               # 部署文档与截图
├─ lib/                # 服务端共享工具
├─ public/             # 桌面端、手机端、OBS、Worker 与静态资源
├─ scripts/            # 检查、部署和打包脚本
├─ .env.example
├─ LICENSE
├─ README.md
├─ README_CN.md
├─ SECURITY.md
├─ package.json
├─ release.json
└─ server.js
```

运行时在 `data/` 中生成的文件已被 Git 忽略，不应上传。

## 安全

生产凭证应放在 `.env` 或密钥管理服务中。不要提交地图 Key、Token、私钥、推送订阅、审计记录或运行数据。详情见 [SECURITY.md](SECURITY.md)。

## 许可证

本项目采用 [MIT License](https://github.com/NJyutong/Earthquake-Live-Monitoring-System/blob/main/LICENSE)。

Copyright (c) 2026 Zou Yutong
