# 邀请码功能实现指南

本文档记录为 new-api 项目新增"邀请码注册"功能所需的全部代码改动，按模块分层说明，供学习 Go 项目开发和本项目架构参考。

## 1. 需求概述

- **功能目标**：注册时必须提供有效的邀请码，否则拒绝注册
- **邀请码来源**：管理员后台生成并分发给用户
- **安全目标**：防止脚本自动化批量注册

## 2. 改动总览

| 层级 | 文件 | 操作 |
|---|---|---|
| 数据库 | `invite_codes` 表 | 新建（GORM AutoMigrate） |
| 配置 | `common/constants.go` | 新增开关变量 |
| 模型 | `model/invite_code.go` | 新建 |
| 模型 | `model/user.go` | 新增方法 |
| 控制器 | `controller/user.go` | 修改 Register 函数 |
| 控制器 | `controller/invite_code.go` | 新建 |
| 路由 | `router/api-router.go` | 新增 admin 路由 |
| 前端类型 | `web/src/features/auth/types.ts` | RegisterPayload 新增字段 |
| 前端 API | `web/src/features/auth/api.ts` | 发送 invite_code |
| 前端表单 | `web/src/features/auth/sign-up/components/sign-up-form.tsx` | 新增邀请码输入框 |
| 前端管理 | `web/src/features/invite-codes/` | 新建管理页面 |
| 国际化 | `web/src/i18n/locales/*.json` | 新增翻译 key |

---

## 3. 数据库层

### 3.1 表结构设计

```sql
CREATE TABLE invite_codes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         VARCHAR(64) NOT NULL UNIQUE,        -- 邀请码内容，如 nap_ic_xxxxxx
    created_by   INTEGER NOT NULL,                     -- 创建者（管理员）ID
    used_by      INTEGER,                             -- 使用者（注册用户）ID，NULL 表示未使用
    used_at      BIGINT,                             -- 使用时间戳
    expires_at   BIGINT NOT NULL,                     -- 过期时间戳，0 = 永不过期
    created_at   BIGINT NOT NULL,                     -- 创建时间戳
    remark       VARCHAR(255),                        -- 备注（可选）
    INDEX idx_code (code),
    INDEX idx_created_by (created_by),
    INDEX idx_expires_at (expires_at)
);
```

### 3.2 GORM AutoMigrate 注册

**文件**: `model/main.go`

在 `DB.AutoMigrate(...)` 调用中添加 `&InviteCode{}`：

```go
err := DB.AutoMigrate(
    // ... 现有实体 ...
    &UserAccessToken{},
    &InviteCode{},  // ← 新增这一行
)
```

> **说明**: GORM 的 AutoMigrate 会根据 struct 定义自动创建/更新表结构，无需手动执行 SQL。

---

## 4. 配置层

### 4.1 开关变量

**文件**: `common/constants.go`

在现有的注册相关配置附近添加：

```go
var RegisterEnabled = true
var InviteCodeRequired = false  // ← 新增：邀请码注册开关，默认关闭
```

### 4.2 后台设置项（可选）

如需通过后台管理界面动态控制，可参照 `model/option.go` 中 `QuotaForInviter` 的模式，将其注册为可配置的 Option 项。本指南暂用硬编码开关，动手实现时可自行扩展。

---

## 5. 模型层（Model）

### 5.1 新建 `model/invite_code.go`

这是核心实体文件，定义数据结构、生成逻辑和数据库操作。

