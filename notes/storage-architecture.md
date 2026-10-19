# 数据库表与 Redis 存储结构 — 模块 / 功能映射

> 写给要理解 new-api 持久化层与缓存层的工程师。
>
> **数据源**：AutoMigrate 注册表（`model/main.go:342-395`）、所有 Redis 调用站点（`common/redis.go` + `pkg/cachex/` + 各 `*_cache.go`）。**所有表名、键名前缀、行号均为本仓库 `feature/V0.1` 分支实测**。
>
> 阅读建议：先读 §0 把握三层存储关系，再按模块跳读 §1（数据库）/ §2（Redis）。

---

## §0. 总览：三层存储

new-api 用到**三种持久化介质**，分工清晰：

```
┌──────────────────────────────────────────────────────────────────┐
│                          主数据库                                 │
│  SQLite / MySQL / PostgreSQL / ClickHouse (log DB only)          │
│  36 张表，由 AutoMigrate 在 model/main.go:342-395 注册            │
│  → 业务核心数据：用户、token、channel、计费日志、订阅等             │
└──────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ GORM                                │ GORM
         │                                    │
┌──────────────────────────────────────────────────────────────────┐
│                       Redis (可选)                                │
│  REDIS_CONN_STRING 未配置时自动降级（common/redis.go:25-27）     │
│  → Token / User / Session 缓存（Hash）                            │
│  → 限流计数（INCR / EXPIRE）                                     │
│  → 通道亲和性 / 订阅方案（HybridCache 通过 pkg/cachex）            │
└──────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │ common.RedisHGetObj / SetWithTTL    │
         │                                    │
┌──────────────────────────────────────────────────────────────────┐
│                  进程内 hot-cache (可选)                           │
│  common.MemoryCacheEnabled = true 时启用（默认）                  │
│  → channel id → channel 对象（model/channel_cache.go:18-19）     │
│  → subscription plan 等                                          │
└──────────────────────────────────────────────────────────────────┘
```

**为什么三层**：
- **数据库** = 唯一权威（source of truth）。任何崩溃都不丢数据。
- **Redis** = 跨实例共享的"高速缓存层"。多副本部署时各实例内存不共享，必须借助 Redis；限流计数器天然要集中计数。
- **进程内 hot cache** = 单实例内的零延迟缓存（lock-free 读）。比 Redis 还快一档，但不跨实例。

**通用降级策略**：Redis 不在线 → `common.RedisEnabled = false`，所有 Redis 调用静默退化到直接读 DB（代码里 `if common.RedisEnabled { ... } else { ... }`）。

---

## §1. 数据库表清单（按业务域分组，共 36 张主表 + 1 张 SQLite 专属）

所有表的注册入口：`model/main.go:342-395`（`DB.AutoMigrate(...)`）。
每张表对应的 Go struct 与同名（`&Channel{}` → `channels` 表）。
所有表都跨 SQLite / MySQL / PostgreSQL；ClickHouse **只**给日志 DB 用。

### 1.A 用户与认证域（13 张）

