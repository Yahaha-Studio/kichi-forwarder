# Kichi for Hermes Agent

Hermes 原生插件，通过常驻 Node.js 子进程复用 `@yahaha-studio/kichi-core`。
Python 层负责 Hermes 工具注册、对话事件和子进程生命周期；Core 负责 Kichi
WebSocket、身份持久化、重连、请求确认和机器人聊天记录。

## 构建

需要 Node.js **22.19.0 或更新版本**，以及已安装的 Hermes Agent。
从仓库根目录执行：

```sh
npm ci
npm run build:hermes
```

`dist/bridge.mjs` 包含 Core 和 Node 运行依赖，`config/` 包含 Core 的动作、音乐
和环境配置。安装到 Hermes 的插件目录不需要 OpenClaw、Codex 或 `node_modules`。

## 安装

本次适配针对 Hermes **0.21.3**，源码版本
`a55c972e09177e4db3934915e329993858b247d6`。从仓库根目录打包：

```sh
npm pack --workspace=@yahaha-studio/kichi-hermes
```

以下是首次本地安装。Windows PowerShell：

```powershell
$kichiHermesHome = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:USERPROFILE '.hermes' }
$kichiPluginDir = Join-Path $kichiHermesHome 'plugins/kichi'
New-Item -ItemType Directory -Path $kichiPluginDir
tar -xzf yahaha-studio-kichi-hermes-0.2.0-beta.1.tgz -C $kichiPluginDir --strip-components=1
hermes plugins enable kichi
hermes -t kichi
```

Linux/macOS：

```sh
kichi_plugin_dir="${HERMES_HOME:-$HOME/.hermes}/plugins/kichi"
mkdir -p "$(dirname "$kichi_plugin_dir")"
mkdir "$kichi_plugin_dir"
tar -xzf yahaha-studio-kichi-hermes-0.2.0-beta.1.tgz -C "$kichi_plugin_dir" --strip-components=1
hermes plugins enable kichi
hermes -t kichi
```

`-t kichi` 用于只启用 Kichi 工具的首次验证；日常使用可以选择包含其他工具的工具集。
更新插件前关闭使用它的 Hermes 进程，再替换插件目录。卸载时先在对话中执行
`kichi_leave`，退出 Hermes，运行 `hermes plugins disable kichi` 后移除插件目录。

## 架构与范围

- 连接 Kichi 时固定使用 `source: hermes`，沿用服务器 `/ws/openclaw` 协议入口。
- 工具覆盖连接与退出、状态查询、动作、看向镜头、计时器、空闲计划、便签、音乐、
  机器人消息及聊天记录；业务校验使用现有 Core。
- Python 与 Node 使用本机标准输入/输出上的 JSON 消息通信。日志写到标准错误；
  桥接失败向调用方明确报错，不自动换实现或重试可能已发送的操作。
- Kichi 身份与聊天历史独立于 OpenClaw 和 Codex 的运行目录。
- 模型和 API 凭据由 Hermes 管理。插件不保存模型 API key，也不另建模型运行循环。

每个 Hermes profile 的 Kichi 数据保存在 `<HERMES_HOME>/kichi/`，其中
`state.json` 保存环境与 `llmRuntimeEnabled`，`hosts/` 保存身份，
`bot-message-history.json` 保存最近的机器人聊天记录。一个 profile 同时只允许
一个启用 Kichi 的 Hermes 进程；第二个进程会明确报锁冲突。不同头像请使用不同 profile。

### 机器人来信

CLI 完成首次对话后，来信通过 Hermes 自带的消息注入接口唤醒同一个代理。
网关或嵌入式宿主没有明确会话路由时，来信在下一轮 `pre_llm_call` 中提供；
本版不实现网关后台主动唤醒。所有来信仍由 Core 写入机器人聊天记录。
自动处理遵循最大深度 5、同一发送者 5 秒间隔，避免机器人无限互相回复。
关闭 `llmRuntimeEnabled` 会停止对话气泡及来信唤醒，显式工具仍可调用。

## 连接 Kichi

在启用插件的 Hermes 对话里，让代理调用 `kichi_join`，传入 Kichi 提供的
`avatarId` 和环境：`steam`、`steam-playtest` 或 `test`。测试环境还需要明确提供
`host`，例如 `127.0.0.1:48870`；这里填主机名或 IP 与端口，不带协议和 URL 路径。

```text
请连接 Kichi：environment=test，host=127.0.0.1:48870，avatarId=由 Kichi 提供的头像 ID。
连接成功后查询当前 Kichi 状态。
```

动作和歌曲名称应从插件配置、曲库工具获取。创建便签或音乐前先查询 Kichi 状态，
根据服务返回的场景、便签板和额度信息执行。

关闭 Hermes 会释放本次连接并保留身份，下次启动可以重连。需要解除身份时，
在关闭 Hermes 前明确调用 `kichi_leave`。

## 验收范围

集成验收使用真实 Hermes 插件加载器、工具注册表，以及仅监听本机的模拟 Kichi
WebSocket 服务。它验证适配器到 Core 的完整调用链，不代表真实 Kichi 客户端的
画面效果或线上环境已验收。

Hermes 插件接口参考：[官方开发文档](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins)。
