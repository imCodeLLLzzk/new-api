# 支付功能开通清单

本文档梳理 new-api 项目接入支付收银台所需的第三方厂商、配置项与验证步骤。所有配置均通过后台「系统设置」写入数据库（`options` 表），不需要环境变量。

## 1. 前置：合规确认（硬性拦截）

**所有支付相关功能默认关闭**，包括充值、兑换码、订阅、邀请奖励。

```go
// controller/option.go:200
case "QuotaForInviter", "QuotaForInvitee":
    if isPositiveOptionValue(option.Value.(string)) && !operation_setting.IsPaymentComplianceConfirmed() {
        common.ApiErrorT(c, "Payment, redemption, subscription, and invitation reward features are disabled. The administrator must confirm compliance terms before enabling them.")
        return
    }
```

判断逻辑：

```go
// setting/operation_setting/payment_setting.go:33
func IsPaymentComplianceConfirmed() bool {
    return paymentSetting.ComplianceConfirmed &&
        paymentSetting.ComplianceTermsVersion == CurrentComplianceTermsVersion  // "v1"
}
```

**操作方式**：后台调用 `POST /api/option/payment_compliance`，body `{"confirmed": true}`。

该接口有额外限制：**必须使用浏览器登录会话，API Token 调用返回 403**。

```go
// controller/payment_compliance.go
if c.GetBool("use_access_token") {
    c.JSON(http.StatusForbidden, gin.H{
        "message": "This operation requires dashboard session authentication. API access token is not allowed.",
    })
    return
}
```

确认后写入四个字段（记录确认人、时间、IP，用于审计）：

| 字段 | 值 |
|---|---|
| `payment_setting.compliance_confirmed` | `true` |
| `payment_setting.compliance_terms_version` | `v1` |
| `payment_setting.compliance_confirmed_at` | Unix 时间戳 |
| `payment_setting.compliance_confirmed_by` | 管理员用户 ID |

这四个字段**不能通过通用设置接口修改**，有专门保护：

```go
// controller/option.go:206
if isPaymentComplianceOptionKey(option.Key) {   // 前缀匹配 payment_setting.compliance_
    common.ApiErrorT(c, "Compliance confirmation fields cannot be changed through the general settings API")
    return
}
```

---

## 2. 第三方支付厂商清单

项目支持 5 个渠道，覆盖国内与海外：

| 渠道 | 类型 | 适用地区 | 依赖库 |
|---|---|---|---|
| **易支付（Epay）** | 聚合支付 | 国内 | 自实现（HTTP 协议） |
| **Stripe** | 卡支付 | 海外 | `stripe-go/v81 v81.4.0` |
| **Creem** | SaaS 订阅制 | 海外 | HTTP 实现 |
| **Waffo** | 卡支付 | 中东/全球 | `waffo-com/waffo-go v1.3.2` |
| **Waffo Pancake** | 卡支付 | 中东/全球 | `waffo-com/waffo-pancake-sdk-go v0.3.1` |

### 选择建议

| 场景 | 推荐 |
|---|---|
| 国内用户、需要支付宝/微信 | 易支付（对接彩虹易支付等聚合平台） |
| 海外用户、信用卡 | Stripe |
| 想省事、用托管的订阅制收款 | Creem（开箱即用，配置最少） |
| 中东地区 | Waffo / Pancake |

---

## 3. 各渠道配置详解

### 3.1 易支付（Epay）

**第三方准备**：自建彩虹易支付，或对接第三方易支付聚合平台。拿到：
- 支付网关地址（如 `https://pay.example.com`）
- 商户 ID（PID）
- 商户密钥（KEY）

**项目配置项**：

| 配置项 | 说明 | 示例 |
|---|---|---|
| `PayAddress` | 支付网关根地址 | `https://pay.example.com` |
| `EpayId` | 商户 ID（PID） | `1001` |
| `EpayKey` | 商户密钥 | `abc123...` |
| `PayMethods` | 启用的支付方式（JSON 数组） | 见下 |

`PayMethods` 格式：

```json
[
  {"name": "支付宝", "type": "alipay", "color": "#1677FF"},
  {"name": "微信支付", "type": "wxpay", "color": "#07C160"}
]
```

**启用判断**（`controller/payment_webhook_availability.go`）：

```go
func isEpayTopUpEnabled() bool {
    if !isPaymentComplianceConfirmed() { return false }
    return isEpayWebhookConfigured() && len(operation_setting.PayMethods) > 0
}

func isEpayWebhookConfigured() bool {
    return strings.TrimSpace(operation_setting.PayAddress) != "" &&
        strings.TrimSpace(operation_setting.EpayId) != "" &&
        strings.TrimSpace(operation_setting.EpayKey) != ""
}
```