| 表（代码） | Go struct（路径） | 关键字段 | 模块 / 功能 | 主要读写 |
|---|---|---|---|---|
| `users` | `model/user.go` | `id, username, password, role (admin/user), quota, status` | `service/`、`middleware/auth.go` | 注册、登录、配额扣加 |
| `user_sessions` | `model/user_session.go` | `id, user_id, sid, expires_at, revoked_at, ip, user_agent` | `middleware/auth.go:514` | 浏览器会话；Redis 缓存 `auth:session:<HMAC(sid)>` |
| `user_access_tokens` | `model/user_access_tokens.go` | `id, user_id, token_hash, scope, expires_at` | 范围化令牌 | 替换旧 dashboard cookie；**有 retire_at 字段**（迁移用） |
| `auth_flows` | `model/auth_flow.go` | `id, user_id, flow_type, status, payload, expires_at` | 登录流程状态机 | 邮箱验证 / 找回密码 / OAuth 跳转 |
| `external_identity_claims` | `model/external_identity_claim.go` | `id, provider, subject, user_id` | OAuth 子账号绑定 | 跨设备识别同一用户 |
| `passkey_credentials` | `model/passkey.go` | `id, user_id, credential_id, public_key, sign_count` | WebAuthn | `middleware/auth.go` |
| `passkey_options` | `model/passkey_option.go` | 临时 challenge | WebAuthn 注册 / 登录 | 短时存储 |
| `two_fas` | `model/twofa.go` | `id, user_id, secret, is_enabled` | 二次验证 | 登录时验证 |
| `two_fa_backup_codes` | `model/twofa.go` | `id, two_fa_id, code_hash, used_at` | 二次验证备份码 | 用户丢失 TOTP 时用 |
| `two_fa_enrollments` | `model/twofa_enrollment.go` | 临时注册流程 | TOTP 注册 | 注册未完成期间 |
| `login_verifications` | `model/login_verification.go` | `id, user_id, code_hash, attempts` | 邮箱验证码 | 防爆破：`middleware/email-verification-rate-limit.go` |
| `login_encryption_keys` | `model/account_security.go` | 服务端密钥 | 加密登录状态 | OWASP 要求 |
| `email_bindings` | `model/email_binding.go` | `user_id, email, verified_at` | 邮箱绑定 | 重置 / 通知 |
| `password_cryptos` | `model/password_crypto.go` | 用户密码哈希记录 | 旧版密码保护 | 迁移期兼容 |
| `custom_oauth_providers` | `model/custom_oauth_provider.go` | 自定义 OAuth 配置 | OAuth 自定义 | 第三方管理 |
| `user_oauth_bindings` | `model/custom_oauth_provider.go` | OAuth 用户绑定 | OAuth 绑定 | 第三方登录 |

**OWASP 关注点**（来自 AGENTS.md）：
- 上述所有"密码 / 验证码 / 密钥 / OAuth 绑定 / WebAuthn"相关表都是 OWASP ASVS 必查项。
- 任何涉及凭证的字段改动都必须有日志审计（参见 §1.G `audit_logs`）。

### 1.B 鉴权策略域（2 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `casbin_rules` | `model/casbin_rule.go` | `p_type (p/g), v0, v1, v2, v3` | `service/authz/` | RBAC 规则存储 |
| `authz_roles` | `model/authz_role.go` | `id, name, description` | `service/authz/` | 角色定义 |

**关联**：`service/authz/` 通过 Casbin 适配器加载这两张表，运行时解析 `p, role, resource, action` 四元组。

### 1.C Token 与计费域（8 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `tokens` | `model/token.go` | `id, user_id, key (HMAC), status, expired_time, remain_quota, unlimited, model_limits` | `controller/`, `middleware/auth.go:514` | API token 鉴权、余额扣加 |
| `abilities` | `model/ability.go` | `id, model, group, channel_id, enabled` | `middleware/distributor.go:34` | channel × model 启用关系 |
| `top_ups` | `model/topup.go` | `id, user_id, quota, money, status, trade_no` | `controller/` | 充值订单 |
| `quota_data` | `model/quota_data.go` | `id, user_id, model_name, count` | `service/quota.go` | 模型粒度 quota 计数 |
| `redemptions` | `model/redemption.go` | `id, code, quota, used_by, used_at` | `controller/` | 兑换码 |
| `check_ins` | `model/checkin.go` | `id, user_id, date, quota` | `controller/` | 每日签到 |
| `subscription_orders` | `model/subscription.go` | `id, user_id, plan_id, status, period_end` | `controller/subscription*.go` | 订阅订单 |
| `user_subscriptions` | `model/subscription.go` | `id, user_id, plan_id, status, current_period_end` | 同上 | 用户当前订阅 |
| `subscription_pre_consume_records` | `model/subscription.go` | `id, sub_id, amount, request_id, refund_reason` | 计费预扣账本 | 失败可回滚 |
| `subscription_plans` | `model/subscription.go`（**仅 SQLite**）| `id, title, price, quota_per_period` | `controller/option.go:220-223` | 订阅方案（PostgreSQL/MySQL 走 Option 表） |

