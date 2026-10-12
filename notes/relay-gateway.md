# AI Token 中转站 — 核心技术地图

> 写给要学"AI 网关 / 中转站"这一类产品的工程师。本文以 new-api 项目为具体载体，**所有路径与行号均为本仓库当前 `feature/V0.1` 分支实测**，但每个模块先讲的是**领域理论**，再看 **本项目如何实现**——**项目本身只是发散的起点**。
>
> 阅读顺序：先读 §0 把握骨架，再按需跳读模块章节。

---

## §0. 总览：AI Token 中转站在做什么

AI 中转站（AI API Gateway / Token Router）解决的是同一类问题：客户端开发者要使用多家 AI 厂商，不想分别谈合同、维护多套 API 密钥、做不同的计费 / 限流 / 监控。中转站在客户端和上游之间做四件事：

```
┌──────────────┐    客户端协议（OpenAI / Claude / Gemini 等）     ┌────────────────────────┐    上游协议（厂商私有）     ┌──────────────┐
│   客户端     │  ───────────────────────────────────────────▶  │   AI Token 中转站      │  ──────────────────▶  │  上游 AI 厂商 │
│  (LLM 应用)  │  ◀───────────────────────────────────────────  │   (本文)               │  ◀──────────────────  │  (OpenAI 等) │
└──────────────┘                                                 └────────────────────────┘                        └──────────────┘
```

| 职能 | 客户端协议 → 内部信封 → 上游协议 | §A 协议适配 |
| 职能 | 多个上游 key / 多个 channel 中挑一个发 | §B 路由与多通道 |
| 职能 | 按使用量（token / 张 / 秒）扣费 | §C Token 计量与计费 |
| 职能 | 流式 / 实时转发 | §D 流式响应 |
| 职能 | 异步任务（视频生成等） | §E 异步任务 |
| 职能 | 鉴权 / 限流 / 防护 | §F 认证与限流 |
| 职能 | 第三方能力以插件形式接入 | §G 插件体系 |
| 职能 | 全链路审计、可观测 | §H 可观测与审计 |

### 中转站的产品形态

AI 网关大致有三类产品：

| 类型 | 例子 | 关注点 |
|---|---|---|
| **统一 API 出口**（本文 new-api） | OpenRouter、new-api、one-api | 多厂商聚合 + 计费 + 多用户 |
| **企业 LLM 网关** | Portkey、LiteLLM、Helicone | 成本监控、缓存、限流 |
| **API 反向代理 / 转发器** | nginx-llm、api2d | 协议转换 + 代理 |

本文主要讲第一种。

---

## §A. 模块 1 — 协议适配层（Adapter 模式）

### 核心概念与理论（先学这些）

**Adapter / Wrapper 模式**（《设计模式》Gamma et al.）：把一个类的接口转换成客户端期望的另一种接口。在这里有两个适配方向：

1. **客户端 → 内部**：客户端发 OpenAI / Claude / Gemini 等"标准协议"，网关收到后转成统一的内部信封（`RelayInfo`）。
2. **内部 → 上游**：内部信封 + 内部 DTO 翻译成 OpenAI 官方 / 百度千帆 / 阿里通义等"厂商私有协议"。

**协议的本质**：HTTP + JSON（或 multipart）。LLM API 大致由这几类构成：
- **对话补全**：`POST /v1/chat/completions`（OpenAI 标准）
- **消息**：`POST /v1/messages`（Anthropic 标准）
- **生成式内容**：`POST /v1beta/models/{model}:generateContent`（Gemini 标准）
- **响应**：`POST /v1/responses`（OpenAI Responses 新协议，含多轮工具调用与状态管理）
- **嵌入**：`POST /v1/embeddings`
- **图像**：`POST /v1/images/generations` / `/images/edits`
- **音频**：`POST /v1/audio/speech` / `/transcriptions` / `/translations`
- **重排**：`POST /v1/rerank`
- **实时（WebSocket）**：`GET /v1/realtime`
- **异步任务**：`POST /v1/videos` / `/images/generations`（异步，按任务 ID 轮询或回调）

**为什么需要 Adaptor 抽象**：上游协议每年都在演化（Responses API、Realtime API、多模态协议），每个厂商又有差异；客户端只想要稳定。Adaptor 把"会变化的部分"隔离在 `relay/channel/<vendor>/` 下，主流程（控制器 / 计费 / 重试）只面对一个不变化的接口。

### 本项目如何实现

**Adaptor 接口** 在 `relay/channel/adapter.go`：

| 文件 / 行号 | 内容 | 备注 |
|---|---|---|
| `relay/channel/adapter.go:17` | `type Adaptor interface` | **整个项目的核心扩展点** |
| `relay/channel/adapter.go:19-27` | `Init / GetRequestURL / SetupRequestHeader / ConvertOpenAIRequest / ConvertRerankRequest / ConvertEmbeddingRequest / ConvertAudioRequest / ConvertImageRequest / ConvertOpenAIResponsesRequest` | 协议映射层 |
| `relay/channel/adapter.go:30-32` | `DoRequest / DoResponse` | 传输层 |
| `relay/channel/adapter.go:48` | `type TaskAdaptor interface` | 异步任务的另一套接口（§E） |

**Adaptor 注册中心**：

| 文件 / 行号 | 内容 |
|---|---|
| `relay/relay_adaptor.go:50` | `func GetAdaptor(apiType int) channel.Adaptor` —— **switch-case 注册表** |
| `relay/relay_adaptor.go:188` | `func GetTaskAdaptor(platform constant.TaskPlatform) channel.TaskAdaptor` |
| `relay/relay_adaptor.go:199` | `getTaskAdaptorForRequest` —— 解析 channel 选择 Adaptor |