```go
package model

import (
    "crypto/rand"
    "encoding/base64"
    "errors"
    "time"

    "github.com/QuantumNous/new-api/common"
    "gorm.io/gorm"
)

// ============================================================================
// 错误定义
// ============================================================================

var (
    ErrInviteCodeNotFound = errors.New("invite code not found")
    ErrInviteCodeUsed    = errors.New("invite code has already been used")
    ErrInviteCodeExpired = errors.New("invite code has expired")
)

// ============================================================================
// 数据结构
// ============================================================================

const inviteCodePrefix = "nap_ic_"

// InviteCode 注册邀请码，单次使用
type InviteCode struct {
    Id        int    `json:"id" gorm:"primaryKey"`
    Code      string `json:"code" gorm:"type:varchar(64);uniqueIndex"` // 邀请码，数据库唯一索引
    CreatedBy int    `json:"-" gorm:"type:int;index"`                 // 创建者ID
    UsedBy    *int   `json:"used_by,omitempty" gorm:"type:int"`       // 使用者ID，NULL = 未使用
    UsedAt    *int64 `json:"used_at,omitempty" gorm:"type:bigint"`   // 使用时间
    ExpiresAt int64  `json:"expires_at" gorm:"type:bigint;index"`     // 过期时间，0 = 永不过期
    CreatedAt int64  `json:"created_at" gorm:"type:bigint"`            // 创建时间
    Remark    string `json:"remark,omitempty" gorm:"type:varchar(255)"` // 备注
}

func (InviteCode) TableName() string {
    return "invite_codes"
}

// ============================================================================
// 邀请码生成
// ============================================================================

// GenerateInviteCode 生成安全的随机邀请码
// 格式: nap_ic_ + 32位 base64url 随机字符，总熵约 192 bit
func GenerateInviteCode() string {
    b := make([]byte, 24)
    rand.Read(b) // 错误忽略，生产环境应处理
    return inviteCodePrefix + base64.URLEncoding.EncodeToString(b)[:32]
}

// ============================================================================
// 状态校验
// ============================================================================

// Validate 检查邀请码当前是否有效
func (c *InviteCode) Validate() error {
    if c == nil {
        return ErrInviteCodeNotFound
    }
    if c.UsedBy != nil {
        return ErrInviteCodeUsed
    }
    if c.ExpiresAt > 0 && c.ExpiresAt <= time.Now().Unix() {
        return ErrInviteCodeExpired
    }
    return nil
}

// ============================================================================
// 数据库操作
// ============================================================================

// CreateInviteCode 创建一个新的邀请码
func CreateInviteCode(createdBy int, expiresAt int64, remark string) (*InviteCode, error) {
    code := &InviteCode{
        Code:      GenerateInviteCode(),
        CreatedBy: createdBy,
        ExpiresAt: expiresAt,
        Remark:    remark,
        CreatedAt: time.Now().Unix(),
    }
    if err := DB.Create(code).Error; err != nil {
        return nil, err
    }
    return code, nil
}

// GetInviteCodeByCode 根据 code 字符串查找邀请码
func GetInviteCodeByCode(code string) (*InviteCode, error) {
    var c InviteCode
    err := DB.Where("code = ?", code).First(&c).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrInviteCodeNotFound
    }
    return &c, err
}

// DeleteInviteCode 删除未使用的邀请码
// 已使用的邀请码不允许删除（保护审计记录）
func DeleteInviteCode(id int) error {
    return DB.Delete(&InviteCode{}, "id = ? AND used_by IS NULL", id).Error
}

// ListInviteCodes 分页列举邀请码
func ListInviteCodes(page, pageSize int) ([]InviteCode, int64, error) {
    var total int64
    var list []InviteCode
    DB.Model(&InviteCode{}).Count(&total)
    err := DB.Order("created_at DESC").
        Offset((page - 1) * pageSize).
        Limit(pageSize).
        Find(&list).Error
    return list, total, err
}

// CleanExpiredInviteCodes 定时清理过期且未使用的邀请码
// 可由 master 节点定时任务调用
func CleanExpiredInviteCodes() (int64, error) {
    result := DB.Where("expires_at > 0 AND expires_at < ? AND used_by IS NULL", time.Now().Unix()).
        Delete(&InviteCode{})
    return result.RowsAffected, result.Error
}

// ConsumeInviteCodeWithTx 在事务中消费邀请码（原子扣减）
// 注册时在用户 Insert 的同一事务中调用，确保用户创建成功才消耗邀请码
func ConsumeInviteCodeWithTx(tx *gorm.DB, code string, userId int) error {
    result := tx.Model(&InviteCode{}).
        Where("code = ? AND used_by IS NULL AND (expires_at = 0 OR expires_at > ?)", code, time.Now().Unix()).
        Updates(map[string]any{
            "used_by": userId,
            "used_at": time.Now().Unix(),
        })
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return ErrInviteCodeUsed
    }
    return nil
}
```

### 5.2 修改 `model/user.go`

在 `User` 结构体的 `Insert` 方法附近，新增一个支持邀请码的插入方法。

找到 `finishInsert` 或 `Insert` 方法，在其下方添加：

