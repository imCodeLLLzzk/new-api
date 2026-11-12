# AGENTS.md — relay/ (上游协议与渠道适配层)

本目录实现「客户端协议 → 上游供应商请求 → 上游响应 → 客户端协议」的转换与转发，是本项目噪音最高的一层。

## 一、职责与入口

- 入口装配：`relay_adaptor.go`（`GetAdaptor` 按 `apiType` 分发）、`relay_info.go` 语义在 `common/relay_info.go`
- 协议处理器：`responses_handler.go`、`claude_handler.go`、`gemini_handler.go`、`embedding_handler.go`、`audio_handler.go`、`image_handler.go`、`responses_websocket.go`
- 渠道接口定义：`channel/adapter.go`（`Adaptor` / `TaskAdaptor` / 各可选能力接口）

## 二、检索禁令（Do Not）

- **禁止遍历 `channel/*/`**。`relay/channel/` 下 45 个供应商目录结构同构（多为 `adaptor.go` + `constants.go`），只读你本次要改的那一个，其余不要 Grep、不要批量打开。
- **禁止全目录 `grep` 协议名**。协议名（OpenAI / Claude / Gemini / Responses）散落在 45 个目录里，用 `relay/relay_adaptor.go` 的 switch 判断归属，再定点读单个文件。
- **禁止把 `common/`、`helper/`、`constant/` 当作渠道目录遍历**，它们是共享层，不是供应商实现。
- `relay/channel/task/jsplugin/` 是 JS 插件适配器，不属于供应商目录族。
- `*_test.go` 与 `*.log` 属噪音；日志产物不在本目录产生，无需检索。

## 三、模式锚点

新增或修改供应商适配器时，**只参考 `channel/openai/adaptor.go`**。它是 `channel.Adaptor` 接口的完整参考实现，覆盖 `GetRequestURL` / `SetupRequestHeader` / `Convert*Request` / `DoRequest` / `DoResponse` / `GetModelList` / `GetChannelName` 全部方法。

- 不支持的协议方法统一返回 `nil, errors.New("not implemented")`（见 `channel/deepseek/adaptor.go:29`、`:56`、`:61`、`:197`）。
- 需要复用另一供应商能力时**委托而非复制**：`channel/deepseek/adaptor.go:282` 的 `DoResponse` 按 `info.RelayFormat` 转发给 `claude.Adaptor{}` / `openai.Adaptor{}`。
- 复用 OpenAI 兼容上游时，新目录可只写差异部分并复用 `openai.Adaptor{}`（`relay_adaptor.go` 中多个 `APIType` 直接 `return &openai.Adaptor{}`）。
- 注册新渠道须同步改 `relay_adaptor.go` 的 `GetAdaptor` switch 与 `constant/` 中的 `APIType` 常量，漏改则运行时返回 `nil` adaptor。

## 四、局部验证命令

仅针对本次改动的包，禁止全量构建：

```bash
# 静态检查单个供应商目录
GOWORK=off go vet ./relay/channel/<vendor>/

# 静态检查整个 relay 层（不涉及其他层）
GOWORK=off go vet ./relay/...

# 只跑本次改动包的测试
GOWORK=off go test ./relay/channel/<vendor>/ -count=1

# 涉及共享层时
GOWORK=off go test ./relay/common/ ./relay/helper/ -count=1
```

## 五、本层专属约束

- 上游请求 DTO 的可选标量字段必须用指针 + `omitempty`（`*int` / `*uint` / `*float64` / `*bool`），显式 `0` / `false` 必须保留，缺省必须是 `nil`。
- 新增支持 `StreamOptions` 的供应商，须加入 `streamSupportedChannels`。
- 计费字段（`OtherRatios`、图片张数、时长秒数）的推导与结算规则见根 `AGENTS.md` 的计费读门；改动前必须先读 `.agents/rules/billing.md`。
- JSON 编解码一律走 `common.Marshal` / `common.Unmarshal`，禁止直接调用 `encoding/json`。
- `relaykit/` 与 `tokenkit/` 是独立 Go 模块，本层引用它们但不得让它们反向依赖宿主模块；改动其公共 API 后须在各自目录内用 `GOWORK=off go build ./...` 验证。