**Redis 关联**：
- `tokens` → `token:<HMAC(key)>`（`model/token_cache.go:12-13`）
- `users` → `user:<id>`（`model/user_cache.go:50`）
- `subscription_plans` → `new-api:subscription_plan:v1:<plan_id>`（`model/subscription.go:42, 90`）

### 1.D 渠道域（3 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `channels` | `model/channel.go` | `id, type, name, key (多 key JSON), base_url, models, group, status, balance, used_quota, priority, weight` | `middleware/distributor.go`, `model/channel.go` | 上游 channel 配置 |
| `models` | `model/model_meta.go` | `model_name, description, icon, tags, vendor_id, endpoints, status, sync_official` | `controller/model*.go` | 模型元数据；`sync_official` 控制是否参与"官方同步" |
| `vendors` | `model/model_meta.go` | `id, name, icon, description` | 同上 | 供应商元数据 |

**关键关系**：`channels` 多对多 ↔ `models` 通过 `abilities` 关联（见 §1.C）。
**进程内 hot cache**：`channelsIDM map[int]*Channel`（`model/channel_cache.go:18-19`），按 channel id O(1) 查询。

### 1.E 配置与选项域（2 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `options` | `model/option.go` | `key (PK), value (JSON)` | `controller/option.go` | 系统所有配置 KV（model_pricing、ratio、注册开关等） |
| `setups` | `model/setup.go` | `key, value` | `controller/setup.go` | **初始化标记**（root 账号是否创建等） |

**Option 是系统配置中心**：模型价格、倍率、登录方式开关、邮件服务配置、计费表达式等**全部存在这里**，按 key 读取。`controller/model_pricing_config.go` 的 PATCH 接口本质就是改 `options` 表的某些 key。

### 1.F 异步任务域（2 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `tasks` | `model/task.go` | `id, user_id, channel_id, task_id (上游), platform, status, properties (extreme bytes), private_data (extreme bytes), quota, progress` | `relay/relay_task.go` | 视频 / 图像任务主表 |
| `task_plugins` | `model/task_plugin.go` | `id, key, name, content (JS), enabled, manifest, billing_expr` | `controller/task_plugin*.go` | JS 任务插件源码 |

**任务状态机**（在 `constant/` 包里有枚举）：
```
pending → running → completed / failed / cancelled
                  ↓
              progress events（SSE/WebSocket 转发）
```

### 1.G 日志、审计与系统域（8 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `logs` | `model/log.go` | `id, user_id, type, content (JSON), prompt_tokens, completion_tokens, quota, model, channel_id, request_id, created_at` | `service/text_quota.go` | **计费账本 + 审计日志** |
| `audit_logs` | `model/audit_log.go` | `id, admin_id, action, target_type, target_id, diff, ip, ua` | `model/audit_log.go` | 管理员操作审计 |
| `audit_others` | `model/audit_other.go` | `id, audit_log_id, key, value` | 同上 | 审计日志的 KV 字段（EAV 模式） |
| `midjourneys` | `model/midjourney.go` | `id, user_id, channel_id, task_id, status, properties, image_url` | `relay/mjproxy_handler.go` | MJ 异步任务日志 |
| `perf_metrics` | `model/perf_metric.go` | `id, model, channel_id, p50, p99, error_count, request_count` | `pkg/perf_metrics/` | 性能指标（按模型 / channel） |
| `system_instances` | `model/system_instance.go` | `node_name (PK), info (JSON), last_seen_at, started_at` | `pkg/perf_metrics/` | **集群心跳**（行号 `:17-23`，90 秒无心跳视为离线） |
| `system_tasks` | `model/system_task.go` | `id, type, params (JSON), status, last_run_at` | 后台任务调度 | 定时清理 / 同步 |
| `system_task_locks` | `model/system_task.go` | `id, task_type, holder_id, expires_at` | 分布式锁 | 多副本下防止并发跑同一后台任务 |

**`logs` 是核心账本**：每次消费记一行，含真实 token / quota / request_id。是争议仲裁唯一依据。

### 1.H 迁移期 / 工具表（1 张）

| 表（代码） | Go struct | 关键字段 | 模块 | 主要读写 |
|---|---|---|---|---|
| `prefill_groups` | `model/prefill_group.go` | 预填用户组 | 启动预填 | 一次性；首次启动后基本只读 |