**每个厂商一个目录**，`relay/channel/` 下有 40 个子目录，每个子目录至少含 `adaptor.go`：

```
relay/channel/
├── openai/       ← 最简单的范本（与上游 OpenAI 几乎同构）
├── claude/       ← Anthropic
├── gemini/
├── aws/          ← Bedrock（签名算法 v4，§A.3）
├── azure/
├── volcengine/   ← 字节
├── ali/          ← 阿里
├── baidu/        ← 百度
├── zhipu/        ← 智谱
├── moonshot/     ← Moonshot（Kimi）
├── deepseek/
├── cohere/
├── mistral/
├── jpmgo/        ← TODO: 修正
└── ... 共 40 个
```

**最简单范本**：`relay/channel/openai/adaptor.go`：

| 行号 | 内容 |
|---|---|
| `:98` | `func (a *Adaptor) Init(info *relaycommon.RelayInfo)` |
| `:114` | `func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error)` |
| `:192` | `func (a *Adaptor) SetupRequestHeader(c *gin.Context, header *http.Header, info *relaycommon.RelayInfo) error` |
| `:253` | `func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error)` |
| `:681` | `func (a *Adaptor) ConvertOpenAIResponsesRequest(...)` —— OpenAI Responses API |
| `:752` | `func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error)` |
| `:764` | `func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError)` —— **返回的 `usage` 就是账本** |

### 最小阅读路径（顺序：1→2→3）

1. **读接口定义**：`relay/channel/adapter.go` 整文件（150 行不到）。
2. **读最简实现**：`relay/channel/openai/adaptor.go`，跳读各方法签名即可。
3. **读注册表**：`relay/relay_adaptor.go:50-128` 的 `GetAdaptor` switch-case（看都支持哪些厂，每家用什么 `ChannelType`）。

### 延伸学习

- **Adapter 模式**：《Design Patterns: Elements of Reusable Object-Oriented Software》第 4 章。
- **OpenAI API 文档**：<https://platform.openai.com/docs/api-reference>（先看 chat completions、embeddings、images、responses）。
- **Anthropic Messages API**：<https://docs.anthropic.com/en/api/messages>。
- **Gemini API**：<https://ai.google.dev/api/generate-content>。
- **AWS Bedrock 签名算法 v4**：SigV4 是网关转 Bedrock 的难点；参考 <https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html>。

---

## §B. 模块 2 — 路由与多通道（负载均衡 + 故障转移）

### 核心概念与理论（先学这些）

**为什么需要路由**：单一 API key 必然被限速 / 计费配额限制。中转站是"调用方"与"上游厂商"之间的 broker，必须能：
1. **多 key 池**：一个 channel 下有多个 API key（不同 sub-account、不同区域），按规则轮换。
2. **多 channel**：同一个模型可以有多条 channel（不同厂商、不同账户、不同计费），按规则选。

**LB 算法**（核心 LB 知识点）：
- **轮询**（Round Robin）：最简单，但不考虑 key 实际健康度。
- **加权轮询**（Weighted Round Robin）：每个 key / channel 设权重（性能高、配额大的权重大）。
- **优先级 + 故障转移**（Priority + Failover）：先试最高优先级，失败 → 次高。
- **最少连接 / 最少使用**（Least Connections / Least Used）：跟踪每个 key 的当前并发 / 当日用量。
- **随机 + 重试退避**（Random with Retry Backoff）：策略最简单。
- **会话亲和**（Session Affinity）：同一 ID 的请求稳定落到同一 key（避免上下文缓存命中失效）。

**故障检测**：每次请求要"记账"——
- 成功 → 健康度加分。
- 429 / 5xx → 健康度减分；连续失败 → 临时禁用（auto-disable）。
- 403 / 401（auth 错误） → 标记该 key 永久禁用。
- 余额不足 → 通知管理员。

**客户端带 channel 怎么走**：URL 形如 `/v1/chat/completions?channel=42` 或 header `X-Channel-Id: 42`，强制走指定 channel；否则按模型 + 用户组 + 权重自动选。

### 本项目如何实现

**核心：Distribute 中间件** + **Channel 模型 + GetNextEnabledKey**

| 文件 / 行号 | 内容 | 角色 |
|---|---|---|
| `middleware/distributor.go:34` | `func Distribute() func(c *gin.Context)` | **路由入口**：根据客户端请求选 channel + key，写入 `gin.Context` |
| `middleware/distributor.go:231` | `getModelFromRequest` | 从请求 body 提取模型名 |
| `middleware/distributor.go:359` | `getJSONStringValue` | 用 gjson 解析 body 字段 |
| `middleware/distributor.go:548` | `SetupContextForSelectedChannel` | 把 channel / key / base URL 写入 ctx |
| `model/channel.go:182` | `func (channel *Channel) GetKeys() []string` | 返回 key 列表 |
| `model/channel.go:206` | `func (channel *Channel) GetNextEnabledKey() (string, int, *types.NewAPIError)` | **轮换 key**（按状态排序，挑第一个 Enabled） |
| `model/channel.go:673` | `handlerMultiKeyUpdate` | 一次请求后批量更新 key 状态（健康度变化） |
| `model/channel.go:738` | `UpdateChannelStatus` | channel 级别的 auto-disable / 启用 |
| `model/channel.go:777` | → `UpdateAbilityStatus` | 同步更新"能力表"（channel × 模型组合） |
| `controller/relay.go`（重试循环）| `for ; retryParam.GetRetry() <= common.RetryTimes; retryParam.IncreaseRetry()` | **重试状态机**，失败换 channel 重来 |