```go
// InsertWithInviteCode 插入用户并在同一事务中消费邀请码
// inviterId: 推荐人ID（来自 aff_code）
// inviteCode: 邀请码（可选，InviteCodeRequired 为 false 时可传空）
func (user *User) InsertWithInviteCode(inviterId int, inviteCode string) error {
    var consumeErr error
    err := DB.Transaction(func(tx *gorm.DB) error {
        user.Id = 0
        if user.AffCode == "" {
            user.AffCode = common.GetRandomString(4)
        }
        // 步骤1: 创建用户记录
        if err := tx.Create(user).Error; err != nil {
            return err
        }
        // 步骤2: 消费邀请码（在用户创建成功后）
        if inviteCode != "" {
            consumeErr = ConsumeInviteCodeWithTx(tx, inviteCode, user.Id)
        }
        return nil
    })
    if err != nil {
        return err
    }
    // 邀请码消耗失败不影响注册成功，但记录日志
    if consumeErr != nil {
        common.SysLog(common.LogText("ConsumeInviteCode failed after user insert: %v", consumeErr))
    }
    // 后续处理（推荐人奖励等）复用现有逻辑
    user.finishInsert(inviterId)
    return nil
}
```

---

## 6. 控制器层（Controller）

### 6.1 修改 `controller/user.go` — Register 函数

找到 `Register` 函数，在注册逻辑的最开头（`RegisterEnabled` 检查之后、`PasswordRegisterEnabled` 检查之后）插入邀请码校验：

```go
func Register(c *gin.Context) {
    if !common.RegisterEnabled {
        common.ApiErrorT(c, "New user registration has been disabled by administrator")
        return
    }
    if !common.PasswordRegisterEnabled {
        common.ApiErrorT(c, "Password registration has been disabled by administrator, please use third-party account verification")
        return
    }

    // ===== 新增：邀请码校验 =====
    var inviteCode string
    if common.InviteCodeRequired {
        inviteCode = strings.TrimSpace(c.Query("invite_code"))
        if inviteCode == "" {
            common.ApiErrorT(c, "Invitation code is required for registration")
            return
        }
        // 预校验邀请码有效性（不消费，等用户创建成功后再消费）
        code, err := model.GetInviteCodeByCode(inviteCode)
        if err != nil {
            if errors.Is(err, model.ErrInviteCodeNotFound) {
                common.ApiErrorT(c, "Invalid invitation code")
            } else {
                common.SysLog(common.LogText("GetInviteCodeByCode error: %v", err))
                common.ApiErrorT(c, "System error")
            }
            return
        }
        if err := code.Validate(); err != nil {
            if errors.Is(err, model.ErrInviteCodeUsed) {
                common.ApiErrorT(c, "Invitation code has already been used")
            } else if errors.Is(err, model.ErrInviteCodeExpired) {
                common.ApiErrorT(c, "Invitation code has expired")
            } else {
                common.ApiErrorT(c, "Invalid invitation code")
            }
            return
        }
    }
    // ===== 邀请码校验结束 =====

    // ... 后续现有逻辑保持不变 ...
    var user model.User
    err := common.DecodeJson(c.Request.Body, &user)
    // ...
}
```

然后找到注册成功前的 `cleanUser.Insert(inviterId)` 调用，改为：

```go
    // 原来的：
    // if err := cleanUser.Insert(inviterId); err != nil {

    // 改为：
    if err := cleanUser.InsertWithInviteCode(inviterId, inviteCode); err != nil {
```

### 6.2 新建 `controller/invite_code.go`

管理员操作邀请码的 CRUD 接口：

```go
package controller

import (
    "net/http"
    "strconv"
    "time"

    "github.com/QuantumNous/new-api/common"
    "github.com/QuantumNous/new-api/middleware"
    "github.com/QuantumNous/new-api/model"
    "github.com/gin-gonic/gin"
)

// GetInviteCodes 获取邀请码列表（分页）
// GET /api/admin/invite_codes?page=1&page_size=20
func GetInviteCodes(c *gin.Context) {
    page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
    pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
    if page < 1 {
        page = 1
    }
    if pageSize < 1 || pageSize > 100 {
        pageSize = 20
    }
    list, total, err := model.ListInviteCodes(page, pageSize)
    if err != nil {
        common.ApiErrorT(c, "Failed to get invite codes")
        return
    }
    common.SuccessWithData(c, gin.H{
        "items": list,
        "total": total,
        "page":  page,
    })
}

// CreateInviteCode 创建邀请码
// POST /api/admin/invite_codes
// Body: { "days": 7, "remark": "测试" }
func CreateInviteCode(c *gin.Context) {
    var req struct {
        Days   int    `json:"days"`   // 有效期天数，0 = 永不过期
        Remark string `json:"remark"` // 备注
    }
    if err := common.DecodeJson(c.Request.Body, &req); err != nil {
        common.ApiErrorT(c, "Invalid parameters")
        return
    }
    var expiresAt int64
    if req.Days > 0 {
        expiresAt = time.Now().AddDate(0, 0, req.Days).Unix()
    }
    // 0 = 永不过期，由管理员自行管理

    userId := middleware.GetUserId(c)
    code, err := model.CreateInviteCode(userId, expiresAt, req.Remark)
    if err != nil {
        common.SysLog(common.LogText("CreateInviteCode error: %v", err))
        common.ApiErrorT(c, "Failed to create invite code")
        return
    }
    common.SuccessWithData(c, code)
}

// DeleteInviteCode 删除未使用的邀请码
// DELETE /api/admin/invite_codes/:id
func DeleteInviteCode(c *gin.Context) {
    id, _ := strconv.Atoi(c.Param("id"))
    if id <= 0 {
        common.ApiErrorT(c, "Invalid id")
        return
    }
    if err := model.DeleteInviteCode(id); err != nil {
        common.ApiErrorT(c, "Failed to delete invite code")
        return
    }
    common.Success(c)
}
```