---

## §2. Redis 键空间（按用途分组）

所有 Redis 入口：`common/redis.go`。
键名格式约定：`<namespace>:<key>`，使用 `:` 分隔（Redis 标准）。

### 2.1 业务对象缓存（Hash）

| 键前缀 | 类型 | 用途 | 写入 | 失效 |
|---|---|---|---|---|
| `token:<HMAC(sk-key)>` | Hash | API token 缓存（`model/token_cache.go:12-13`） | `Token` 模型写入时 | `model/token.go:312-328 invalidateTokenCacheForMutation` |
| `token:<HMAC>:fence` | String | 防缓存击穿 | 与 token 同写 | 短 TTL（秒级） |
| `user:<id>` | Hash | 用户对象缓存（`model/user_cache.go:50`） | `CacheGetUser`、`CacheUpdateUser` | 用户变更时 `common.RedisDelKey`（`:67`） |
| `auth:session:<HMAC(sid)>` | Hash | 浏览器会话（`model/user_session.go:124`） | 登录成功后写入 | Session 注销 / 过期 |

**TTL 控制**：`common.RedisKeyCacheSeconds()`（`common/redis.go:19`），默认 600 秒。
**HMAC 化**：token 与 session 的 key 都用 HMAC 哈希过（`common.GenerateHMAC`、`common.GenerateHMACWithKey`），**原始 sk-key 不会进 Redis**。

### 2.2 HybridCache（业务对象 + 内存双层缓存）

`pkg/cachex/hybrid_cache.go` 实现的"Redis + 内存 hot-cache"统一抽象：

```
┌─────────────────────────────────────────────┐
│  pkg/cachex.HybridCache[V]                  │
│  Get(key) → 内存命中? ─yes→ 返回             │
│           ↓ no                              │
│           Redis 命中? ─yes→ 写回内存 → 返回  │
│           ↓ no                              │
│           Loader 从 DB 加载 → 写 Redis + 内存 │
└─────────────────────────────────────────────┘
```

| Namespace 常量（声明位置） | 实际 Redis 前缀 | 用途 |
|---|---|---|
| `subscriptionPlanCacheNamespace`（`model/subscription.go:42`）| `new-api:subscription_plan:v1:*` | 订阅方案缓存 |
| `subscriptionPlanInfoCacheNamespace`（`model/subscription.go:43`）| `new-api:subscription_plan_info:v1:*` | 订阅方案详情 |
| `channelAffinityCacheNamespace`（`service/channel_affinity.go:30`）| `new-api:channel_affinity:v1:*` | **通道亲和性**（同一会话优先走同一 channel） |
| `channelAffinityUsageCacheStatsNamespace`（`service/channel_affinity.go:31`）| `new-api:channel_affinity_usage_cache_stats:v1:*` | 亲和性命中统计 |

**namespace v1 后缀** = 协议版本，方便 schema 演进时一次性 `DeleteByPrefix` 清理。

### 2.3 限流（INCR + EXPIRE）

| 键前缀 | 类型 | 用途 | 写入点 |
|---|---|---|---|
| `rateLimit:v2:ip:<mark>:<client_ip>` | String（计数器）| IP 级限流（`middleware/rate-limit.go:46`）| `redisIPRateLimitKey` → `RedisIncr` |
| `rateLimit:v2:user:<mark>:<user_id>` | String（计数器）| 用户级限流（`:50`）| `redisUserRateLimitKey` → `RedisIncr` |
| `rateLimit:v2:model:<mark>:<user_id>`（推测）| String | 模型级限流（`middleware/model-rate-limit.go`）| 走 `memoryRateLimiter` 或 Redis 实现 |

**典型用法**（`middleware/rate-limit.go:110 redisRateLimiter`）：
```go
// 经典滑动窗口伪代码
count := RedisIncr(key)
if count == 1 {
    RedisExpire(key, duration)  // 第一次写时设过期
}
if count > maxRequestNum {
    return 429
```

### 2.4 通知去重