**注意**：三个配置项必须**同时**非空，且 `PayMethods` 数组不能为空，否则静默关闭。

**回调地址**（配置到易支付后台）：

```
https://你的域名/api/user/epay/notify
```

该端点同时注册了 GET 和 POST：

```go
// router/api-router.go:89
userRoute.POST("/epay/notify", anonymousRequestBodyLimit, controller.EpayNotify)
userRoute.GET("/epay/notify", controller.EpayNotify)
```

订阅场景有独立回调：

```
https://你的域名/api/subscription/epay/notify
https://你的域名/api/subscription/epay/return
```

---

### 3.2 Stripe

**第三方准备**：
1. 注册 Stripe 账号，完成 KYC 认证（激活收款权限）
2. 创建 Product + Price（固定价格）
3. 获取 API Secret Key（`sk_live_...` 或测试 `sk_test_...`）
4. 配置 Webhook Endpoint，获取 Signing Secret（`whsec_...`）

**项目配置项**：

| 配置项 | 说明 | 来源 |
|---|---|---|
| `StripeApiSecret` | API 私钥 | Dashboard → Developers → API keys |
| `StripeWebhookSecret` | Webhook 签名密钥 | Webhook Endpoint 创建后显示 |
| `StripePriceId` | 价格对象 ID（`price_...`） | Product 页面 |
| `StripeMinTopUp` | 最低充值金额 | 自定义，如 `5` |
| `StripeUnitPrice` | 单位价格 | 与 Price 对象对应 |
| `StripePromotionCodesEnabled` | 是否启用优惠码 | `true` / `false` |

**启用判断**：

```go
func isStripeTopUpEnabled() bool {
    if !isPaymentComplianceConfirmed() { return false }
    return strings.TrimSpace(setting.StripeApiSecret) != "" &&
        strings.TrimSpace(setting.StripeWebhookSecret) != "" &&
        strings.TrimSpace(setting.StripePriceId) != ""
}
```

**三个密钥必须同时配置**，缺一个就静默关闭（不报错，前端不显示 Stripe 选项）。

**Webhook 配置**：

```
https://你的域名/api/stripe/webhook
```

需要订阅的事件类型（至少支付成功）：

- `checkout.session.completed`
- `payment_intent.succeeded`

**易踩的坑**：
- Stripe Webhook 需要公网 HTTPS 地址，本地开发需要 `stripe cli` 转发
- 测试模式与生产模式的密钥**不能混用**，Webhook 会签名校验失败
- Webhook Endpoint 的 URL 必须精确匹配（含 https://）

---

### 3.3 Creem