---

## 7. 路由层

**文件**: `router/api-router.go`

在已有的 admin 路由组中找到合适位置，添加邀请码管理路由：

```go
// 在 adminRoute 组内，redemptionRoute 附近添加：
inviteCodeRoute := apiRouter.Group("/admin/invite_codes")
inviteCodeRoute.Use(middleware.AdminAuth())
{
    inviteCodeRoute.GET("/", controller.GetInviteCodes)
    inviteCodeRoute.POST("/", controller.CreateInviteCode)
    inviteCodeRoute.DELETE("/:id", controller.DeleteInviteCode)
}
```

> **注意**：路由顺序很重要，`:id` 这类通配路由应放在具体路径之后。本项目的 admin 路由都在 `adminRoute` 组内统一管理，找到 `redemptionRoute` 或类似位置插入即可。

---

## 8. 前端层

### 8.1 类型定义

**文件**: `web/src/features/auth/types.ts`

在 `RegisterPayload` 接口中添加 `invite_code` 字段：

```typescript
export interface RegisterPayload {
  username: string
  password: string
  email?: string
  verification_code?: string
  aff_code?: string
  turnstile?: string
  invite_code?: string  // ← 新增
}
```

### 8.2 API 层

**文件**: `web/src/features/auth/api.ts`

`register` 函数目前通过 params 发送 `turnstile`，邀请码同样可通过 params 传递（保持与现有代码风格一致）：

```typescript
// 修改前：
export async function register(payload: RegisterPayload): Promise<ApiResponse> {
  const res = await api.post(`/api/user/register`, payload, {
    params: { turnstile: payload.turnstile ?? '' },
  })
  return res.data
}

// 修改后：
export async function register(payload: RegisterPayload): Promise<ApiResponse> {
  const res = await api.post(`/api/user/register`, payload, {
    params: {
      turnstile: payload.turnstile ?? '',
      invite_code: payload.invite_code ?? '',  // ← 新增
    },
  })
  return res.data
}
```

### 8.3 注册表单

**文件**: `web/src/features/auth/sign-up/components/sign-up-form.tsx`

在表单中添加邀请码输入框，建议放在 OAuth 登录按钮上方或最下方：

```tsx
// 在 useStatus() hook 之后，获取 invite_code 从 URL 参数
useEffect(() => {
  const code = new URLSearchParams(window.location.search).get('invite_code')?.trim()
  if (code) {
    form.setValue('invite_code', code)  // 需要在 form schema 中新增字段
  }
}, [])

// 在表单 JSX 中，Submit Button 之前添加：
<FormField
  control={form.control}
  name='invite_code'
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t('Invitation code')}</FormLabel>
      <FormControl>
        <Input
          placeholder={t('Enter invitation code')}
          {...field}
          value={field.value ?? ''}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### 8.4 表单验证 Schema

**文件**: `web/src/features/auth/constants.ts`

在 `registerFormSchema` 中添加 `invite_code` 字段：

```typescript
import { z } from 'zod'