| 键 | 用途 | 写入点 |
|---|---|---|
| `<namespace>:notify-limit:<mark>` | 通知类操作的限频（如密码重置邮件） | `service/notify-limit.go:61-81` |

### 2.5 Token cache fence（防缓存击穿）

| 键 | 类型 | 用途 |
|---|---|---|
| `token:<HMAC>:fence` | String（带超短 TTL）| 当 token 被并发更新时，**先写 fence → 等 fence 过期 → 才允许再写缓存**（`model/token_cache.go:14-17, 82`）|

这是 Redis 经典的"防雪崩"模式：避免并发更新把缓存值反复互相覆盖。

### 2.6 集群 / 心跳

| 键 | 用途 |
|---|---|
| （不走 Redis） | `system_instances` 表（§1.G）做心跳，每 30 秒 upsert 一次；`system_task_locks` 做分布式锁 |

**注意**：new-api **没有用 Redis Pub/Sub 做节点发现**，所有集群协调都走 DB 表。简化部署，但单点风险也集中在 DB。

---

## §3. 缓存层架构全景

```
                 客户端请求
                     │
                     ▼
        ┌──────────────────────────┐
        │   Gin handler            │
        │   middleware.Distribute  │
        └──────────────────────────┘
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
  进程内 hot    Redis HGet    DB GORM Find
   (O(1)        (跨实例)      (权威)
    读，仅本实例)
        │            │             │
        └─miss───────┴─miss────────┘
                     │
                     ▼
              Loader 写回（Redis + 内存）
```

**三层的访问路径**（参考 `model/token_cache.go:99` 的 `CacheGetTokenByKey`）：
```go
// 1. 先看 Redis
if common.RedisEnabled {
    err := common.RedisHGetObj(getTokenCacheKey(key), &token)
    if err == nil {
        return &token, nil
    }
}
// 2. Redis 没命中 → 查 DB
err := DB.Where("key = ?", key).First(&token).Error
if err != nil {
    return nil, err
}
// 3. 写回 Redis（与 fence 配合）
go cacheToken(token) // 异步写
return &token, nil
```

**进程内 hot-cache**（`common.MemoryCacheEnabled = true` 时启用）：
- `channel_id → Channel`（`model/channel_cache.go:18 channelsIDM`）
- `channel_id → AdvancedCustomConfig`（`:19 channel2advancedCustomConfig`）
- `group → model → []channel_id`（`:17 group2model2channels`）
- 这些 map 在 `model/channel_cache.go::InitChannelCache` 时全量加载，之后 `SyncChannelCache` 周期性刷新（`:109`）。

---

## §4. 缓存一致性策略

### 4.1 失效策略：**写时失效（cache invalidation）**，不强制写**穿透更新**（write-through）

看 `model/token.go:312-328`：
```go
func ... {
    // DB.Save(...)
    if cacheErr := invalidateTokenCacheForMutation(token.Key); cacheErr != nil {
        logger.LogWarn(ctx, ...)
    }
}
```

**新值通过下次读穿透加载**，避免"先写缓存再写 DB 时 DB 失败导致缓存与 DB 不一致"。

### 4.2 防击穿：fence 短时键

`token:<HMAC>:fence`（`model/token_cache.go:14-17`）：当并发更新撞车时，**最先更新者写 fence + 等 DB commit**，后来的更新者读到这个 fence → 不再写缓存，避免两个并发请求的旧值相互覆盖。

### 4.3 分布式场景

- **多副本部署**：每个副本启动时调 `InitChannelCache` + 各自读 DB 填充内存 cache；**通过 Redis 共享 token / user / session cache**；channel hot cache 由 `SyncChannelCache` 定期（`frequency int` 在 `model/channel_cache.go:109`）从 DB 重新加载。
- **写一致性**：所有写入走 DB + Redis 失效，但**副本间的进程内 hot-cache 不实时同步**——靠周期 sync 收敛。

### 4.4 配置入口

| 变量 | 默认 | 说明 |
|---|---|---|
| `REDIS_CONN_STRING` | 空（自动降级）| Redis 连接 |
| `MEMORY_CACHE_ENABLED` | true | 进程内 hot-cache |
| `CHANNEL_SYNC_FREQUENCY` | （推断）| `SyncChannelCache` 周期 |
| `REDIS_KEY_CACHE_SECONDS` | 600 | Token / User 缓存 TTL（`common/redis.go:19`） |

