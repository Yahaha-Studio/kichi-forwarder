# Kichi for Codex / ChatGPT 桌面 App

在现有桌面 App 的本地 Codex / Work 任务中，用 Kichi avatar 的动作和短气泡反馈正在做什么，并按需调用 Kichi 工具。

这是原生桌面插件：`.codex-plugin/plugin.json`、`hooks/hooks.json` 和 `.mcp.json` 由 App 加载。`src/cli.ts` 是插件自己的 Node 后端入口，不启动 Codex CLI、Codex SDK、App Server 或另一轮模型对话。

当前包适用于手动安装的本地桌面插件，尚不符合普通公开插件目录的提交条件。ChatGPT 与 Codex 共用公开目录，但该提交流程暂不接受生命周期 Hooks，并要求公网 HTTPS MCP。完整发布差距见下文“公开目录发布”。

## 低 token 设计

- 生命周期反馈由本地 Hooks 固定映射，额外模型请求为 0；正常返回 `{}`，不注入 prompt、additionalContext 或 MCP instructions。
- 附带短 `kichi` Skill，只说明直接连接和按需工具入口；不要求模型在每个步骤调用 Kichi，不轮询任务或要求模型总结。
- Hooks 保留会话、回合、工具等关联标识。`UserPromptSubmit.prompt` 通过本地 IPC 传入 bridge，只将用户文本的短预览发送到 Kichi；工具参数仅保留 `tool_input.title` 的短预览。不持久化消息全文或保留其他工具参数、工具输出及 transcript。
- 注册 `kichi_join`、`kichi`、`kichi_describe` 三个简短 MCP 入口。连接参数直接可见；其他操作参数、动作和音乐目录在需要时查询，避免 15 套完整 schema 常驻。
- 工具 schema 和插件元数据仍有少量上下文开销，实际调用也会产生输入输出 token；不宣称整个插件零 token。
- 相同动作和气泡去重；短 Hook 进程不加载 MCP SDK 或 Core，只发送本地 IPC。

## Avatar 反馈

| 事件 | 反馈 |
| --- | --- |
| 用户提交提示词 | 思考；`message_received` 携带用户文本短预览 |
| Shell / 文件编辑 / 其他本地工具 | 打字；正在执行命令 / 正在修改文件 / 正在调用工具 |
| 等待审批 | 等待；等待确认 |
| 上下文压缩 | 思考；整理上下文 |
| 子任务 | 思考；子任务协作中 |
| 回复停止节点 | 空闲；回复完成 |
| 用户中断 | 空闲；已暂停 |

状态按 session / turn 聚合，一个任务结束不会把其他活动任务设为 Idle。恢复会话会清理该会话的旧状态，压缩后的 SessionStart 保留活动回合。审批事件不包含调用 ID，因此按工具名保持等待，直到同类活动调用结束；不猜测审批对应的调用。

用户消息预览去除首尾空白，按显示宽度上限 20 截断（中文和 emoji 通常计 2，超长时预留 `...`），再加英文双引号作为 `message_received.bubble`。空文本不发送消息预览，仍更新思考状态。新适配层可参考 [Core 接入标准](../kichi-core/README.md)。

工具调用和审批 Hook 的 `tool_input.title` 为非空字符串时，在原状态文案后拼接 ` · 标题预览`；标题使用同样的显示宽度上限 20。没有有效标题时保留原文案，不使用 `description`。工具标题按调用 ID 保存，审批标题来自该审批事件；不推测子 agent 的名字与 ID 关联。

`Stop` 是观察到的停止节点，不代表业务成功。Hooks 不覆盖 WebSearch 等托管工具，也不提供完整回复流。当前功能只需要轻量表现，不扩展 Kichi 服务端协议。[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)

## 桌面 App 使用

需要 Node.js >= 22.19.0。在 App 的 Plugins / 插件页安装 **Kichi for Codex** 并信任其 Hooks，然后新建一个本地 Codex / Work 任务。

App 加载插件时自动启动本地桥接，MCP 与 Hooks 共用一个 profile runtime。用户无需执行 start、npm 或 OpenClaw 命令，也无需单独安装 Kichi Core；Core、MCP SDK 与运行依赖已经打进插件产物。

提供 Kichi 给出的连接信息即可，例如：

连接后，同一 profile 的本地任务会自动将活动状态、用户提示词短预览和工具标题短预览发送到所选 Kichi 服务器，房间其他成员可能看到这些气泡。这个范围包括使用该 profile 的其他聊天；执行 `leave` 可停止该 profile 的自动反馈。完整说明见 [数据处理说明](DATA_HANDLING.md)。