export const registerFormSchema = z.object({
  username: z.string().min(1).max(20),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  invite_code: z.string().optional(),  // ← 新增
})
```

`onSubmit` 中也需要传递 `invite_code`：

```typescript
const res = await register({
  username: data.username,
  password: data.password,
  email: data.email || undefined,
  verification_code: verificationCode || undefined,
  aff_code: getAffiliateCode(),
  turnstile: turnstileToken,
  invite_code: data.invite_code || undefined,  // ← 新增
})
```

### 8.5 邀请码管理页面（Admin）

新建以下文件结构（参考 `web/src/features/` 下现有页面的组织方式）：

```
web/src/features/invite-codes/
├── api.ts              # API 调用封装
├── components/
│   ├── invite-code-list.tsx    # 邀请码列表（Table）
│   └── invite-code-dialog.tsx  # 创建/删除对话框
├── constants.ts
├── hooks/
│   └── use-invite-codes.ts     # TanStack Query hooks
├── index.tsx           # 页面入口
└── types.ts
```

**`api.ts`** 示例：

```typescript
import { api } from '@/lib/api'

export interface InviteCode {
  id: number
  code: string
  created_by: number
  used_by?: number
  used_at?: number
  expires_at: number
  created_at: number
  remark?: string
}

export async function getInviteCodes(params: {
  page: number
  page_size: number
}) {
  const res = await api.get('/api/admin/invite_codes', { params })
  return res.data
}

export async function createInviteCode(payload: {
  days: number
  remark?: string
}) {
  const res = await api.post('/api/admin/invite_codes', payload)
  return res.data
}

export async function deleteInviteCode(id: number) {
  const res = await api.delete(`/api/admin/invite_codes/${id}`)
  return res.data
}
```

**`invite-code-dialog.tsx`** — 创建邀请码对话框：

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInviteCode } from '../api'

interface CreateInviteCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (code: string) => void
}

export function CreateInviteCodeDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateInviteCodeDialogProps) {
  const { t } = useTranslation()
  const [days, setDays] = useState('7')
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setLoading(true)
    try {
      const res = await createInviteCode({
        days: parseInt(days) || 7,
        remark,
      })
      if (res.success) {
        toast.success(t('Invitation code created'))
        onSuccess(res.data.code)
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create invitation code')}</DialogTitle>
          <DialogDescription>
            {t('Generated code can only be used once')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-4'>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='days'>{t('Valid days')}</Label>
            <Input
              id='days'
              type='number'
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className='col-span-3'
            />
          </div>
          <div className='grid grid-cols-4 items-center gap-4'>
            <Label htmlFor='remark'>{t('Remark')}</Label>
            <Input
              id='remark'
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className='col-span-3'
              placeholder={t('Optional')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? t('Creating...') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**`invite-code-list.tsx`** — 列表页面（TanStack Table）：

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getInviteCodes,
  deleteInviteCode,
  type InviteCode,
} from '../api'
import { CreateInviteCodeDialog } from './invite-code-dialog'

export function InviteCodeList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [newCode, setNewCode] = useState('')
  const [showDialog, setShowDialog] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['invite-codes'],
    queryFn: () => getInviteCodes({ page: 1, page_size: 100 }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInviteCode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] })
    },
  })

  const columns: ColumnDef<InviteCode>[] = [
    {
      accessorKey: 'code',
      header: t('Invitation code'),
      cell: ({ row }) => (
        <div className='flex items-center gap-2 font-mono text-sm'>
          <span>{row.original.code}</span>
          <CopyButton text={row.original.code} />
        </div>
      ),
    },
    {
      accessorKey: 'remark',
      header: t('Remark'),
    },
    {
      accessorKey: 'expires_at',
      header: t('Expires at'),
      cell: ({ row }) =>
        row.original.expires_at === 0
          ? t('Never')
          : new Date(row.original.expires_at * 1000).toLocaleDateString(),
    },
    {
      accessorKey: 'used_by',
      header: t('Status'),
      cell: ({ row }) =>
        row.original.used_by ? t('Used') : t('Available'),
    },
    {
      id: 'actions',
      cell: ({ row }) =>
        !row.original.used_by && (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => deleteMutation.mutate(row.original.id)}
          >
            {t('Delete')}
          </Button>
        ),
    },
  ]

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>{t('Invitation codes')}</h2>
        <div className='flex items-center gap-2'>
          {newCode && (
            <div className='flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm font-mono'>
              {newCode}
              <CopyButton text={newCode} />
            </div>
          )}
          <Button onClick={() => setShowDialog(true)}>
            {t('Create')}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.id}>
                {typeof col.header === 'string' ? t(col.header) : ''}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.data?.items?.map((item: InviteCode) => (
            <TableRow key={item.id}>
              {columns.map((col) => (
                <TableCell key={col.id}>
                  {col.cell?.({ row: { original: item } } as any)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CreateInviteCodeDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSuccess={(code) => setNewCode(code)}
      />
    </div>
  )
}
```

