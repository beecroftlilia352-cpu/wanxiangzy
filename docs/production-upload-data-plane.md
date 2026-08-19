# 生产用户上传数据面（阿里云 OSS）

## 数据流

生产环境设置 `UPLOAD_DELIVERY_MODE=direct`。图片与视频上传按以下顺序执行：

1. 浏览器使用 Web Crypto 计算文件 SHA-256，只把名称、字节数、MIME、用途和摘要提交给同源签发 API。
2. API 用 Supabase `auth.getUser()` 校验真实登录用户，再用 Redis Lua 原子执行每用户分钟签发数、活跃上传数和 24 小时字节额度检查。生产 Redis 不可用时 fail-closed。
3. API 生成不可变 Object Key：`<upload-prefix>/<user-hash>/<purpose>/<hash-prefix>/<sha256>.<ext>`，并通过 service-role fenced RPC 在媒体资产账本创建 `pending` 记录。Key 不包含原始文件名、邮箱或用户 ID；回执同时绑定 `media_asset_id`、lease token、fence version 和真实 Bucket。
4. API 返回 1–10 分钟内有效的 OSS PostObject policy。Policy 精确约束 Bucket、Object Key、文件字节数、MIME、SHA-256 metadata、用户哈希、用途、`x-oss-forbid-overwrite=true` 和 `x-oss-object-acl=private`。响应只包含 AccessKey ID、policy 和签名，绝不包含长期 AccessKey Secret。
5. 浏览器把 `file` 作为最后一个表单字段直传 OSS，然后把用户绑定的 HMAC 回执提交给同源完成 API。
6. 完成 API 对固定的、服务端生成的 Object Key 执行签名 HEAD，核对 Content-Length、Content-Type、ETag 和全部 metadata。图片会读回全部内容，核对 SHA-256、文件魔数并由 Sharp 在像素上限内解码，然后 fenced `complete` + `verify`。视频只在请求路径读取前 64 KiB 做 MP4/MOV `ftyp`/brand 初筛，fenced `complete` 后保持 `uploaded/pending_validation`；同一数据库事务把任务写入 durable media-validation queue。
7. 独立 Worker 领取带 lease/fence 的视频验证任务，流式读取完整 OSS 对象，重新计算 SHA-256 并执行媒体探测，再原子结算为 `verified` 或 `quarantined`。客户端有界轮询 owner-only 状态 API，验证完成前拿不到可用于生成的 URL。
8. 明确内容不匹配时对象会被签名 DELETE 并把账本置为 quarantined。数据库结算响应丢失属于不确定结果，此时保留不可变对象并允许同一 fenced 回执幂等重试，禁止“猜测失败后删除”造成账本与对象永久分裂。
9. 业务数据持久化 `media_asset_id`/Object Key，不持久化短时 OSS URL。浏览器访问 canonical `/api/media-assets/<asset-id>`；owner-only resolver 只为 `verified` 资产签发 1–60 分钟 GET URL 并 302 跳转。

小文件在浏览器无法直连 OSS（例如临时 CORS/网络故障）时可以回退到同源 multipart API。回退仍使用相同 Redis 配额、媒体资产账本、魔数/像素限制、内容寻址 Key、private ACL 和禁止覆盖语义，不能绕过准入控制。图片因服务端已完整读取可同步 verified；视频仍进入 durable validation queue 并由客户端轮询。生产不支持整体切回服务端上传模式。

## 必需环境变量

```env
IMAGE_STORAGE_PROVIDER=aliyun-oss
ALIYUN_OSS_REGION=oss-cn-hongkong
ALIYUN_OSS_BUCKET=your-private-bucket
ALIYUN_OSS_PUBLIC_BASE_URL=https://images.example.com
ALIYUN_OSS_ACCESS_KEY_ID=server-only-ram-user-id
ALIYUN_OSS_ACCESS_KEY_SECRET=server-only-ram-user-secret
ALIYUN_OSS_UPLOAD_PREFIX=user-uploads/original

UPLOAD_DELIVERY_MODE=direct
UPLOAD_INTENT_SECRET=<independent random secret, at least 32 bytes>
UPLOAD_INTENT_TTL_SECONDS=300
UPLOAD_READ_URL_TTL_SECONDS=600
UPLOAD_IMAGE_MAX_MB=15
UPLOAD_VIDEO_MAX_MB=100
UPLOAD_SERVER_FALLBACK_MAX_MB=5
UPLOAD_IMAGE_MAX_PIXELS=40000000
UPLOAD_IMAGE_MAX_EDGE=12000
UPLOAD_DAILY_QUOTA_MB=2048
UPLOAD_INTENT_RATE_PER_MINUTE=120
UPLOAD_MAX_ACTIVE_INTENTS=20

REDIS_URL=rediss://<private-redis-endpoint>/0
```