**Channel 状态机**（在 `common/channel_status.go` 等常量里定义）：

```
┌──────────┐  手动启用   ┌──────────┐  401/403  ┌──────────┐
│ Enabled  │ ◀───────── │ Manually │ ────────▶ │ Auto-    │
│          │            │ Disabled │            │ Disabled │
└──────────┘            └──────────┘            └──────────┘
     │                                              ▲
     │ 429/5xx 连续 N 次                             │
     └──────────────────────────────────────────────┘
```

**重试机制**（核心产品逻辑）：见 `controller/relay.go::Relay` 的 `for ; retryParam.GetRetry() <= common.RetryTimes; retryParam.IncreaseRetry()` 循环。每次失败 → 换 channel → 换 key → 重新预扣费 → 重发。**关键不变量**：每轮重试前必须把上一轮预扣的额度退掉（`defer refund`）。

### 最小阅读路径

1. **读 Channel 模型**：`model/channel.go:1-300`，重点 `:182 GetKeys` / `:206 GetNextEnabledKey` / `:738 UpdateChannelStatus`。
2. **读 Distribute**：`middleware/distributor.go:34-150`（先看主流程，跳过 gjson 解析细节）。
3. **读重试循环**：`controller/relay.go::Relay`，关注 `for retryParam.GetRetry() <= common.RetryTimes` 这段。
4. **加深理解**：跟一次失败—— `controller/relay.go` 里 `getChannel` 返回 error 时如何处理、key 状态如何变更。

### 延伸学习

- **负载均衡**：nginx upstream、LVS、HAProxy 文档（经典 LB 实现参考）。
- **断路器模式**（Circuit Breaker）：Martin Fowler《Patterns of Distributed Systems》。
- **AWS 限速模型**：429 + Retry-After header 的标准处理（参考各家厂商错误响应结构）。

---

## §C. 模块 3 — Token 计量与计费引擎

> 这是 AI 中转站**最核心、最容易出错**的商业逻辑。AGENTS.md 中也明确把这一节列为 billing rules read gate。

### 核心概念与理论（先学这些）

**Token 是什么**：
- **LLM 的输入单位**。一段文本先经过 tokenizer（分词器）切成 token，再喂给模型。
- 不同模型 token 化方式不同：GPT 系列用 `tiktoken`（BPE）；Claude 用自家的 tokenizer；Gemini 用 SentencePiece。
- 中文一个字 ≈ 1.5-3 个 token；英文一个词 ≈ 1.3 个 token。详细比例取决于模型和文本。

**为什么要做 token 计量**：
1. **预扣费**：请求进来时就要按"大概会用多少"先冻结用户的 quota，防止超额调用。
2. **真实结算**：响应回来时上游会返回真实 `prompt_tokens` / `completion_tokens`，**用它做最终账单**。
3. **配额管理**：用户每天 / 每月只能用多少 quota。

**计费模型类型**：
- **按 token**：输入 / 输出不同价（如 `gpt-4o` 输入 $5/M tokens，输出 $15/M）。
- **按张**：图像生成固定 × 张数。
- **按秒**：视频生成按时长 × 视频分辨率倍率。
- **按字符 / token + 倍率**：某些小模型按字符。
- **缓存命中**：prompt cache 命中时大幅降价（Anthropic / OpenAI 都引入了 prompt caching）。
- **工具调用附加费**：某些模型 function call 按 tool_use 计费。

**分层计费**（Tiered Billing）：
- 同一模型不同上下文长度不同价（如 Claude 200K+ 上下文是 200K 以内价的 2 倍）。
- 同一模型不同调用次数不同价（量大优惠）。
- 实现：表达式引擎（`pkg/billingexpr/`）按 token 数量 / 上下文长度分段求价。

**为什么需要表达式引擎**：模型定价规则太复杂、变化快，硬编码 → 难维护。表达式（DSL）允许运营在数据库里配。

### 本项目如何实现

**Token 估算（独立 Go 模块 `tokenkit/`）**：

| 文件 / 行号 | 内容 |
|---|---|
| `tokenkit/tokenkit.go:140` | `func Estimate(model, text string) int` —— 入口 |
| `tokenkit/tokenkit.go:31` | `func ModelFamily(model string) Family` —— 识别 tokenizer 家族 |
| `tokenkit/tokenkit.go:149` | `EstimateFamily` —— 按家族选择 tokenizer |
| `tokenkit/image.go` | 图片 token 估算 |
| `tokenkit/README.md` | 模块说明（独立 module，不能依赖主项目） |

**计费表达式引擎**（`pkg/billingexpr/`）：

| 文件 / 行号 | 内容 |
|---|---|
| `pkg/billingexpr/types.go` | 类型定义（Tier、UsageSnapshot、Quota 等） |
| `pkg/billingexpr/compile.go` | DSL → AST / 编译结果 |
| `pkg/billingexpr/run.go` | 表达式求值 |
| `pkg/billingexpr/fixed.go` | 固定价分支 |
| `pkg/billingexpr/settle.go` | 差额结算 |
| `pkg/billingexpr/round.go` | 配额 rounding 规则 |
| `pkg/billingexpr/expr.md` | **DSL 语法**（这是必读的领域文档） |
| `pkg/billingexpr/testdata/` | 测试 fixture |

**预扣费（请求阶段）**：

| 文件 / 行号 | 内容 |
|---|---|
| `relay/request_billing.go:25` | `func PrepareRequestBilling(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError` —— **预扣费入口** |
| `relay/request_billing.go:72` | `func RefundFailedRequestBilling(c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) *types.NewAPIError` —— **失败退费** |

