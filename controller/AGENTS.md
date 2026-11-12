# AGENTS.md — controller/ (HTTP 处理层)

本目录是管理台与客户端 API 的 Gin handler 层：解析请求、调用 `service/` 与 `model/`、组装响应。它不含业务规则与持久化逻辑。

## 一、职责与入口

- 路由注册在 `router/api-router.go`（442 行，主体 API）、`router/channel-router.go`、`router/relay-router.go`。**改 handler 前先在 `router/` 里定位路径**，确认中间件链（`middleware.UserAuth()` / `AdminAuth()` / 各类限流）。
- 入口 handler：`user.go`（用户与权限）、`token.go`（API 令牌）、`channel.go`（渠道管理）、`option.go`（系统配置）、`relay.go`（转发入口）
- 响应封装：`common.ApiSuccessT` / `common.ApiErrorT` / `common.ApiError`；鉴权判定：`authz.Can(userId, role, authz.<Permission>)`

## 二、检索禁令（Do Not）

- **禁止全目录 Grep 业务关键词**。135 个文件里大量是 `*_test.go`（约半数），先按「路由路径 → handler 函数名」定点定位。
- **禁止在 controller 里写业务规则**。配额、计费、鉴权决策属 `service/`；SQL 属 `model/`。发现 handler 里出现计费/额度判断，说明放错层了。
- **禁止逐个打开 `subscription_payment_*.go` / `topup_*.go`**。这几个支付渠道文件同构，改一个渠道只读那一个 + `topup.go` 的公共部分。
- `plugin_protocol*.go`、`task_plugin*.go` 是插件协议桥接，与普通 CRUD 无关，按需读单个文件。
- `*_test.go` 属噪音，除非要改对应行为，否则不打开。

## 三、模式锚点

- **标准 CRUD handler 样板：`channel.go`**。它完整演示了本层的标准骨架：解析入参 → `service.`/`model.` 调用 → `authz.Can` 权限判定 → `common.ApiSuccessT` / `common.ApiErrorT` 返回。写新的资源型 handler 时只参考它，不要参考 `plugin_protocol.go` 这类特殊协议文件。
- 权限判定用 `authz.Can(...)`（见 `channel.go:755`、`:1021`），不要自己比较 role 数值。
- 响应文案是**英文源文本**交给前端翻译，用 `common.ApiSuccessT` / `common.ApiErrorT` 构造，不要在 handler 里写中文或拼接本地化字符串。
- JSON 编解码走 `common.Unmarshal` / `common.Marshal`，禁止直接用 `encoding/json`。

## 四、局部验证命令

仅针对本包，禁止全量构建：

```bash
# 静态检查
GOWORK=off go vet ./controller/

# 只跑本次改动相关的测试（用 -run 过滤，不要整包全量）
GOWORK=off go test ./controller/ -run 'TestChannel' -count=1

# 改了路由注册时额外确认路由层编译
GOWORK=off go vet ./router/
```

## 五、本层专属约束

- **认证相关改动适用根 `AGENTS.md` 的 OWASP 强制条款**：注册、登录登出、密码找回、邮箱验证、MFA、Passkey、OAuth/OIDC、账号绑定、Session、令牌与敏感操作的重认证。前端校验不能替代服务端强制。
- 敏感操作须做二次确认与重认证；鉴权失败信息不得区分「账号不存在」与「密码错误」，以免账号枚举。
- 审计事件不得记录密码、验证码、恢复码、私钥或可直接使用的会话/鉴权令牌。
- 请求体大小限制走 `middleware.request_body_limit.go` 与 `anonymousRequestBodyLimit`，不要在 handler 内自造上限。
- 新增 handler 必须同步在 `router/` 注册路由，并挂上合适的鉴权与限流中间件。