---

## 9. 国际化

### 9.1 新增翻译 Key

在所有 `web/src/i18n/locales/*.json` 文件中添加以下 key（以 `en.json` 为例）：

```json
{
  "Invitation code": "Invitation code",
  "Enter invitation code": "Enter invitation code",
  "Invitation code is required for registration": "Invitation code is required for registration",
  "Invalid invitation code": "Invalid invitation code",
  "Invitation code has already been used": "Invitation code has already been used",
  "Invitation code has expired": "Invitation code has expired",
  "Invitation codes": "Invitation codes",
  "Create invitation code": "Create invitation code",
  "Generated code can only be used once": "Generated code can only be used once",
  "Valid days": "Valid days",
  "Create": "Create",
  "Creating...": "Creating...",
  "Invitation code created": "Invitation code created",
  "Available": "Available",
  "Used": "Used",
  "Expires at": "Expires at",
  "Never": "Never",
  "Remark": "Remark",
  "Optional": "Optional",
  "Cancel": "Cancel",
  "Delete": "Delete",
  "Failed to get invite codes": "Failed to get invite codes",
  "Failed to create invite code": "Failed to create invite code",
  "Failed to delete invite code": "Failed to delete invite code"
}
```

需要同步修改的语言文件：
- `en.json`（英文，源语言）
- `zh.json`（中文简体）
- `zh-TW.json`（中文繁体）
- `fr.json`（法语）
- `ru.json`（俄语）
- `ja.json` （日语）
- `vi.json`（越南语）

同步命令（前端项目根目录）：
```bash
bun run i18n:sync
```

---

## 10. 实施检查清单

完成代码编写后，按以下顺序验证：

### 后端验证

- [ ] `go build ./...` 编译通过
- [ ] 启动服务，`invite_codes` 表自动创建
- [ ] `InviteCodeRequired = true` 时，不带邀请码注册返回预期错误
- [ ] `InviteCodeRequired = true` 时，带无效邀请码注册返回预期错误
- [ ] `InviteCodeRequired = true` 时，带有效邀请码注册成功，邀请码变为已使用状态
- [ ] 同一邀请码第二次使用被拒绝（幂等性）
- [ ] Admin 接口 `POST /api/admin/invite_codes` 创建成功，返回 `nap_ic_` 开头的邀请码
- [ ] Admin 接口 `DELETE /api/admin/invite_codes/:id` 仅能删除未使用的码
- [ ] `InviteCodeRequired = false` 时，注册不受邀请码影响

### 前端验证

- [ ] `bun run build` 编译通过
- [ ] 注册页面显示邀请码输入框
- [ ] URL 携带 `?invite_code=xxx` 时自动填充输入框
- [ ] 邀请码管理页面正常展示、创建、删除

### 数据库兼容性验证

- [ ] SQLite 启动正常，表结构正确
- [ ] MySQL 启动正常，表结构正确（验证 autoIncrement 和 bigint 映射）
- [ ] PostgreSQL 启动正常，表结构正确

---

## 11. 项目代码风格要点（供手写参考）

### 命名规范

- **Model**: `InviteCode`，方法用 `CamelCase`，私有方法用 `camelCase`
- **Controller**: `GetInviteCodes`、`CreateInviteCode`（HTTP 语义）
- **错误变量**: `ErrInviteCodeNotFound`（`errors.New` 返回值）
- **常量**: `const inviteCodePrefix = "nap_ic_"`（包级私有）

### JSON 响应

使用 `common.ApiErrorT(c, "message key")` 返回错误，`common.SuccessWithData(c, data)` 返回成功数据。

### 请求解析

- JSON body: `common.DecodeJson(c.Request.Body, &req)`
- Query params: `c.Query("key")` 或 `c.DefaultQuery("key", "default")`
- 路径参数: `c.Param("id")`，配合 `strconv.Atoi` 使用

### 数据库操作

- 查询单条: `DB.Where("code = ?", code).First(&c)`
- 统计条数: `DB.Model(&InviteCode{}).Count(&total)`
- 条件更新: `tx.Model(c).Where(...).Updates(map[string]any{...})`
- 事务: `DB.Transaction(func(tx *gorm.DB) error {...})`

### 前端 API 封装

参考 `web/src/features/auth/api.ts`，使用 `api.post` / `api.get` / `api.delete`，通过 `res.data` 获取响应体。

### 表单验证

使用 `zod`，Schema 定义在 `constants.ts`，通过 `react-hook-form` + `zodResolver` 连接到 UI。