**实际结算（响应阶段）**：

| 文件 / 行号 | 内容 |
|---|---|
| `service/text_quota.go:386` | `func PostTextConsumeQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage, extraContent []*common.Message)` —— **用上游真实 usage 结算** |
| `service/text_quota.go:223` | `calculateTextQuotaSummary` |
| `service/text_quota.go:195` | `composeTieredTextQuota` —— 分层计费 |
| `service/text_quota.go:146` | `calculateTextToolCallSurcharge` —— 工具调用附加费 |

**模型价格存储**：

| 文件 / 行号 | 内容 |
|---|---|
| `model/pricing.go` | 价格主表 |
| `model/pricing_default.go` | 默认价格 |
| `model/pricing_refresh.go` | 刷新价格（动态从上游同步） |
| `setting/ratio_setting/group_ratio.go` | **用户分组倍率**（VIP 用户倍率 0.5，普通 1.0） |
| `setting/ratio_setting/cache_ratio.go` | 缓存命中倍率 |

### 最小阅读路径

1. **先学 DSL**：`pkg/billingexpr/expr.md`（必读，是整个计费的核心抽象）。
2. **读 tokenkit 入口**：`tokenkit/tokenkit.go:140 Estimate` + `:31 ModelFamily`。
3. **读预扣费**：`relay/request_billing.go:25-72`，理解 quota 与 token 两套单位的关系。
4. **读结算**：`service/text_quota.go:386 PostTextConsumeQuota`，跟到 `composeTieredTextQuota` 和 `calculateTextToolCallSurcharge`。
5. **了解价格存储**：`model/pricing.go` + `setting/ratio_setting/group_ratio.go`。

### 必读 Billing Rules（按 AGENTS.md）

本仓库在 `.agents/rules/billing.md` 维护了完整的计费守则（包括安全不变量、tiered billing 推导、quota 上限 clamp）。**任何动 §C 涉及的文件前必读这个文件全文**（不是 grep，是逐行读）。

### 延伸学习

- **tiktoken**：<https://github.com/openai/tiktoken> —— OpenAI 的 BPE 实现。
- **SentencePiece**：<https://github.com/google/sentencepiece> —— Gemini / 通用的子词切分。
- **Claude tokenizer**：<https://docs.anthropic.com/en/docs/build-with-claude/token-counting>。
- **计费模型设计**：《Designing Data-Intensive Applications》第 11 章"Stream Processing"中的定价与配额讨论。

---

## §D. 模块 4 — 流式响应处理（SSE / WebSocket）

### 核心概念与理论（先学这些）

**为什么流式**：LLM 文本是逐字生成的（autoregressive）。客户端不希望等 10s 才看到一个完整答案，希望打字机式逐字呈现。流式协议：
- **SSE**（Server-Sent Events）：HTTP 长连接，`Content-Type: text/event-stream`，每个 event 是 `data: <json>\n\n`。
- **WebSocket**：全双工，OpenAI Realtime API 用它做实时多模态对话（语音输入 + 流式输出）。

**SSE 格式**：
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2}}

data: [DONE]
```

**网关的职责**：
1. **透传**：把上游 SSE 一字不漏转发给客户端（性能、增量延迟是关键）。
2. **截获 usage**：最后一个 chunk（OpenAI 的 `stream_options.include_usage=true`）含真实 token 数 → 用于结算。
3. **协议翻译**：上游 SSE 格式不一致（OpenAI / 百度 / Claude stream）→ 转 OpenAI 标准格式发给客户端。
4. **超时控制**：单 chunk 写超时、全链路超时（避免连接挂死）。
5. **断点续传**：客户端断开时优雅关闭上游连接。

**WebSocket Realtime 难点**：
- 双向通信：客户端发送音频 chunk，上游回音频 chunk + 转写文本。
- 网关要管理**双向流**：客户端↔网关↔上游都要保持活跃。
- 状态机：Realtime 有 session、conversation、response 三层生命周期。

### 本项目如何实现

**流式扫描器（核心 SSE 处理）**：

| 文件 / 行号 | 内容 |
|---|---|
| `relay/helper/stream_scanner.go:45` | `func NewStreamScanner(reader io.Reader, maxBytes ...int) *bufio.Scanner` |
| `relay/helper/stream_scanner.go:83` | `func StreamScannerHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo, dataHandler func(data string, sr *StreamResult))` —— **流式处理入口** |
| `relay/helper/stream_scanner.go:55` | `copyCodexSSEHeaders` —— 转 SSE 头 |
| `relay/helper/stream_scanner.go:76` | `ExtendWriteDeadline` —— 写超时控制 |
| `relay/helper/stream_result.go` | `StreamResult` 类型（usage / 错误聚合） |
| `relay/compatible_handler.go::TextHelper` | 主流 OpenAI 路径，调用 `StreamScannerHandler` |

**WebSocket Realtime**：

| 文件 / 行号 | 内容 |
|---|---|
| `relay/websocket.go` | 主入口（Realtime API） |
| `controller/responses_websocket.go` | Responses WebSocket |
| `router/relay-router.go:74` | `relayV1Router.GET("/responses", controller.ResponsesWebSocket)` |
| `router/relay-router.go:80` | `wsRouter.GET("/realtime", ...)` |

**流式 usage 提取**（计费的关键）：在 `Adaptor.DoResponse` 里，`StreamScannerHandler` 的 `dataHandler` 回调累计 delta tokens，最后一个 chunk 的 `usage` 字段被填进 `info.Usage`，交给 `PostTextConsumeQuota` 结算。

### 最小阅读路径

1. **读流式扫描**：`relay/helper/stream_scanner.go` 整文件（约 200 行）。
2. **看 OpenAI 适配器的 DoResponse**：`relay/channel/openai/adaptor.go:764` —— 看它如何用 `StreamScannerHandler` 转发、如何提取 usage。
3. **看 Realtime**：`relay/websocket.go`（如时间充裕）+ `controller/responses_websocket.go`。

### 延伸学习

- **SSE 规范**：HTML5 标准（WHATWG HTML Living Standard §Server-sent events）。
- **WebSocket 协议**：RFC 6455。
- **OpenAI Streaming**：<https://platform.openai.com/docs/api-reference/streaming>。
- **OpenAI Realtime Beta**：<https://platform.openai.com/docs/guides/realtime>。

---

## §E. 模块 5 — 异步任务中转（视频生成、图片生成等）

### 核心概念与理论（先学这些）

**什么是异步任务**：客户端提交一个"生成请求"，上游不会立即返回结果（耗时可能 30s ~ 30min）。上游提供两种通知方式：

1. **同步阻塞**：直接 hold 住连接直到完成（不推荐，因为网关连接宝贵）。
2. **异步返回**：立即返回 `task_id`，客户端轮询 `/v1/tasks/{task_id}` 查询状态；或上游回调 webhook。
3. **SSE / WebSocket 长连接**：实时推送进度事件。

**异步任务的生命周期**：

```
提交 ───▶ pending ───▶ running ───▶ completed / failed / cancelled
                              │
                              └──── progress events（可选，SSE / WebSocket）
