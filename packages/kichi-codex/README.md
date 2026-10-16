# Kichi for Codex / ChatGPT 桌面 App

在现有桌面 App 的本地 Codex / Work 任务中，用 Kichi avatar 的动作和短气泡反馈正在做什么，并按需调用 Kichi 工具。

这是原生桌面插件：`.codex-plugin/plugin.json`、`hooks/hooks.json` 和 `.mcp.json` 由 App 加载。`src/cli.ts` 是插件自己的 Node 后端入口，不启动 Codex CLI、Codex SDK、App Server 或另一轮模型对话。

工具调用和 Hook 反馈都通过同一个远端 MCP 服务发送。默认连接 Steam Playtest 的 `https://focus-steam-playtest-int.yahaha.com/mcp`。本地 stdio MCP 只负责透传远端工具；本地 bridge 负责共享 MCP client、所选 avatar 和 Hook 状态，不依赖 Kichi Core 或 WebSocket。

当前包适用于手动安装的本地桌面插件。使用公网 MCP 不等于已满足普通公开插件目录的提交条件：公开目录仍不接受生命周期 Hooks，共享环境 token 也不是用户身份授权。完整发布差距见下文“公开目录发布”。

## 低 token 设计

- 生命周期反馈由本地 Hooks 固定映射，额外模型请求为 0；正常返回 `{}`，不注入 prompt、additionalContext 或 MCP instructions。
- 附带短 `kichi` Skill，只说明连接和按需工具入口；不要求模型在每个步骤调用 Kichi，不轮询任务或要求模型总结。
- Hooks 保留会话、回合、工具等关联标识。`UserPromptSubmit.prompt` 通过本地 IPC 传入 bridge，只将用户文本的短预览发送到 Kichi；工具参数仅保留 `tool_input.title` 的短预览。不持久化消息全文或保留其他工具参数、工具输出及 transcript。
- 本地 MCP 动态返回远端 `tools/list` 中的独立 `kichi_*` 工具。工具名称、参数 schema 和注解由服务端提供。
- 工具 schema 和插件元数据有上下文开销，实际调用也会产生输入输出 token；不宣称整个插件零 token。
- 相同动作和气泡去重；短 Hook 进程只发送本地 IPC。

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

状态按 session / turn 聚合，一个任务结束不会把其他活动任务设为 Idle。恢复会话会清理该会话的旧状态，压缩后的 SessionStart 保留活动回合。审批事件不包含调用 ID，因此按工具名保持等待，直到同类活动调用结束；不猜测审批对应的调用。Kichi 工具调用不会触发覆盖用户指定动作的自动工具反馈。

用户消息预览去除首尾空白，按显示宽度上限 20 截断（中文和 emoji 通常计 2，超长时预留 `...`），再加英文双引号作为 `message_received.bubble`。空文本不发送消息预览，仍更新思考状态。

工具调用和审批 Hook 的 `tool_input.title` 为非空字符串时，在原状态文案后拼接 ` · 标题预览`；标题使用同样的显示宽度上限 20。没有有效标题时保留原文案，不使用 `description`。工具标题按调用 ID 保存，审批标题来自该审批事件；不推测子 agent 的名字与 ID 关联。

`Stop` 是观察到的停止节点，不代表业务成功。Hooks 不覆盖 WebSearch 等托管工具，也不提供完整回复流。[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)

## 桌面 App 使用

需要 Node.js >= 22.19.0，并确保 `node` 可从 App 启动的本地 Shell 找到。先在终端把本仓库添加为插件 marketplace，再在 ChatGPT 桌面 App 的 Plugins / 插件页安装 **Kichi for Codex**：

```powershell
codex plugin marketplace add https://github.com/Yahaha-Studio/kichi-forwarder.git
codex plugin add kichi-codex@kichi
```

安装后在 App 的插件设置中审核并信任 Kichi 的 Hooks。GitHub marketplace 只负责分发插件；Hooks 在本地运行环境执行。