---

## §5. 排查指南

### 5.1 怎么找一张表的所有字段

1. 在 `model/` 目录下找到对应 Go 文件（文件名通常与表名相关）。
2. 字段定义在 `type Xxx struct { ... }` 中，**GORM tag 决定列名与类型**。
3. 用 `bun run dev` 启动后，浏览器 F12 → 看接口的 SQL，或者直接 DataGrip / DBeaver 看。

### 5.2 怎么找一个 Redis 键是怎么写的

1. `grep -rn "<key-prefix>" --include="*.go"` （排除 `_test` 和 `vendor`）。
2. 看 `common.RedisSet` / `common.RedisHSetObj` 的调用栈。
3. 如果是 `pkg/cachex.HybridCache` 的实例，去 `model/subscription.go` 或 `service/channel_affinity.go` 找 namespace 常量。

### 5.3 怎么判断"为什么这条 query 慢"

- **第一步**：看 `model/gorm_logger.go` 的 SQL 日志（开启 Debug 模式后会打印 SQL + 耗时）。
- **第二步**：定位到 GORM 调用 → 看是否有缓存（Redis / 内存 hot-cache）→ 缓存命中就直接 return，缓存未命中才会走 DB。
- **第三步**：DB 慢 → 看是否有合适的索引（用 `EXPLAIN`）。

### 5.4 数据迁移期表

`model/main.go:395` 在 SQLite 上额外调 `ensureSubscriptionPlanTableSQLite()` —— 这是因为订阅方案在 SQLite 上是独立表，**PG/MySQL 通过 Option KV 实现**。部署跨 DB 时**不要直接假设某张表存在**。

### 5.5 性能热路径

| 路径 | 缓存层级 |
|---|---|
| API Token 鉴权 | `token:<HMAC>` Redis Hash（O(1)）|
| 路由 Distribute | `channelsIDM` 内存 map + Redis token 验证 |
| 计费写账 | 直接写 DB（`model/log.go:339 RecordConsumeLog`），**不缓存**（账本必须实时落盘）|
| 限流 | Redis 计数器（`rateLimit:v2:*`）|
| 通道亲和性 | HybridCache（`new-api:channel_affinity:v1:*`）|

---

## §6. 一张总表速查

### 6.1 数据库表（中英对照）

