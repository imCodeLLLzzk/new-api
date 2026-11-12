# AGENTS.md — service/ (业务逻辑层)

本目录承载跨请求的业务规则：渠道选择与调度、计费与结算、认证会话、授权判定、异步任务与系统任务。它不碰 HTTP 细节（属 `controller/`），也不直接写 SQL（属 `model/`）。

## 一、职责与入口

- 渠道调度：`channel_select.go`（选路与优先级）、`channel.go`（启停与自动禁用）、`channel_affinity.go`（亲和）
- 计费：`quota.go`（预扣）、`text_quota.go`（文本用量）、`image_billing.go`（图片计费）、`tiered_settle.go`（阶梯结算）、`task_billing.go`（任务计费）、`billing.go` / `billing_usage.go` / `billing_session.go`
- 认证会话：`auth_token.go`（JWT 签发）、`auth_session.go`（Refresh 会话）、`account_security.go`、`login_verification.go`、`twofa.go`、`security_verification.go`
- 授权判定：`authz/`（Casbin；`enforcer.go` 的 `Init` / `ReloadPolicy` / `StartPolicySync`，`permission.go` 定义 `Permission`）
- Passkey：`passkey/`（`service.go` / `session.go` / `user.go`）
- 异步任务：`task.go`、`task_polling.go`、`task_artifact_store.go`；系统任务：`system_task.go`

## 二、检索禁令（Do Not）

- **禁止全目录 Grep 计费关键词**。`quota` / `billing` / `settle` / `usage` 命中几十个文件。计费链是**预扣 → 结算 → 差额调整**，先定位你改的是「预扣」还是「结算」，再只读对应文件。
- **禁止把 `*_test.go` 当实现读**。本目录 100 个文件中大量是测试，优先读实现文件。
- **禁止逐个打开 `authz/` 全部 13 个文件**。先看 `permission.go`（权限定义）与 `resources_*.go`（各资源权限），只有要改策略时才读 `enforcer.go` / `registry.go`。
- `service/passkey/` 与 `service/authz/` 是两套独立机制，不要混为一谈。
- `http_client.go` / `http_client_transport_test.go` / `http_transport_*.go` 是 HTTP 传输层样板，与业务规则无关，改业务时不必读。
- `codex_*.go`（4 个）是单一供应商专用逻辑，不具代表性，不要作为通用样板。

## 三、模式锚点

- **业务规则样板：`channel.go`**。它演示本层标准写法：读取配置 → 调用 `model.` 存取 → 用 `i18n.Translate` + `common.LogText` 生成多语言消息 → 通过 `NotifyChannelWatchers` 广播变更。写新的业务动作参照它，不要参考 `codex_*.go`。
- **计费样板：`quota.go`**（预扣）+ `text_quota.go`（用量换算）+ `tiered_settle.go`（阶梯结算）三件套，三者必须一起读懂再改。
- **会话样板：`auth_session.go`** + `auth_token.go`，两者共用 `authSigningKey(...)` 派生签名密钥。
- 消息生成：面向用户的消息用 `i18n.Translate(lang, i18n.MsgXxx, params)`；服务日志用 `common.LogText(...)`。**不要硬编码中文**。
- 密钥与摘要派生走 `common.GenerateHMAC` / `common.CryptoSecret`；JSON 编解码走 `common.Marshal` / `common.Unmarshal`。

## 四、局部验证命令

仅针对本包，禁止全量构建：

```bash
# 静态检查
GOWORK=off go vet ./service/...

# 只跑本次改动相关的测试（用 -run 过滤）
GOWORK=off go test ./service/ -run 'TestChannelSelect' -count=1

# 改了 authz 时
GOWORK=off go test ./service/authz/ -count=1
```

## 五、本层专属约束

- **计费读门**：改动触及 `PriceData` / `OtherRatios`、预扣、结算、退款、消费日志计费字段，或从上游响应推导用量、图片张数、时长秒数、token 扣减，或校验会变成计费乘数的请求字段（`n`、`max_tokens` 族、时长、分辨率、质量、批量数），**必须先完整读 `.agents/rules/billing.md`**（根 `AGENTS.md` 有触发清单），再动手。
- **认证安全**：改动涉及注册、登录登出、密码变更与找回、邮箱验证、MFA、Passkey、OAuth/OIDC、账号绑定解绑、Session、JWT、API 凭证、敏感操作重认证时，适用根 `AGENTS.md` 的 OWASP 强制条款（ASVS + Cheat Sheet）。服务端强制优先，前端校验不可替代。
- **会话密钥**：`common.SessionSecret` / `common.CryptoSecret` 只存进程内存，不落库不入 Redis。`SESSION_SECRET` 未设置时是每进程随机 UUID（重启即全员掉线）；**字面值 `random_string` 会让进程 `log.Fatal` 退出**，不要照抄文档示例值。共享 Redis 的多节点必须使用一致的 `CRYPTO_SECRET`，否则缓存摘要不一致、无法共享缓存。
- **授权**：权限判定用 `authz.Can(...)` / `authz.Permission`，不要自己比较 role 数值或硬编码资源名。
- 测试须保护真实行为与计费不变量，禁止为了覆盖率添加 smoke、随机输入、sleep 或只证明代码运行的用例；新写的 Go 测试用 `testify/require`（致命断言）与 `testify/assert`（非致命断言）。