首次使用前配置 MCP token。token 文件只放在本机，不放进插件包或仓库：

```powershell
kichi-codex configure --token-file C:\private\kichi-mcp-token.txt
```

默认 server URL 为 `https://focus-steam-playtest-int.yahaha.com/mcp`。本地或开发测试环境通过 `--server-url` 配置对应 MCP URL 和对应 token：

```powershell
kichi-codex configure --token-file C:\private\dev-mcp-token.txt --server-url http://localhost:5000/mcp
```

配置写入 `$CODEX_HOME/kichi-codex/<profile>/connection.json`，其中包含 URL 和 token。修改已运行 profile 的连接配置时，必须先 `kichi-codex stop`，再执行 `configure`，最后 `kichi-codex start`。停止 bridge 会对已选 avatar 显式执行 Leave；切换服务后需要重新 Join。

App 加载插件时自动启动本地桥接，MCP 与 Hooks 共用一个 profile runtime。用户无需单独安装 Kichi Core；MCP SDK 与运行依赖已经打进插件产物。也可通过 `start`、`stop` 和 `status` 管理 bridge；`mcp` 和 `hook` 是 App 使用的入口。

在新建的本地 Codex / Work 任务中提供 avatar ID 即可：

> 帮我加入 Kichi：avatarId=你的-avatar-id。

Codex 调用一次 `kichi_join` 并等待服务端结果。MCP URL 已确定连接的服务和环境，Join 不接受 `environment` 或 `host`。`avatarId`、`botName` 和 `bio` 是必填字段；用户未指定角色名称和简介时，Skill 使用 `Codex` 和 `A coding companion.`，无需额外生成资料。`tags` 可选。服务端将此连接标记为 `source: "mcp"`。

连接后，同一 profile 的本地任务会自动将活动状态、用户提示词短预览和工具标题短预览发送到所配置的 MCP 服务，房间其他成员可能看到这些气泡。这个范围包括使用该 profile 的其他聊天；执行 `kichi_leave` 停止该 profile 的自动反馈。完整说明见 [数据处理说明](DATA_HANDLING.md)。