```

**网关的额外职责**（同步中转没有的部分）：
1. **任务存储**：每个提交的任务要存到数据库（`model.Task`），客户端轮询要能查到。
2. **预扣费 + 终态补差**：提交时按估算扣一笔（`EstimateBilling`）；任务**完成 / 失败**时按真实用量**补 / 退差额**（`AdjustBillingOnComplete`）。
3. **失败回滚**：任务中途失败要把预扣退掉。
4. **任务续作 / remix**：某些模型支持"基于已有视频再生成一次"（remix）。网关要能从原始任务里恢复上下文（channel、模型、时长、分辨率）。
5. **进度转发**：上游 SSE 进度事件要转发给客户端。

### 本项目如何实现

**TaskAdaptor 接口**（与同步 Adaptor 不同）：

| 文件 / 行号 | 内容 |
|---|---|
| `relay/channel/adapter.go:48` | `type TaskAdaptor interface` —— 任务适配器接口 |
| `:50-52` | `Init / ValidateRequestAndSetAction` |
| `:54-56` | `EstimateBilling / AdjustBillingOnSubmit / AdjustBillingOnComplete` —— **三阶段计费** |
| `:60-62` | `BuildRequestURL / BuildRequestHeader / BuildRequestBody` |
| `:64` | `DoRequest` |
| `:66` | `ParseResponse` |
| `:69-70` | `FetchTask / ParseTaskResult` —— **轮询用** |

**核心控制器**（`relay/relay_task.go`）：

| 行号 | 内容 |
|---|---|
| `:30` | `type TaskSubmitResult struct` —— 提交结果信封 |
| `:46` | `func ResolveOriginTask(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError` —— 处理 remix / 续作 |
| `:151` | `ApplyChannelPin` —— 锁定原始任务的 channel |
| `:190` | `ApplyOriginTaskAffinity` —— 同上 |
| `:199` | `func RelayTaskSubmit(c *gin.Context, info *relaycommon.RelayInfo) (*TaskSubmitResult, *dto.TaskError)` —— **提交入口** |
| `:415` | `recalcQuotaFromRatios` —— 按实际时长 / 张数重算 quota |
| `:445` | `func RelayTaskFetch(c *gin.Context, relayMode int) (taskResp *dto.TaskError)` —— **轮询 / 取结果** |
| `:527` | `tryRealtimeFetch` —— Realtime 流式获取任务结果 |
| `:606` | `detectVideoFormat` |
| `:631` | `mapTaskStatusToSimple` —— 上游状态 → 内部 TaskStatus 枚举 |
| `:644` | `TaskModel2Dto` —— DB Task → 返回 DTO |

**任务模型与持久化**：

| 文件 | 角色 |
|---|---|
| `model/task*.go` | 任务表（Task / TaskProgress 等） |
| `relay/channel/task/taskcommon/` | 任务通用工具 |
| `relay/channel/task/sora/`、`doubao/`、`veo/` 等 | 各厂商异步任务 Adaptor |
| `relay/channel/task/` （目录） | 任务适配器集合 |

### 最小阅读路径

1. **读 TaskAdaptor 接口**：`relay/channel/adapter.go:48-70`。
2. **读三阶段计费注释**：`relay/channel/adapter.go:54-56`（关注 `EstimateBilling / AdjustBillingOnSubmit / AdjustBillingOnComplete` 的注释）。
3. **读提交与轮询**：`relay/relay_task.go::RelayTaskSubmit (199)` 与 `RelayTaskFetch (445)`。
4. **读一个最简单的任务 Adaptor**：`relay/channel/task/sora/adaptor.go` 或 `doubao/`，对比 `relay/channel/openai/adaptor.go` 看差异。

### 延伸学习

- **OpenAI Async Video（Sora）API**：<https://platform.openai.com/docs/guides/video-generation>。
- **异步任务模式**：《Patterns of Distributed Systems》第 5 章"Asynchronous Tasks"。
- **WebSocket vs SSE**：实时进度推送选型。

---

## §F. 模块 6 — 认证、限流与安全

### 核心概念与理论（先学这些）

**鉴权（Authentication）**：确认客户端是谁。
- **API Token**：Bearer `sk-xxx`，OpenAI 风格。中转站保存 token → user / group 映射。
- **Session + Cookie**：浏览器会话，用于 Dashboard。
- **JWT**：无状态签名 token。
- **WebAuthn / Passkey**：硬件密钥（防钓鱼）。
- **TOTP**：二次验证（Google Authenticator）。
- **OAuth / OIDC**：第三方授权登录。

**授权（Authorization）**：确认这个用户能做什么。
- **RBAC**（Role-Based Access Control）：admin / user / readonly。
- **ABAC**（Attribute-Based）：按用户属性 / 资源属性决策。
- **Casbin**：策略引擎（new-api 用了它，路径 `service/authz/`）。

**限流（Rate Limit）**：防滥用 / 防超额。
- **令牌桶**（Token Bucket）：突发允许，平滑限流。
- **滑动窗口**（Sliding Window）：精确限制时间窗内的请求数。
- **固定窗口**（Fixed Window）：简单，但有边界突刺问题。
- **并发上限**（Concurrent Limit）：限制同时进行的请求数。

**OWASP ASVS**：认证相关 OWASP 规范（AGENTS.md 明确要求遵守）：
- 防账号枚举
- 防暴力破解
- 凭证安全存储
- 敏感操作的 re-authentication
- 会话轮换 / 失效

### 本项目如何实现

**鉴权中间件**：

| 文件 / 行号 | 内容 |
|---|---|
| `middleware/auth.go:52` | `func authHelper(c *gin.Context, minRole int)` —— 通用 RBAC 校验 |
| `middleware/auth.go:98` | `func TryUserAuth() func(c *gin.Context)` |
| `middleware/auth.go:132` | `func UserAuth() func(c *gin.Context)` |
| `middleware/auth.go:138` | `func AdminAuth() func(c *gin.Context)` |
| `middleware/auth.go:144` | `func RootAuth() func(c *gin.Context)` |
| `middleware/auth.go:459` | `func TokenAuthReadOnly() func(c *gin.Context)` |
| `middleware/auth.go:514` | `func TokenAuth() func(c *gin.Context)` —— **API token 主入口** |
| `middleware/auth.go:194` | `authenticateDashboardRequest` |
| `docs/authentication.md` | **必读**（项目本身的 OWASP 对齐说明） |

**限流中间件**：

| 文件 / 行号 | 内容 |
|---|---|
| `middleware/rate-limit.go:45` | `redisIPRateLimitKey` —— IP 维度 key |
| `middleware/rate-limit.go:49` | `redisUserRateLimitKey` —— 用户维度 key |
| `middleware/rate-limit.go:110` | `redisRateLimiter` —— Redis 实现 |
| `middleware/rate-limit.go:128` | `memoryRateLimiter` —— 内存实现（fallback） |
| `middleware/rate-limit.go:165` | `GlobalWebRateLimit` |
| `middleware/rate-limit.go:183` | `GlobalAPIRateLimit` |
| `middleware/model-rate-limit.go` | **模型级限流**（最关键，一个 gpt-4o 用户最多 N 次/分） |
| `middleware/email-verification-rate-limit.go` | 邮件验证码防爆破 |
| `middleware/turnstile-check.go` | Cloudflare Turnstile 防机器人 |

**Token 模型与缓存**：

| 文件 / 行号 | 内容 |
|---|---|
| `model/token.go:76` | `func (token *Token) GetFullKey() string` |
| `model/token.go:80` | `GetMaskedKey()` —— 脱敏显示 |
| `model/token.go:84` | `GetIpLimits()` —— key 的 IP 白名单 |
| `model/token.go:338-345` | `GetModelLimits / GetModelLimitsMap` —— 模型级权限 |
| `model/token.go:312-328` | `invalidateTokenCacheForMutation` —— 写时失效缓存 |

**策略引擎（Casbin）**：

| 路径 | 角色 |
|---|---|
| `service/authz/` | Casbin 适配 |
| `router/authz-router.go` | 权限路由 |

### 最小阅读路径

1. **必读**：`docs/authentication.md`（OWASP 对齐规则，全文）。
2. **读鉴权**：`middleware/auth.go:514 TokenAuth`（API token 主流程），先理解 token → user → group 三层映射。
3. **读限流**：`middleware/rate-limit.go` 整文件 + `middleware/model-rate-limit.go`（模型级限流是 AI 网关的关键）。
4. **读权限模型**：`model/token.go:338 GetModelLimitsMap`（理解 token 是如何绑定模型白名单的）。

### 延伸学习

- **OWASP ASVS v4.0+**：<https://owasp.org/www-project-application-security-verification-standard/>（AGENTS.md 要求严格对齐）。
- **OWASP Authentication Cheat Sheet**：<https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>。
- **令牌桶 vs 滑动窗口**：NGINX `limit_req` 实现可参考。
- **Casbin**：<https://casbin.org/>。

---

## §G. 模块 7 — 插件体系（JS 任务插件）

### 核心概念与理论（先学这些）

**为什么需要插件**：上游 AI 厂商变化快；新厂商接入又要写 Go 适配器、发版本，迭代太慢。让运营 / 第三方开发者写 JS 插件，**配置化即可接入新厂商**。

**插件架构的典型设计**：
- **宿主**：new-api 主程序。
- **运行时**：嵌入式 JS 引擎（new-api 用了 moejs，类似于 goja / V8 绑定）。
- **能力接口**（plugin API）：宿主通过一组 JSON-in / JSON-out 的钩子（Hook）调用插件。插件不直接访问网络 / 文件系统。
- **生命周期**：插件声明 `manifest` → 宿主加载 → 编译 → 导出钩子 → 宿主按事件触发钩子（提交、响应、计费、轮询…）。
- **协议版本化**：插件 API v1（向后兼容）。

**插件能做什么**（new-api 当前支持）：
- 替代一个 channel 适配器（实现完整任务流程）。
- 仅做请求 / 响应转换（host 走原生流程，仅插件做转换）。
- 计价 / 差额结算。

### 本项目如何实现

**JS 引擎封装**：

| 文件 / 行号 | 内容 |
|---|---|
| `pkg/jsplugin/engine.go:103` | `type Engine struct` |
| `pkg/jsplugin/engine.go:142` | `func Compile(source string, options Options) (*Engine, error)` —— 编译 JS 源码 |
| `pkg/jsplugin/engine.go:199` | `func (e *Engine) Export(ctx context.Context, exportName string) (any, error)` —— 调用导出函数 |
| `pkg/jsplugin/cli.go` | CLI 入口（plugin 子命令） |
| `pkg/jsplugin/runtime/` | 插件运行时（pool + lifecycle） |

**插件协议定义**：

| 路径 | 角色 |
|---|---|
| `docs/plugin-api/v1.md` | **协议文档**（必读） |
| `docs/plugin-api/v1.schema.json` | JSON Schema 校验 |
| `docs/plugin-api/v1.d.ts` | TypeScript 类型（前端编辑体验） |
| `plugins/tasks/` | 插件源码（任务插件） |

**插件与路由**：

| 路径 | 角色 |
|---|---|
| `router/task-router.go` | 任务路由（插件支持） |
| `router/task-plugin-protocol-router.go` | 插件协议路由 |
| `router/plugin-router.go` | 插件管理路由（安装 / 启用 / 禁用） |
| `controller/task_plugin*.go` | 任务插件相关 controller |
| `relay/plugin_protocol.go` | 插件协议的 relay 入口 |

### 最小阅读路径

1. **读协议文档**：`docs/plugin-api/v1.md`（这是接口规范，全文读完就能写插件了）。
2. **读插件范本**：`plugins/tasks/` 下任意一个目录，例如 `plugins/tasks/openai_compatible/`。
3. **读引擎**：`pkg/jsplugin/engine.go:142-203`（理解编译与调用）。

### 延伸学习

- **Go 嵌入 JS 引擎**：moejs / goja / otto 各自权衡。
- **WASM 替代 JS**：性能更好，但生态更弱。
- **插件安全**：宿主隔离、权限沙箱（插件不能裸访问网络 / FS）。

---

## §H. 模块 8 — 可观测性与审计

### 核心概念与理论（先学这些）

**为什么可观测性关键**：
- 中转站是"基础设施"，挂了客户也跟着挂；必须能快速定位问题。
- 计费纠纷：必须能拿出"这次调用到底扣了多少"的证据（token、quota、上游响应）。
- 性能优化：必须能按模型 / channel / 用户看 P50 / P99 延迟。

**三个支柱**：
1. **日志（Logging）**：结构化日志（JSON），每条请求一行，含 request_id / channel / user / model / tokens / quota / latency / status / error。
2. **指标（Metrics）**：counter / gauge / histogram。例：`relay_request_total{model, channel, status}` / `relay_request_duration_seconds{model}` / `quota_consumed_total{model}`。
3. **追踪（Tracing）**：OpenTelemetry / Jaeger。trace_id 跨服务传递；客户端 → 网关 → 上游一条调用链。

**审计日志 vs 普通日志**：
- **审计日志**：必须长期保留、合规相关（用户登录、权限变更、配额变更、敏感操作）。
- **普通日志**：滚动保留、性能调优、临时排错。

**配额消费的会计要求**：
- **不可篡改**：用户的消费记录（`model.Log`）必须可追溯、可审计。
- **可重放**：能根据日志重算账单（重算结果应等于实际扣费）。

### 本项目如何实现

**日志库**：

| 文件 / 行号 | 内容 |
|---|---|
| `logger/logger.go:42` | `func SetupLogger()` |
| `logger/logger.go:76-99` | `LogInfo / LogWarn / LogError / LogDebug / logHelper` |
| `logger/logger.go:125-179` | `LogQuota / FormatQuota / LogJson` —— 配额日志辅助 |
| `logger/logger.go:36` | `GetCurrentLogPath` |

**消费日志（计费账本）**：

| 文件 / 行号 | 内容 |
|---|---|
| `model/log.go:57` | `type Log struct` —— **核心计费记录结构** |
| `model/log.go:93` | `ensureLogRequestId` |
| `model/log.go:99` | `createLog` |
| `model/log.go:124-138` | `FormatAdminLogs / FormatRootLogs / GetLogByTokenId` —— 后台展示 |
| `model/log.go:148` | `func RecordLog(userId int, logType int, content *common.Message)` —— 普通日志 |
| `model/log.go:170` | `RecordLogWithAdminInfo` —— 审计日志（含管理员操作） |
| `model/log.go:214` | `RecordLoginLog` |
| `model/log.go:339` | `func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams)` —— **消费日志（计费账本）** |

**指标 / 性能**：

| 路径 | 角色 |
|---|---|
| `pkg/perf_metrics/` | 性能指标（按模型 / channel 维度记录 P99 / 错误率） |
| `middleware/stats.go` | 通用统计中间件 |
| `middleware/performance.go` | 性能检查 |

**请求 ID 贯穿**：

| 路径 | 角色 |
|---|---|
| `middleware/request-id.go` | 每个请求生成 UUID → 注入响应头 |
| `common/request_id.go`（推测） | request_id 在日志里传递 |
| `logger/logger.go::LogError` | 接 request_id 实现串联 |

### 最小阅读路径

1. **读消费日志**：`model/log.go:339 RecordConsumeLog` + `model/log.go:57 Log struct`（理解一条消费记录有什么）。
2. **读指标**：`pkg/perf_metrics/`（按模型 / channel 看延迟）。
3. **读审计**：`model/log.go:170 RecordLogWithAdminInfo` + `middleware/audit.go`。

### 延伸学习

- **OpenTelemetry**：<https://opentelemetry.io/>（追踪标准）。
- **结构化日志**：zerolog、zap、slog（Go 标准库）。
- **SRE 实践**：Google SRE Book 第 6 章"Monitoring Distributed Systems"。

---

## §I. 全链路阅读地图（一张图）

当你需要**快速定位某个功能在哪个文件**时，用这张表：

| 你想了解 | 看哪里（精确路径） |
|---|---|
| 客户端请求入口 | `router/relay-router.go` |
| 鉴权 | `middleware/auth.go:514 TokenAuth` |
| 选 channel / key | `middleware/distributor.go:34 Distribute` + `model/channel.go:206 GetNextEnabledKey` |
| 预扣费 | `relay/request_billing.go:25 PrepareRequestBilling` |
| 调用控制器 | `controller/relay.go::Relay` |
| 协议转换 | `relay/channel/<vendor>/adaptor.go` |
| 上游请求 | `relay/channel/<vendor>/adaptor.go::DoRequest` |
| 流式处理 | `relay/helper/stream_scanner.go:83 StreamScannerHandler` |
| 真实结算 | `service/text_quota.go:386 PostTextConsumeQuota` |
| 失败退费 | `relay/request_billing.go:72 RefundFailedRequestBilling` |
| 限流 | `middleware/rate-limit.go:110` + `middleware/model-rate-limit.go` |
| 消费日志 | `model/log.go:339 RecordConsumeLog` |
| 异步任务 | `relay/relay_task.go:199 RelayTaskSubmit` / `:445 RelayTaskFetch` |
| 任务 Adaptor | `relay/channel/task/<vendor>/adaptor.go` |
| JS 插件 | `docs/plugin-api/v1.md` + `pkg/jsplugin/engine.go:142` |
| 模型价格 | `model/pricing.go` + `setting/ratio_setting/group_ratio.go` |
| DB schema | `model/main.go:342 AutoMigrate` |

---

## §J. 学完检验清单

按这份清单自检，全 ✅ 表示你已经掌握 AI Token 中转站的核心技术栈：

### 协议层
- [ ] 能说出 OpenAI / Claude / Gemini / Responses 四种协议的 URL / body 形态差异。
- [ ] 能讲清"客户端协议 → 内部信封 → 上游协议"三层转换的 Adapter 模式。
- [ ] 能独立为一家新厂商实现 `Adaptor` 接口。

### 路由层
- [ ] 能讲清轮询 / 加权 / 优先级 / 故障转移四种 LB 算法的取舍。
- [ ] 能讲清 `Channel.Status` 状态机的全部状态与转移条件。
- [ ] 能讲清重试循环里"换 channel → 换 key → 退预扣 → 重预扣"的执行顺序。

### 计费层
- [ ] 能讲清"预扣费 + 真实结算 + 失败退费"三步流程。
- [ ] 能解释为什么 DoResponse 返回的 `usage` 是"账本"。
- [ ] 能解释分层计费（Tiered Billing）是怎么实现的。
- [ ] 能解释 prompt cache 命中与未命中的倍率差异。

### 流式层
- [ ] 能写出 SSE 协议的基本格式（含 `[DONE]` 标记）。
- [ ] 能解释如何从流式响应最后一个 chunk 提取 usage。
- [ ] 能讲清 WebSocket Realtime 与 SSE 在双向通信上的差异。

### 异步任务层
- [ ] 能画出异步任务生命周期（pending → running → completed/failed）。
- [ ] 能讲清三阶段计费（Estimate / AdjustOnSubmit / AdjustOnComplete）的时序。

### 认证层
- [ ] 能讲清 token → user → group → model 白名单的权限传递链。
- [ ] 能列出 OWASP ASVS 至少 5 条对本项目的要求。
- [ ] 能区分令牌桶 / 滑动窗口 / 固定窗口三种限流算法的取舍。

### 插件层
- [ ] 能讲清宿主 / 运行时 / 能力接口三层关系。
- [ ] 能描述 JS plugin 的 manifest 字段含义。

### 可观测层
- [ ] 能列出一次完整请求在日志里应该出现的全部字段。
- [ ] 能讲清"消费日志 vs 审计日志"在保留期、字段上的区别。

---

## §K. 推荐的最小化学习顺序（每天 30~60 分钟）

如果你时间有限，按这个顺序投入产出比最高：

1. **D1：协议层 + 路由层**（§A + §B）：理解 Adaptor + Channel 抽象。看 `relay/channel/openai/adaptor.go` 和 `model/channel.go`。
2. **D2：计费层**（§C）：先读 `pkg/billingexpr/expr.md` DSL，再看 `tokenkit/Estimate` 和 `PostTextConsumeQuota`。**AGENTS.md billing rules 必读**。
3. **D3：流式层 + 异步任务层**（§D + §E）：理解两种不同交互（流 vs 任务）。
4. **D4：认证层 + 可观测层**（§F + §H）：理解 OWASP 视角与可观测。
5. **D5：插件层**（§G）：如需扩展，按需读。