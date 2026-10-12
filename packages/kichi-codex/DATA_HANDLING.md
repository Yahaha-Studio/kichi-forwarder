# 本地桌面插件的数据处理说明

本说明描述 Kichi for Codex 当前本地实现，供安装和连接前了解数据流；不是 Kichi 服务运营方的隐私政策或服务条款。

## 何时发送

安装插件与信任 Hooks 是本地执行权限。用户请求连接并成功 Join 后，使用同一 profile 的本地任务共享 MCP client 和所选 avatar，Hooks 自动发送任务活动状态、avatar 动作和短气泡。默认 profile 为 `default`，因此默认情况下可能包括其他聊天和后续本地任务，并不限于发起 Join 的聊天。

执行 `kichi_leave` 停止该 profile 的自动反馈。停止 bridge 时会显式离开已选 avatar；关闭 HTTP 连接本身不会离开角色。单独禁用 Hooks 停止生命周期反馈，仍可按用户请求调用 Kichi 工具。

## 发送到哪里、包含什么

数据通过本地配置的 MCP URL 发送到 Kichi 服务，默认是 Steam Playtest 的 `https://focus-steam-playtest-int.yahaha.com/mcp`。本地或开发测试使用 `configure --server-url` 配置对应服务，不在 Join 参数中选择环境。活动气泡可能展示给 Kichi 房间其他成员。

- 自动反馈包含活动状态和动作，以及用户提示词与可选工具 `title` 的短预览。预览按显示宽度上限 20 截断，超长时包含 `...`；提示词预览还会加引号。
- 完整用户提示词会通过本地 IPC 交给 bridge，在本地截短后才通过 MCP 作为气泡发送到 Kichi；完整提示词不会作为自动反馈上传或持久化。
- 不自动上传完整工具参数、工具输出、助手回复或 transcript。工具标题预览仍可能包含敏感信息，截短不等于脱敏。
- 用户主动调用工具时，会向远端 MCP 发送该操作所需的参数，例如便签内容、bot 消息、音乐名称或房间设置。消息和便签的受众由对应 Kichi 功能决定。

Kichi 服务器对收到的数据如何保存、保留多久和处理删除请求，需由服务运营方在其正式隐私政策中说明；本地源码不能证明服务器的保留行为。当前环境 token 是共享环境凭据，不是用户身份授权。

## 本地状态

运行目录位于 `$CODEX_HOME/kichi-codex/<profile>`；未设置 CODEX_HOME 时，位于用户目录的 `.codex/kichi-codex/<profile>`。`connection.json` 保存 MCP URL 和 token。bridge 在内存中保留当前 avatar 和 Hook 聚合状态，本地 named pipe / Unix socket 使用随机认证令牌。服务端 MCP 角色状态也保存在内存中，服务重启后需要重新 Join。

不要分享运行目录、token 文件、`connection.json` 或本地认证令牌，也不要将其打包进插件。修改连接配置前必须先停止 bridge，再执行 `configure` 并重新启动。若要删除本地数据，先 Leave，再运行 `node <已安装插件路径>/dist/cli.js stop` 停止 bridge，最后删除对应 profile 的运行目录。删除这些本地文件不会删除已发送到 Kichi 的数据。