> 帮我加入 Kichi：environment=test，host=你的测试服地址，avatarId=你的-avatar-id。

Codex 直接调用一次 `kichi_join` 完成连接并等待 Join ACK；无需先查询参数、生成角色资料或读取 OpenClaw 安装文档。后续普通工作由 Hooks 自动反馈。

安装后使用 App 原有任务界面。普通 Chat 或云端任务不具备本机 Hook 执行环境，本插件不承诺在那里反馈本机 avatar。[官方桌面插件说明](https://learn.chatgpt.com/docs/plugins)

尚未 Join 或 Leave 后不发送自动状态；连接错误明确返回给调用者。

## 开发者构建与分发

在仓库根目录运行：

```powershell
npm install --ignore-scripts
npm run build:codex
```

产物为新包内的 `dist/` 和 `config/`。动态模块都在 dist 同级，Core 配置资源随包复制；运行不依赖仓库 `node_modules`。

使用官方 `@plugin-creator` 的个人 marketplace 流程分发构建包。需要一起分发 `.codex-plugin/`、`.mcp.json`、`hooks/`、`skills/`、`assets/`、`dist/`、`config/`、`package.json`、`DATA_HANDLING.md` 和本 README。方形图标复用仓库封面的 Kichi 字标区域。[官方创建插件文档](https://developers.openai.com/plugins/build/plugins)

更新已运行的桥接时，先运行 `node <已安装插件路径>/dist/cli.js stop` 停止旧实例，再按 plugin-creator 的更新流程重新安装。通过 CLI 更新版本后，完整退出并重新打开桌面 App，再创建新任务；App 后端可能仍缓存旧版本的 MCP 启动路径，仅新建任务不足以刷新。新任务会自动启动新版桥接。

Hook 由任务的 Shell 执行，Windows App 中可能是 PowerShell。启动命令使用 Node 读取 `PLUGIN_ROOT`，不依赖 Shell 的环境变量语法。修改 Hook 定义后，需要在 App 的 Hook 管理中重新信任新定义，否则 Codex 会跳过执行。[官方 Hook 信任规则](https://learn.chatgpt.com/docs/hooks)

## 公开目录发布

截至 2026-10-09，本地 marketplace 安装与公开目录发布是不同流程。当前 `.codex-plugin/plugin.json` 格式仍被官方接受，不需要另加一份兼容清单；但现有功能有以下公开提交阻碍：

| 项目 | 当前状态与所需调整 |
| --- | --- |
| 生命周期 Hooks | 普通公开目录不接受含 Hooks 的插件；自动 avatar 反馈依赖 Hooks，不能仅修改清单就保留该功能并公开提交。 |
| MCP 连接 | 当前为本地 stdio。普通公开提交需要可访问的公网 HTTPS MCP；无法迁移本地执行需求时，须联系 OpenAI 申请本地 MCP 支持。 |
| 工具暴露 | 本地版为减少常驻 schema 使用 `kichi` 通用执行器和 `kichi_describe`。公开版必须逐项暴露操作的描述、参数与注解，不能用这套发现/通用执行模式。 |
| 工具注解 | 三个本地入口均显式标注读写、破坏性、开放范围和幂等性；混合操作入口按其整体副作用标注，不可当作只读工具。 |
| 展示材料 | 已补齐 30 字符以内的简介、能力标签、方形图标、示例提示和入门技能入口。发布者名称仍需与提交时验证的身份一致。 |
| 运营与审核 | 远程 MCP 版需要真实的产品、支持、隐私政策、服务条款 HTTPS 链接，以及域名验证、适用的 OAuth、审核账号、5 个正向案例、3 个反向案例和演示视频。凭据只填审核后台，不打进包。 |

[官方打包要求](https://developers.openai.com/plugins/build/plugins)、[官方提交字段与流程](https://developers.openai.com/plugins/deploy/submission)、[官方工具准则](https://developers.openai.com/plugins/plugin-guidelines)。本包的 `DATA_HANDLING.md` 描述本地实现，不代替服务运营方的正式隐私政策或服务条款；清单中不填写虚构政策、支持或远程 MCP 地址。

## Kichi 工具

`kichi_join({ environment, avatarId, host?, botName?, bio?, tags? })` 是唯一连接入口。`environment` 和 `avatarId` 必填；test 环境还需 `host`。默认 `botName: "Codex"`、`bio: "A coding companion."`、`tags: []`，固定发送 `source: "codex"`。

其他操作通过 `kichi({ action, parameters })` 执行，需要参数说明时查询 `kichi_describe({ action })`：

`switch_host`、`rejoin`、`leave`、`connection_status`、`action`、`glance`、`emoji`、`idle_plan`、`clock`、`environment`、`query_status`、`music_album_create`、`noteboard_create`、`bot_message_history`、`bot_message`。

`emoji` 显示头像头顶的一个受支持表情：`emojiName` 必须是 `Heart`、`Like`、`Happy`、`Celebrate`、`Keep Going`、`Peeking`、`Laughing`、`Sleeping`、`Coffee` 或 `Waving`，可选 `requestId` 用于追踪。成功 ACK 表示服务端已接受并广播，不表示客户端已完成渲染，结果包含 `sent: true, confirmed: false`。

`environment` 设置房间天气、时间、House 灯光、环境光和音乐播放：`weather` 为 `Sunny` / `Cloudy` / `Rainy` / `Snowy`，`time` 为 `Auto` / `Morning` / `Day` / `Evening` / `Night`，`Auto` 恢复自动时间。`lightingValue` 设置 House 灯光强度（`0.1–2`），`lightingEnabled` 控制 House 灯光总开关，关灯使用 `false`。环境光独立控制：`ambientLightIntensity` 为 `0.5–3` 的有限数值，`ambientLightEnabled` 为布尔开关。

`musicPaused: true` 暂停当前音乐，`false` 恢复；`musicAction` 使用 `Next` / `Previous` 切换曲目，`musicPlayType` 使用 `Loop`（顺序播放）/ `Random`（随机播放）。指定音乐使用 `musicAlbumTitle`、`musicTitle` 或两者，按精确专辑名和曲名匹配；`kichi_describe({ action: "environment" })` 的参数说明列出曲库 `album` / `name` 字段中的已知内置名称，用户精选专辑和曲目也可按实际精确名称指定。名称会 trim，不能留空；任一指定音乐字段都不能与 `musicPaused`（包括 `false`）或 `musicAction` 同传，但可与 `musicPlayType` 组合。至少提供一个设置，房间权限由服务端校验。成功 ACK 表示服务端已转发控制，返回 `sent: true`。

工具参数严格检查，错误设置 `isError`，成功结果保持简短。

不提供 KichiClaw 专属日程或 OpenClaw 的 session / SOUL / 文件约定；也不自动回复 Kichi 入站消息。

## 数据与模块边界

默认 profile 为 `default`；可通过 `KICHI_CODEX_PROFILE` 选择。profile 只接受 1-64 个字母、数字、下划线或连字符。App 与后台服务需要继承同一个 profile 和 CODEX_HOME。

身份和日志位于 `$CODEX_HOME/kichi-codex/<profile>`，CODEX_HOME 未设置时使用用户目录下的 `.codex`。本地通信使用 Windows named pipe / Unix socket 和该目录中的随机认证令牌。

`runtime.ts` 独占 `KichiForwarderService` 和存储目录；`hooks.ts` 负责状态聚合和用户消息预览；`mcp.ts/tools.ts` 负责按需工具。连接、身份、ACK、重连及既有协议继续由 Core 管理。

## 验证边界

安装并信任后，最直接的验收是：在新任务中直接 Join，提交任务、执行一个本地工具、结束或中断一次，再观察 avatar；另开一个并行任务确认状态不会提前回到 Idle。自包含构建不能替代真实 App 加载与 Kichi Join 验证。

## 随机动作

每轮问答开始时随机选择坐姿或站姿，该轮内直到结束都保持同一姿势。每次 Hook 同步只从当前状态、当前姿势的候选池随机选择一个动作，允许抽中相同动作。并行问答共用当前姿势，全部结束后下一轮才重新选择。不生成动作序列、不使用定时切换，也不增加模型调用。

## 气泡语言

自动生命周期气泡支持中文（`zh`）、日文（`ja`）、韩文（`ko`）和英文（`en`），其他语言使用英文。bridge 启动时读取一次系统显示语言：Windows 使用 UI culture，macOS 使用系统首选语言，其他平台使用进程 locale。Windows/macOS 的区域格式和对话语言不决定气泡语言；修改系统语言后需重启 bridge。

翻译使用本地文案，不增加模型调用或提示词 token。Hook 仍使用统一的 Node 启动命令，仅 bridge 启动时调用 Windows/macOS 自带的语言读取接口；读取失败会明确报启动错误。