安装后使用 App 原有任务界面。普通 Chat 或云端任务不具备本机 Hook 执行环境，本插件不承诺在那里反馈本机 avatar。[官方桌面插件说明](https://learn.chatgpt.com/docs/plugins)

尚未 Join 或 Leave 后不发送自动状态。连接和工具错误明确返回给调用者。服务端角色状态保存在内存中，服务重启后需要重新 Join。关闭 HTTP 连接不等于 Leave；停止 bridge 时会显式离开已选 avatar。服务端按 avatar 共享 MCP 角色状态，不要让多个 profile 对同一 avatar 重复 Join。

## 开发者构建与分发

在仓库根目录运行：

```powershell
npm install --ignore-scripts
npm run build:codex
```

产物为包内的 `dist/`，并提交到 GitHub marketplace 使用的插件目录。动态模块都在 dist 同级；运行不依赖仓库 `node_modules`。修改 `src/` 后必须重新运行构建并更新产物。

仓库根目录的 `.agents/plugins/marketplace.json` 已将 `packages/kichi-codex` 注册为 GitHub marketplace 插件。需要一起分发 `.codex-plugin/`、`.mcp.json`、`hooks/`、`skills/`、`assets/`、`dist/`、`package.json`、`DATA_HANDLING.md` 和本 README。MCP token 和本机 `connection.json` 不得包含在分发文件中。方形图标复用仓库封面的 Kichi 字标区域。[官方创建插件文档](https://developers.openai.com/plugins/build/plugins)

更新已运行的桥接时，先运行 `node <已安装插件路径>/dist/cli.js stop` 停止旧实例，再按 plugin-creator 的更新流程重新安装。通过 CLI 更新版本后，完整退出并重新打开桌面 App，再创建新任务；App 后端可能仍缓存旧版本的 MCP 启动路径，仅新建任务不足以刷新。新任务会自动启动新版桥接。

Hook 由任务的 Shell 执行，Windows App 中可能是 PowerShell。启动命令使用 Node 读取 `PLUGIN_ROOT`，不依赖 Shell 的环境变量语法。修改 Hook 定义后，需要在 App 的 Hook 管理中重新信任新定义，否则 Codex 会跳过执行。[官方 Hook 信任规则](https://learn.chatgpt.com/docs/hooks)

## 公开目录发布

本地 marketplace 安装与公开目录发布是不同流程。当前功能有以下公开提交阻碍：

| 项目 | 当前状态与所需调整 |
| --- | --- |
| 生命周期 Hooks | 普通公开目录不接受含 Hooks 的插件；自动 avatar 反馈依赖 Hooks。 |
| MCP 连接 | 所有操作已经发送到公网 HTTPS MCP，但桌面插件入口仍使用本地 stdio 代理和 bridge。普通公开提交需要满足远端 MCP 要求；本地执行需求仍需单独处理。 |
| 工具暴露 | 动态透传服务端提供的独立 `kichi_*` 工具、参数 schema 和注解。 |
| 身份授权 | 当前环境 token 是共享环境凭据，不是用户级身份授权；面向公众需要服务端提供适用的授权和身份隔离。 |
| 展示材料 | 已补齐 30 字符以内的简介、能力标签、方形图标、示例提示和入门技能入口。发布者名称仍需与提交时验证的身份一致。 |
| 运营与审核 | 需要真实的产品、支持、隐私政策、服务条款 HTTPS 链接，以及域名验证、适用的 OAuth、审核账号、5 个正向案例、3 个反向案例和演示视频。凭据只填审核后台，不打进包。 |

[官方打包要求](https://developers.openai.com/plugins/build/plugins)、[官方提交字段与流程](https://developers.openai.com/plugins/deploy/submission)、[官方工具准则](https://developers.openai.com/plugins/plugin-guidelines)。本包的 `DATA_HANDLING.md` 描述本地实现，不代替服务运营方的正式隐私政策或服务条款；清单中不填写虚构政策或支持地址。

## Kichi 工具

`kichi_join({ request: { avatarId, botName, bio, tags? } })` 选择角色并加入已配置的 MCP 服务。连接配置由本地 CLI 管理，不属于 Join 参数。示例：

```json
{
  "request": {
    "avatarId": "你的-avatar-id",
    "botName": "Codex",
    "bio": "A coding companion.",
    "tags": []
  }
}
```

所有操作直接调用远端 `tools/list` 返回的独立 `kichi_*` 工具，参数放在 `request` 内，具体字段和动作目录以服务端 schema 为准。使用 `kichi_leave({ request: { avatarId } })` 显式离开。房间天气、时间、灯光与音乐属于房间操作，和 MCP server URL 的环境选择无关。

用户待办和日常习惯也通过服务端动态发现的工具操作，无需在 Codex 插件中重复定义 schema 或分发逻辑。`kichi_todo_task_*` 支持待办的查询、创建、更新、排序、完成和删除；`kichi_routine_*` 支持日常习惯的查询、创建、删除和批量更新。这里的 task/routine 管理用户待办、习惯及打卡日期，不负责自动执行调度，与 MCP 的异步任务执行协议和 KichiClaw 专属日程功能分别独立。

待办和日常习惯的写入要求用户游戏客户端在线，且所选角色不是 injected 类型。待办更新需提供完整的 `title` 和 `colorIndex`，省略或传入 null 的 `deadline` 会清空截止时间。routine 日期使用 `yyyy-MM-dd`；指定非空日期数组时必须同时提供 `timeZoneId`，批量更新每项都必须提供 `datesToAdd` 和 `datesToRemove`，没有变化时传空数组。用户要求完成待办时调用 `kichi_todo_task_complete`，要求删除时调用 `kichi_todo_task_delete`，两者均使用任务 `id`。完成操作当前会从待办列表移除任务，不保留已完成状态，也没有取消完成入口。

`kichi_timer` 控制人类玩家自己的计时器，支持 `Start`、`Pause` 和 `Stop`；`kichi_clock` 仍用于 Agent Avatar 的 clock。参数放在 `request` 中，角色参数遵循服务端 schema。`Start` 不带 `snapshot` 时恢复未完成的计时器，或使用玩家当前面板配置；带 `snapshot` 时创建新计时器，支持以下三种快照：

| 类型 | `snapshot` 示例与范围 |
| --- | --- |
| 倒计时 | `{ "timerType": "CountDown", "totalTime": 1500 }`；`totalTime` 的范围为 1–5999 秒。 |
| 正计时 | `{ "timerType": "CountUp" }`。 |
| 番茄钟 | `{ "timerType": "Pomodoro", "focusTime": 1500, "shortBreakTime": 300, "longBreakTime": 900, "sessionCount": 4 }`；三个时间字段为 1–5940 的整数秒，`sessionCount` 为 1–99 的整数。 |

`focusTag` 仅允许随带 `snapshot` 的 `Start` 提供，省略时沿用玩家面板标签，规范化由服务端负责。`Pause` 和 `Stop` 不传 `snapshot` 或 `focusTag`。不要传未知字段或运行态字段。timer 仅响应用户明确要求的计时器操作，不调度 Agent 唤醒或后台任务；成功结果表示服务端已转发，不能据此声称客户端已应用。

只有用户明确请求 Kichi 操作时才调用世界工具。成功转发或广播结果不代表客户端完成渲染；按服务端返回的确认范围报告。错误结果明确报告。

KichiClaw 专属日程和 OpenClaw 的 session / SOUL / 文件约定不属于本插件的能力；也不自动回复 Kichi 入站消息。

## 数据与模块边界

默认 profile 为 `default`；可通过 `KICHI_CODEX_PROFILE` 选择。profile 只接受 1-64 个字母、数字、下划线或连字符。App 与后台服务需要继承同一个 profile 和 CODEX_HOME。

配置和日志位于 `$CODEX_HOME/kichi-codex/<profile>`，CODEX_HOME 未设置时使用用户目录下的 `.codex`。`connection.json` 保存 MCP URL 和 token。本地通信使用 Windows named pipe / Unix socket 和该目录中的随机认证令牌。

`runtime.ts` 持有 profile 唯一的远端 MCP client 和当前 avatar；`hooks.ts` 负责状态聚合和短预览；`mcp.ts` 将远端工具定义和调用结果透传给 App。Hook 动作与消息也使用这个 MCP client。角色与世界操作由远端服务负责，不依赖 Kichi Core。

## 验证边界

配置、安装并信任后，最直接的验收是：在新任务中 Join，提交任务、执行一个本地工具、结束或中断一次，再观察 avatar，最后显式 Leave；另开一个并行任务确认状态不会提前回到 Idle。自包含构建不能替代真实 App 加载与 MCP 操作验证。

## 随机动作

每轮问答开始时随机选择坐姿或站姿，该轮内直到结束都保持同一姿势。每次 Hook 同步只从当前状态、当前姿势的候选池随机选择一个动作，允许抽中相同动作。并行问答共用当前姿势，全部结束后下一轮才重新选择。不生成动作序列、不使用定时切换，也不增加模型调用。

## 气泡语言

自动生命周期气泡支持中文（`zh`）、日文（`ja`）、韩文（`ko`）和英文（`en`），其他语言使用英文。bridge 启动时读取一次系统显示语言：Windows 使用 UI culture，macOS 使用系统首选语言，其他平台使用进程 locale。Windows/macOS 的区域格式和对话语言不决定气泡语言；修改系统语言后需重启 bridge。

翻译使用本地文案，不增加模型调用或提示词 token。Hook 仍使用统一的 Node 启动命令，仅 bridge 启动时调用 Windows/macOS 自带的语言读取接口；读取失败会明确报启动错误。
