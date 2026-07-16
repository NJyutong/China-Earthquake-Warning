# Data sources / 数据源说明

This document describes the connections implemented by the current source code. A label shown in the UI identifies the data publisher; it does not necessarily identify the network service to which this application connects.

本文说明当前源码实际建立的连接。界面中的名称用于标识数据发布方，不一定等同于本程序直接连接的网络服务。

## Event feeds / 地震事件数据

| UI label / 界面名称 | Publisher / 数据发布方 | Actual connection / 实际连接 | Data and refresh / 类型与更新 | Fallback and known limits / 降级与已知限制 |
| --- | --- | --- | --- | --- |
| CENC EEW | China Earthquake Networks Center-related feed / 中国地震台网相关预警流 | Wolfx WebSocket `wss://ws-api.wolfx.jp/cenc_eew` | Event-driven EEW / 实时预警 | Wolfx is a technical relay, not the official publisher. Reconnects automatically; delay and availability depend on both upstream and relay. / Wolfx 是技术中转而非官方发布机构；断线自动重连，延迟受上游和中转共同影响。 |
| CENC EQLIST | China Earthquake Networks Center / 中国地震台网 | Wolfx WebSocket plus `https://api.wolfx.jp/cenc_eqlist.json` | Event list; HTTP result cached for 5 seconds / 速报列表，HTTP 结果缓存 5 秒 | Used to supplement recent mainland history. The application may also query CEIC history endpoints. / 用于补充近期大陆历史记录，也会尝试 CEIC 历史接口。 |
| 四川、重庆、福建 EEW | Corresponding regional warning feeds / 相应区域预警流 | Wolfx WebSockets under `ws-api.wolfx.jp` | Event-driven EEW / 实时预警 | Relay-dependent; automatic reconnect with backoff. / 依赖中转，失败后退避重连。 |
| CENC 烈度 | Intensity feed labelled CENC / 标记为 CENC 的烈度流 | `wss://api-cencint-public.nowquake.cn/websocket` | Event-driven intensity / 实时烈度 | Treated as a separate technical endpoint; availability is shown independently in `/sources`. / 独立技术端点，状态在 `/sources` 单独展示。 |
| 中国台湾 CWA | Central Weather Administration / 台湾地区气象主管机构 CWA | Official Open Data API by default; a configured proxy/base URL may replace the network endpoint / 默认官方开放资料 API，也可配置代理地址 | Polled, normally once per minute; all text fields are converted from Taiwan Traditional Chinese to Simplified Chinese before normalization / 轮询，通常每分钟一次；全部文本字段在标准化前由台湾繁体转换为简体中文 | Requires `CWA_API_KEY`. Missing or invalid credentials disable this feed without stopping the application. / 需要 `CWA_API_KEY`；缺失或无效时停用该源，但不阻止系统启动。 |
| USGS 全球 | U.S. Geological Survey / 美国地质调查局 | `earthquake.usgs.gov` all-day GeoJSON feed | Polled, normally once per minute / 轮询，通常每分钟一次 | Global fallback/history source; publication time and later revisions are controlled by USGS. / 全球备用及历史源，发布时间和修订由 USGS 决定。 |
| EMSC 全球 | European-Mediterranean Seismological Centre / 欧洲-地中海地震中心 | Seismic Portal FDSN event API | Polled, normally once per minute / 轮询，通常每分钟一次 | Global fallback. Network or service throttling may delay updates. / 全球备用源，网络或服务限流可能造成延迟。 |
| GS RAS | Geophysical Survey of the Russian Academy of Sciences / 俄罗斯科学院地球物理调查机构 | Server URL supplied through `RUSSIA_EARTHQUAKE_URL` or `RAS_EARTHQUAKE_URL` | Optional polling source / 可选轮询源 | Disabled when no URL is configured. Operators are responsible for selecting an authorized endpoint. / 未配置 URL 时停用；部署者应自行确认所用接口的授权。 |
| 中国地震台网历史 | China Earthquake Networks Center / 中国地震台网 | `news.ceic.ac.cn` history/search endpoints; optional operator-provided history hooks | Historical measurements / 历史正式测定 | Results are cached under `data/`. If live fetches fail, the last valid runtime cache can still be served. / 结果缓存在 `data/`；实时拉取失败时可继续使用最后有效缓存。 |

## How fallback works / 降级逻辑

1. Live WebSocket feeds are preferred for low-latency events and reconnect automatically after interruption.
2. Polling feeds supplement regional and global history. Unconfigured optional feeds remain unavailable without blocking startup.
3. Events believed to describe the same earthquake are merged. When an official CENC-labelled measurement arrives after an earlier warning, official fields take precedence.
4. The `/sources` endpoint exposes connection state, last message time and the most recent error. The UI should present these as transport health, not as a statement about an institution's operational status.
5. Runtime history is cached locally. Cached data is a continuity mechanism and may be stale; it is not a new official publication.

1. 实时 WebSocket 用于低延迟事件，断线后自动重连。
2. 轮询源补充区域和全球历史；未配置的可选源只会停用，不阻止启动。
3. 系统会合并疑似同一地震；后续到达的 CENC 正式测定字段优先于较早预警字段。
4. `/sources` 展示连接状态、最后消息时间和最近错误；这些是技术链路状态，不代表相应机构的运行状态。
5. 本地历史缓存只用于连续服务，可能已经过时，不构成新的官方发布。

## Attribution, authorization and latency / 署名、授权与延迟

- Keep the publisher label and any map attribution visible. Do not relabel relay data as a direct official connection.
- API keys and relay credentials belong only in `.env` or the deployment secret store, never in the repository.
- Terms, quotas and attribution requirements can change. Before a public or commercial deployment, verify the current terms published by CWA, USGS, EMSC, CEIC/CENC, GS RAS, Wolfx and each configured map provider.
- The project provides no delivery-time guarantee. EEW is preliminary by nature; magnitudes, locations and intensity estimates can be revised or withdrawn.

- 应保留数据发布方名称和地图署名，不得把中转数据描述成程序直接连接官方机构。
- API Key 与中转凭据只能放在 `.env` 或部署平台 Secret 中，不得提交到仓库。
- 服务条款、配额和署名要求可能变化；公开或商业部署前应核对 CWA、USGS、EMSC、CEIC/CENC、GS RAS、Wolfx 及各地图服务商的最新要求。
- 本项目不承诺送达时限。地震预警属于初步信息，震级、位置和烈度可能被修订或撤回。
