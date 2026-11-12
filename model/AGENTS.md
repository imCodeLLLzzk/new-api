# AGENTS.md — model/ (GORM 数据层与迁移)

本目录是唯一直接接触数据库的层：表结构定义、GORM 查询、迁移与多数据库方言适配。业务语义属 `service/`，HTTP 语义属 `controller/`。

## 一、职责与入口

- 数据库初始化与迁移总入口：`main.go`（`migrateDB()` 在 `main.go:325`，`DB.AutoMigrate(...)` 的表清单在 `main.go:345`；`migrateLOGDB()` 在 `main.go:407` 负责独立日志库）
- 核心实体：`channel.go`（渠道）、`token.go`（令牌）、`user.go`（用户）、`option.go`（系统配置）、`task.go`（异步任务）、`pricing.go`（模型定价）
- 迁移脚本：`token_migration.go`、`prefill_group_migration.go`、`option_primary_key_migration.go`、`migration_dialector.go`、`frontend_option_migration.go`

## 二、检索禁令（Do Not）

- **禁止全目录读取表结构**。117 个文件里约半数是 `*_test.go`。要确认某张表是否存在、字段名与类型，**先查 `main.go:345` 的 `AutoMigrate` 清单**，再只读对应实体文件。
- **禁止为了「看有哪些模型」而遍历本目录**。实体清单在 `main.go:345` 一处即可。
- **禁止在 `model/` 内写业务判断**。计费、鉴权决策属 `service/`；本层只负责存取与不变量（如唯一性、并发锁）。
- `*_migration.go` 之间不要互相套用样板；每个迁移对应一次历史 schema 变更，**改写既有迁移会破坏已升级的数据库**。新增变更请写新文件。
- `model/pricing*.go` 与 `model/model_pricing*.go` 属计费读门范围，改动前先读 `.agents/rules/billing.md`。

## 三、模式锚点

- **实体样板：`channel.go`**。它演示了本层标准写法：GORM tag（`gorm:"default:..."`、`gorm:"index"`、`gorm:"type:text"`）、`Scanner`/`Valuer` 自定义类型（`ChannelInfo` 用 `type:json`）、软删除与状态字段、可选标量用指针（`Weight *uint`、`BaseURL *string`）。新增实体照此写，不要参考 `log.go` 这类跨库特殊表。
- **查询样板：`token.go`**。演示分页查询、`LIKE` 模式转义（`sanitizeLikePattern` / `validateLikePattern`）、密钥脱敏（`MaskTokenKey`）与缓存键生成。
- **行锁必须走 `lockForUpdate(tx)`**（定义在 `model/locking.go:20`）。**禁止** `tx.Set("gorm:query_option", "FOR UPDATE")`（GORM v2 静默忽略），也**禁止**在调用点直接写 `clause.Locking{Strength: "UPDATE"}`。该 helper 对 SQLite 跳过、对其余库生成 `FOR UPDATE`。
- **保留字列名用 `commonGroupCol` / `commonKeyCol`**（定义在 `model/main.go:22`）；布尔字面量用 `commonTrueVal` / `commonFalseVal`。不要手写方言分支。
- 主库 / 日志库分支用 `common.UsingMainDatabase(...)` / `common.UsingLogDatabase(...)`。

## 四、局部验证命令

仅针对本包，禁止全量构建：

```bash
# 静态检查
GOWORK=off go vet ./model/

# 只跑本次改动相关的测试（用 -run 过滤）
GOWORK=off go test ./model/ -run 'TestChannel' -count=1

# 改了迁移时，必须验证迁移幂等：连续跑两次启动迁移
GOWORK=off go test ./model/ -run 'TestMigration|TestOptionPrimaryKey|TestTokenMigration' -count=2
```

## 五、本层专属约束（跨库强制）

- **所有数据库代码必须同时支持 SQLite、MySQL >= 5.7.8、PostgreSQL >= 9.6**。单库验证、mock、单 dialect 通过都不算数；完整验证须实跑三种引擎，并在交付说明中记录确切版本与命令结果。跑不了就明确报告阻塞，不得宣称兼容。
- **Schema / 迁移变更必须双测**：全新数据库 + 由已发布版本升级而来的代表性数据库；启动/迁移至少跑两次证明幂等；验证既有数据、索引、约束与唯一性不丢失。
- 优先用 GORM 方法（`Create` / `Find` / `Where` / `Updates`），避免裸 SQL；必须裸写时处理方言差异：PostgreSQL 用 `"column"`，MySQL/SQLite 用 `` `column` ``。
- 主键交给 GORM 生成，**禁止**直接写 `AUTO_INCREMENT` / `SERIAL`。
- SQLite 迁移用 `ALTER TABLE ... ADD COLUMN`，**禁止** `ALTER COLUMN`。
- 避免 GORM 布尔默认标签（如 `gorm:"default:true"`），默认值用请求/模型归一化、hook 或业务逻辑表达，否则 MySQL 与 PostgreSQL 的布尔归一化差异会让 `AutoMigrate` 每次启动都重复改表。
- 改 GORM 核心或方言驱动版本时，必须核对上游兼容矩阵并跑完整三库验证。