`UPLOAD_INTENT_SECRET`、OSS Secret 和 `REDIS_URL` 都只能存在于服务端 Secret 管理中，不能使用 `NEXT_PUBLIC_` 前缀，也不能写入日志或管理接口响应。建议生产改用由 ECS 实例角色换取的短时 STS 凭证；如果暂时使用 RAM 用户 AK，RAM 用户只授予目标 Bucket 指定前缀的 `PutObject`、`GetObject`、`HeadObject`、`DeleteObject`，并定期轮换。

## OSS CORS

Bucket CORS 必须只允许实际 Web Origin，禁止 `*` 与凭证组合。推荐规则：

```text
AllowedOrigin: https://your-production-domain.example
AllowedMethod: POST
AllowedHeader: content-type
ExposeHeader: ETag,x-oss-request-id
MaxAgeSeconds: 600
```

PostObject 的 policy 字段属于 multipart 表单字段，不需要加入 AllowedHeader。若有预发布域名，为每个可信 Origin 添加明确规则。完成 HEAD/GET/DELETE 由服务端发起，不需要浏览器 CORS 权限。

## Bucket、ACL 与运维策略

- 开启服务端加密、访问日志、版本控制或 WORM（按合规需求）和跨可用区冗余。`site-assets/` 可使用 `public-read`；`user-uploads/`、`generated-results/`、`user-favorites/`、`temp/` 必须是 private。Bucket 默认 ACL 应为 private，不能把不可猜 Key 当访问控制。
- Provider 调用前必须从 canonical asset 解析短时签名 GET；不能把需要登录 cookie 的 canonical URL直接交给第三方，也不能把短签名 URL写入 generation/job/资源库数据库。
- 对 `user-uploads/original/` 配置未被业务引用对象的生命周期清理；校验失败 DELETE 只是第一道清理。
- 告警覆盖签发 429、配额拒绝、Redis fail-closed、OSS 4xx/5xx、完成回执缺失、HEAD metadata 不一致和清理失败。
- 视频目前限制为 100 MB 的 MP4/MOV 单对象上传；请求路径只做 ISO BMFF 初筛，最终信任结论来自 durable Worker 的全流 SHA-256 与媒体探测。若以后开放更大视频或分片上传，应加入 OSS Multipart Upload 和未完成分片清理，不能放宽当前 PostObject policy。
- `ALIYUN_OSS_UPLOAD_PREFIX` 变更会改变内容地址。滚动发布期间保持旧前缀可读，等历史任务结束后再迁移生命周期策略。

## 验证清单

1. 登录用户上传 JPG/PNG/WebP 和 MP4/MOV，浏览器 Network 中大文件请求直接指向 OSS，不经过 Next 请求体。
2. 未登录签发与完成请求返回 401；把 A 用户回执交给 B 用户返回 400。
3. 篡改 Key、MIME、大小、metadata 或 policy 后 OSS 拒绝上传。
4. 重复上传相同内容返回同一个不可变 Key；不同用户和不同用途不会共用 Key。
5. 伪装扩展名、错误魔数、超像素图片和 metadata 不一致对象在完成阶段失败并被删除。
6. 停止 Redis 后生产签发和小文件回退均拒绝，恢复后自动可用。
7. 触发分钟速率、活跃数和 24 小时字节额度，确认 429/413 与 `Retry-After` 正确。
8. 让 registry complete RPC 提交后模拟响应丢失，确认 API 返回可重试 503、OSS 对象未删除，同一回执重试能收敛。
9. 视频完成后确认状态先为 `pending_validation`，validation job 可 recover/DLQ；只有 Worker 全流校验成功后 canonical resolver 才 302 到短签名 URL。
10. 匿名访问、其他用户访问、quarantined/pending 资产访问均被拒绝；数据库中不存在带 `OSSAccessKeyId`/`Expires`/`Signature` 的持久 URL。
