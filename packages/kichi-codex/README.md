# Kichi for Codex / ChatGPT 桌面 App

在现有桌面 App 的本地 Codex / Work 任务中，用 Kichi avatar 的动作和短气泡反馈正在做什么，并按需调用 Kichi 工具。

这是原生桌面插件：`.codex-plugin/plugin.json`、`hooks/hooks.json` 和 `.mcp.json` 由 App 加载。`src/cli.ts` 是插件自己的 Node 后端入口，不启动 Codex CLI、Codex SDK、App Server 或另一轮模型对话。

## 低 token 设计

- 生命周期反馈由本地 Hooks 固定映射，额外模型请求为 0；正常返回 `{}`，不注入 prompt、additionalContext 或 MCP instructions。
- 不附带 Skill，不要求模型在每个步骤调用 Kichi，不轮询任务或要求模型总结。
- Hooks 只保留会话、回合、工具等关联标识，不保存或发送 Codex 消息全文、工具输入输出和 transcript。
- 只注册 `kichi`、`kichi_describe` 两个简短 MCP 入口。操作参数、动作和音乐目录在需要时查询，避免 14 套完整 schema 常驻。
- 工具 schema 和插件元数据仍有少量上下文开销，实际调用也会产生输入输出 token；不宣称整个插件零 token。
- 相同动作和气泡去重；短 Hook 进程不加载 MCP SDK 或 Core，只发送本地 IPC。

## Avatar 反馈

| 事件 | 反馈 |
| --- | --- |
| 用户提交提示词 | 思考；收到新任务 |
| Shell / 文件编辑 / 其他本地工具 | 打字；正在执行命令 / 正在修改文件 / 正在调用工具 |
| 等待审批 | 等待；等待确认 |
| 上下文压缩 | 思考；整理上下文 |
| 子任务 | 思考；子任务协作中 |
| 回复停止节点 | 空闲；回复完成 |
| 用户中断 | 空闲；已暂停 |

状态按 session / turn 聚合，一个任务结束不会把其他活动任务设为 Idle。恢复会话会清理该会话的旧状态，压缩后的 SessionStart 保留活动回合。审批事件不包含调用 ID，因此按工具名保持等待，直到同类活动调用结束；不猜测审批对应的调用。

`Stop` 是观察到的停止节点，不代表业务成功。Hooks 不覆盖 WebSearch 等托管工具，也不提供完整回复流。当前功能只需要轻量表现，不扩展 Kichi 服务端协议。[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)

## 构建与桌面 App 安装

需要 Node.js >= 22.19.0。在仓库根目录运行：

```powershell
npm install --ignore-scripts
npm run build:codex
```

产物是新包内的 `dist/` 和 `config/`。动态模块都在 dist 同级，Core 的配置资源随包复制；运行不依赖仓库 node_modules。

使用官方 `@plugin-creator` 的个人 marketplace 流程，将构建包放入个人插件目录。需要一起分发 `.codex-plugin/`、`.mcp.json`、`hooks/`、`dist/`、`config/`、`package.json` 和本 README。无需增加 Skill。[官方创建插件文档](https://learn.chatgpt.com/docs/build-plugins)

首次使用：

1. 启动插件的本地连接服务。它会在后台运行，不弹出额外终端窗口：

   ```powershell
   node "$env:USERPROFILE/plugins/kichi-codex/dist/cli.js" start
   ```

2. 在当前 App 的 Plugins / 插件页中找到个人插件 **Kichi for Codex**，安装并信任其 Hooks。
3. 新建一个本地 Codex / Work 任务，让模型先通过 `kichi_describe` 查询 `join` 参数，再通过 `kichi` 加入你的 Kichi avatar。
4. 后续正常工作由 Hooks 自动反馈，不需要反复提及插件。

安装后使用的是 App 原有任务界面。普通 Chat 或云端任务不具备本机 Hook 执行环境，本插件不承诺在那里反馈本机 avatar。[官方桌面插件说明](https://learn.chatgpt.com/docs/plugins)

本地服务显式启动 / 停止；它不通过模型启动，也不在连接失败时偷偷创建另一份 runtime。MCP 与所有 Hooks 共用这一份服务。尚未 Join 或 Leave 后不发送自动状态，已授权但断连时明确报告失败。

服务管理：

```powershell
node "$env:USERPROFILE/plugins/kichi-codex/dist/cli.js" status
node "$env:USERPROFILE/plugins/kichi-codex/dist/cli.js" stop
```

更新插件前先 stop，替换构建包并按 plugin-creator 更新流程重新安装，再 start 和新建任务。重复 start 会明确失败，不创建第二个身份写入者。

## Kichi 工具

`kichi_describe({ action })` 返回指定操作的参数；`kichi({ action, parameters })` 执行。支持：

`join`、`switch_host`、`rejoin`、`leave`、`connection_status`、`action`、`glance`、`idle_plan`、`clock`、`query_status`、`music_album_create`、`noteboard_create`、`bot_message_history`、`bot_message`。

`join` 固定发送 `source: "codex"`；test 环境必须明确提供 host。工具参数严格检查，错误设置 `isError`，成功结果保持简短。有 ACK 才返回 `confirmed: true`；没有 ACK 的发送只报告已发送但未确认。

不提供 KichiClaw 专属日程或 OpenClaw 的 session / SOUL / 文件约定；也不自动回复 Kichi 入站消息。

## 数据与模块边界

默认 profile 为 `default`；可通过 `KICHI_CODEX_PROFILE` 选择。profile 只接受 1-64 个字母、数字、下划线或连字符。App 与后台服务需要继承同一个 profile 和 CODEX_HOME。

身份和日志位于 `$CODEX_HOME/kichi-codex/<profile>`，CODEX_HOME 未设置时使用用户目录下的 `.codex`。本地通信使用 Windows named pipe / Unix socket 和该目录中的随机认证令牌。

`runtime.ts` 独占 `KichiForwarderService` 和存储目录；`hooks.ts` 负责状态聚合；`mcp.ts/tools.ts` 负责按需工具。连接、身份、ACK、重连及既有协议继续由 Core 管理。本次没有修改 Core 或 OpenClaw。

## 验证边界

已完成代码审查及自包含构建。尚未运行自动化测试、连接 Kichi 或在 App 新任务中验证实际 avatar 表现。

安装并信任后，最直接的验收是：提交任务、执行一个本地工具、结束或中断一次，再观察 avatar；另开一个并行任务确认状态不会提前回到 Idle。服务端对 codex 来源的接受情况也需要在真实 Join 时确认。