**第三方准备**：
1. 注册 [creem.io](https://creem.io) 账号
2. 创建 Product，配置价格
3. 获取 API Key
4. 配置 Webhook 获得签名密钥

**项目配置项**：

| 配置项 | 说明 |
|---|---|
| `CreemApiKey` | API Key |
| `CreemProducts` | 产品配置 JSON 数组 |
| `CreemTestMode` | 是否测试模式（`true` / `false`） |
| `CreemWebhookSecret` | Webhook 签名密钥 |

**启用判断**：

```go
func isCreemTopUpEnabled() bool {
    if !isPaymentComplianceConfirmed() { return false }
    products := strings.TrimSpace(setting.CreemProducts)
    return strings.TrimSpace(setting.CreemApiKey) != "" &&
        products != "" && products != "[]"
}
```

注意 `CreemProducts` 不能是空字符串或 `"[]"`，必须至少有一个产品。

**Webhook 配置**：

```
https://你的域名/api/creem/webhook
```

**注意**：Stripe 需要三个密钥，Creem 只需 API Key + 产品配置 + Webhook Secret。Creem 是**配置最少的渠道**，适合快速验证支付流程。

---

### 3.4 Waffo

**第三方准备**：注册 Waffo 账号，获取商户凭证与 RSA 密钥对。

**项目配置项**：

| 配置项 | 说明 |
|---|---|
| `WaffoEnabled` | 总开关（`true`） |
| `WaffoApiKey` | API Key |
| `WaffoPrivateKey` | 商户私钥 |
| `WaffoPublicCert` | 平台公钥证书 |
| `WaffoSandbox` | 是否沙箱模式 |
| `WaffoSandboxApiKey` | 沙箱 API Key |
| `WaffoSandboxPrivateKey` | 沙箱私钥 |
| `WaffoSandboxPublicCert` | 沙箱公钥证书 |
| `WaffoMerchantId` | 商户 ID |
| `WaffoCurrency` | 结算币种 |
| `WaffoUnitPrice` | 单位价格 |
| `WaffoMinTopUp` | 最低充值额 |
| `WaffoPayMethods` | 支付方式列表（JSON） |
| `WaffoNotifyUrl` | 异步通知地址 |
| `WaffoReturnUrl` | 同步返回地址 |
| `WaffoSubscriptionReturnUrl` | 订阅返回地址 |

**启用判断**（区分沙箱/正式）：

```go
func isWaffoWebhookConfigured() bool {
    if setting.WaffoSandbox {
        return strings.TrimSpace(setting.WaffoSandboxApiKey) != "" &&
            strings.TrimSpace(setting.WaffoSandboxPrivateKey) != "" &&
            strings.TrimSpace(setting.WaffoSandboxPublicCert) != ""
    }
    return strings.TrimSpace(setting.WaffoApiKey) != "" &&
        strings.TrimSpace(setting.WaffoPrivateKey) != "" &&
        strings.TrimSpace(setting.WaffoPublicCert) != ""
}
```

**三凭证是 RSA 非对称验证**，不是对称密钥，配置时注意不要填反。

**Webhook 配置**：

```
https://你的域名/api/waffo/webhook
```

---

### 3.5 Waffo Pancake

**第三方准备**：注册 Pancake（中东支付聚合），获取商户 ID、私钥、商品 ID。

**项目配置项**：

| 配置项 | 说明 |
|---|---|
| `WaffoPancakeMerchantID` | 商户 ID |
| `WaffoPancakePrivateKey` | 商户私钥 |
| `WaffoPancakeStoreID` | 店铺 ID |
| `WaffoPancakeProductID` | 商品 ID |
| `WaffoPancakeUnitPrice` | 单位价格 |
| `WaffoPancakeMinTopUp` | 最低充值额 |
| `WaffoPancakeReturnURL` | 返回地址 |

**启用判断**：

```go
func isWaffoPancakeTopUpEnabled() bool {
    if !isPaymentComplianceConfirmed() { return false }
    // Presence-of-credentials = enabled. Webhook public keys ship inside
    // the SDK; mode (test/prod) is read from each event.
    return strings.TrimSpace(setting.WaffoPancakeMerchantID) != "" &&
        strings.TrimSpace(setting.WaffoPancakePrivateKey) != "" &&
        strings.TrimSpace(setting.WaffoPancakeProductID) != ""
}
```

**Webhook 配置（关键差异）**：

```
https://你的域名/api/waffo-pancake/webhook/test     ← 测试环境
https://你的域名/api/waffo-pancake/webhook/prod     ← 生产环境
```

路径参数 `:env` 用于隔离测试与生产回调。项目注释说明：

```go
// :env separates test vs prod URLs so the operator can register each
// in Pancake's matching webhook slot; handler enforces env match.
```

**Pancake 的 Webhook 公钥内置在 SDK 中**，无需配置。

---

## 4. 全局定价配置（必做）

无论用哪个渠道，这几项影响所有充值计算：

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `QuotaPerUnit` | 每 1 美元的 quota 数 | `500000`（即 $0.002 / 1K tokens） |
| `payment_setting.amount_options` | 充值金额选项数组 | `[10, 20, 50, 100, 200, 500]` |
| `payment_setting.amount_discount` | 金额折扣映射 | `{}` |

```go
// common/constants.go:22
var QuotaPerUnit = 500 * 1000.0 // $0.002 / 1K tokens
```

折扣示例（100 元充值享 9 折）：

```json
{"100": 0.9, "200": 0.85}
```

**计算链路**：支付金额 → 应用折扣 → 除以单价比率 → 得到 quota。

---

## 5. 端到端开通步骤

以 **Creem** 为例（配置最少，适合先验证流程）：

### 步骤 1：合规确认

```
POST /api/option/payment_compliance
Body: {"confirmed": true}
Header: Bearer <access_token>   ← 必须浏览器会话，PAT 会 403
```

### 步骤 2：配置全局定价

后台 → 系统设置 → 运营设置：
- `QuotaPerUnit`：按你的定价策略设置
- `payment_setting.amount_options`：充值档位

### 步骤 3：配置支付渠道

后台 → 系统设置 → 支付设置：
- `CreemApiKey`
- `CreemProducts`（从 Creem 后台复制产品配置）
- `CreemTestMode` = `true`（先跑测试）
- `CreemWebhookSecret`

### 步骤 4：配置 Webhook

在 Creem 后台添加：
```
https://你的域名/api/creem/webhook
```

### 步骤 5：验证启用

```
GET /api/user/topup/info
```

应能看到 `pay_methods` 数组中包含 Creem 条目。参考实现：

```go
// controller/topup.go:26
func GetTopUpInfo(c *gin.Context) {
    complianceConfirmed := operation_setting.IsPaymentComplianceConfirmed()
    payMethods := operation_setting.PayMethods
    if !complianceConfirmed {
        payMethods = []map[string]string{}   // ← 未确认合规时返回空
    }
    // 各渠道凭配置情况动态追加
    ...
}
```

### 步骤 6：端到端测试

1. 前端充值页选择 Creem
2. 提交充值请求 → `POST /api/user/creem/pay`
3. 跳转第三方支付页
4. 完成支付 → 第三方回调 `/api/creem/webhook`
5. 查数据库 `topups` 表确认记录，quota 已到账

### 步骤 7：切换生产

1. `CreemTestMode` = `false`
2. 更换生产 API Key 与 Webhook Secret
3. 生产环境单独注册 Webhook URL

---

## 6. 接口清单

### 用户侧发起支付

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/user/topup/info` | 获取可用支付方式（GET） |
| POST | `/api/user/topup` | 通用充值 |
| POST | `/api/user/pay` | 易支付下单 |
| POST | `/api/user/stripe/pay` | Stripe 下单 |
| POST | `/api/user/stripe/amount` | Stripe 金额计算 |
| POST | `/api/user/creem/pay` | Creem 下单 |
| POST | `/api/user/waffo/amount` | Waffo 金额计算 |
| POST | `/api/user/waffo/pay` | Waffo 下单 |
| POST | `/api/user/waffo-pancake/amount` | Pancake 金额计算 |
| POST | `/api/user/waffo-pancake/pay` | Pancake 下单 |

### 第三方回调（无鉴权，需签名校验）

| 方法 | 路径 | 渠道 |
|---|---|---|
| POST | `/api/user/epay/notify` | 易支付（同时有 GET） |
| POST | `/api/stripe/webhook` | Stripe |
| POST | `/api/creem/webhook` | Creem |
| POST | `/api/waffo/webhook` | Waffo |
| POST | `/api/waffo-pancake/webhook/:env` | Pancake |

### 订阅计费（独立于充值）

| 方法 | 路径 | 渠道 |
|---|---|---|
| POST | `/api/subscription/epay/pay` | 易支付 |
| POST | `/api/subscription/stripe/pay` | Stripe |
| POST | `/api/subscription/creem/pay` | Creem |
| POST | `/api/subscription/waffo-pancake/pay` | Pancake |

### 管理员

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/user/topup` | 充值记录列表 |
| POST | `/api/user/topup/complete` | 手动完成充值 |
| GET | `/api/option/waffo-pancake/catalog` | 获取 Pancake 商品目录 |
| POST | `/api/option/waffo-pancake/pair` | 配对商品 |
| POST | `/api/option/waffo-pancake/save` | 保存商品配置 |
| POST | `/api/option/waffo-pancake/subscription-product` | 创建订阅商品 |
| POST | `/api/option/waffo-pancake/subscription-product-options` | 订阅商品选项 |
| POST | `/api/option/payment_compliance` | 确认合规条款 |

---

## 7. 常见问题排查

### 支付方式不显示

按顺序检查：

1. **合规是否已确认** — 未确认时 `GetTopUpInfo` 直接返回空数组
2. **该渠道的所有密钥是否都填了** — 任一为空则静默关闭，无报错
3. **产品配置是否为空** — `CreemProducts = "[]"` 会被判定为未配置
4. **`PayMethods` 数组是否为空** — 影响易支付启用判断

```go
// 三者任一为 false，前端就看不到该渠道，且没有任何错误提示
if !isPaymentComplianceConfirmed() { return false }
```

### Webhook 收不到

- 是否配置了公网 HTTPS 地址
- Stripe 测试/生产密钥是否混用
- Pancake 的 URL 环境后缀是否正确（`/test` vs `/prod`）
- Webhook 是否被 Nginx/防火墙拦截

### 支付成功但 quota 未到账

- 检查 `topups` 表记录状态
- 确认 Webhook 签名校验通过（查看服务端日志）
- 检查 `QuotaPerUnit` 是否合理

---

## 8. 本地开发注意事项

Webhook 需要第三方服务器回调你的地址，本地开发无法直接收到。

**Stripe**：使用官方 CLI 转发

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**其他渠道**：需要内网穿透工具（ngrok、cloudflared 等）：

```bash
cloudflared tunnel --url http://localhost:3000
```

---

## 9. 快速选择矩阵

| 你的情况 | 选哪个 | 必填配置 |
|---|---|---|
| 快速验证支付流程 | **Creem** | ApiKey + Products + WebhookSecret |
| 国内用户、支付宝/微信 | **易支付** | PayAddress + EpayId + EpayKey + PayMethods |
| 海外信用卡 | **Stripe** | ApiSecret + WebhookSecret + PriceId |
| 中东地区 | **Pancake** | MerchantID + PrivateKey + ProductID |
| 需要非对称签名验证 | **Waffo** | ApiKey + PrivateKey + PublicCert |

**所有渠道的共同前置**：先确认合规条款。