| 表名 | 中文域 | Go struct | 行数（首推） |
|---|---|---|---|
| `users` | 用户 | `model/user.go` | `:1-100` |
| `user_sessions` | 会话 | `model/user_session.go` | `:1-120` |
| `user_access_tokens` | 访问令牌 | `model/user_access_tokens.go` | — |
| `auth_flows` | 鉴权流程 | `model/auth_flow.go` | — |
| `external_identity_claims` | 外部身份 | `model/external_identity_claim.go` | — |
| `passkey_credentials` | WebAuthn | `model/passkey.go` | — |
| `passkey_options` | WebAuthn 临时 | `model/passkey_option.go` | — |
| `two_fas` | 2FA | `model/twofa.go` | — |
| `two_fa_backup_codes` | 2FA 备份 | `model/twofa.go` | — |
| `two_fa_enrollments` | 2FA 注册 | `model/twofa_enrollment.go` | — |
| `login_verifications` | 登录验证码 | `model/login_verification.go` | — |
| `login_encryption_keys` | 登录加密 | `model/account_security.go` | — |
| `email_bindings` | 邮箱绑定 | `model/email_binding.go` | — |
| `password_cryptos` | 密码哈希 | `model/password_crypto.go` | — |
| `custom_oauth_providers` | OAuth 配置 | `model/custom_oauth_provider.go` | — |
| `user_oauth_bindings` | OAuth 绑定 | `model/custom_oauth_provider.go` | — |
| `casbin_rules` | 鉴权规则 | `model/casbin_rule.go` | — |
| `authz_roles` | 角色 | `model/authz_role.go` | — |
| `tokens` | API token | `model/token.go` | `:1-300` |
| `abilities` | 能力 | `model/ability.go` | — |
| `top_ups` | 充值 | `model/topup.go` | — |
| `quota_data` | 模型 quota | `model/quota_data.go` | — |
| `redemptions` | 兑换码 | `model/redemption.go` | — |
| `check_ins` | 签到 | `model/checkin.go` | — |
| `subscription_orders` | 订阅订单 | `model/subscription.go` | — |
| `user_subscriptions` | 用户订阅 | `model/subscription.go` | — |
| `subscription_pre_consume_records` | 订阅预扣 | `model/subscription.go` | — |
| `subscription_plans` (SQLite only) | 订阅方案 | `model/subscription.go` | — |
| `channels` | 渠道 | `model/channel.go` | `:1-300` |
| `models` | 模型元数据 | `model/model_meta.go` | `:1-300` |
| `vendors` | 供应商 | `model/model_meta.go` | — |
| `options` | 系统选项 KV | `model/option.go` | — |
| `setups` | 初始化标记 | `model/setup.go` | — |
| `tasks` | 异步任务 | `model/task.go` | — |
| `task_plugins` | JS 插件 | `model/task_plugin.go` | — |
| `logs` | 计费日志 | `model/log.go` | `:57-150` |
| `audit_logs` | 审计日志 | `model/audit_log.go` | — |
| `audit_others` | 审计 KV | `model/audit_other.go` | — |
| `midjourneys` | MJ 任务 | `model/midjourney.go` | — |
| `perf_metrics` | 性能指标 | `model/perf_metric.go` | — |
| `system_instances` | 集群心跳 | `model/system_instance.go` | `:17-23` |
| `system_tasks` | 系统任务 | `model/system_task.go` | — |
| `system_task_locks` | 任务锁 | `model/system_task.go` | — |
| `prefill_groups` | 预填组 | `model/prefill_group.go` | — |

### 6.2 Redis 键前缀速查

| 前缀 | 用途 | 写入函数 |
|---|---|---|
| `token:<HMAC>` | API token Hash | `model/token_cache.go` |
| `token:<HMAC>:fence` | 防击穿 | 同上 |
| `user:<id>` | 用户 Hash | `model/user_cache.go` |
| `auth:session:<HMAC>` | Session Hash | `model/user_session.go:124` |
| `new-api:subscription_plan:v1:*` | 订阅方案 | `model/subscription.go:42, 90` |
| `new-api:subscription_plan_info:v1:*` | 订阅详情 | `model/subscription.go:43, 111` |
| `new-api:channel_affinity:v1:*` | 通道亲和性 | `service/channel_affinity.go:30, 95` |
| `new-api:channel_affinity_usage_cache_stats:v1:*` | 亲和性统计 | `service/channel_affinity.go:31, 997` |
| `rateLimit:v2:ip:<mark>:<ip>` | IP 限流 | `middleware/rate-limit.go:46` |
| `rateLimit:v2:user:<mark>:<user_id>` | 用户限流 | `middleware/rate-limit.go:50` |
| `rateLimit:v2:model:<mark>:<user_id>` | 模型限流 | `middleware/model-rate-limit.go` |
| `<ns>:notify-limit:<mark>` | 通知去重 | `service/notify-limit.go` |

---

## §7. 学完检验清单

- [ ] 能说出三层（DB / Redis / 进程内 hot-cache）的分工与降级策略。
- [ ] 能讲清 token → user → session → channel 鉴权各走哪个 Redis key。
- [ ] 能解释为什么 channel hot-cache 写在 `channelsIDM` map 而不是 Redis。
- [ ] 能讲清 `Option` 表为什么是"系统配置中心"，以及它和"model_pricing"的关系。
- [ ] 能讲清 fence 短时键防击穿的原理。
- [ ] 能解释为什么计费日志（`logs` 表）不缓存。
- [ ] 能区分 `sync_official`（`models` 表字段）与"官方倍率预设"（`basellm.github.io` 拉取）。
- [ ] 能讲清 cluster 部署时心跳走 `system_instances` 表而不是 Redis Pub/Sub 的取舍。