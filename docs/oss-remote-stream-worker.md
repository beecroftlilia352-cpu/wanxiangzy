# OSS 远程图片流式转存 Worker

当前生产方案使用 EC2 上的独立任务循环将第三方图片 URL 流式写入阿里云 OSS。
API 和页面请求不下载图片；完整图片不落磁盘，也不会组装成 Node.js `Buffer`。
后续迁移阿里云 Function Compute 时保持数据库任务协议不变，只移动 Worker 执行器。

```text
Provider URL
  -> generation worker 登记 pending（加密 URL、预期 MIME/大小、幂等 generation_ref）
  -> PostgreSQL durable queue / SKIP LOCKED lease
  -> remote-transfer worker
  -> HTTPS ReadableStream + backpressure
  -> OSS PutObject
  -> signed HEAD 校验大小和 MIME
  -> completed，清除 URL 密文，generation 发布最终 OSS URL
```

## 生产配置

GitHub Actions variables：

```text
ALIYUN_OSS_REMOTE_TRANSFER_MODE=stream
ALIYUN_OSS_MIRROR_ENABLED=false
ALIYUN_OSS_MIRROR_ALLOWED_HOSTS=apac.ossforai.com
```

`ALIYUN_OSS_MIRROR_ALLOWED_HOSTS` 是兼容期名称；新环境可使用
`ALIYUN_OSS_REMOTE_ALLOWED_HOSTS`。两个变量都只接受显式域名或
`*.example.com`，禁止全局通配符。

可选调优项：

```text
ALIYUN_OSS_REMOTE_STREAM_TIMEOUT_MS=120000
ALIYUN_OSS_REMOTE_CONCURRENCY=8
ALIYUN_OSS_REMOTE_WORKER_BATCH_SIZE=8
ALIYUN_OSS_MIRROR_MAX_BYTES=67108864
ALIYUN_OSS_MIRROR_MAX_ATTEMPTS=8
ALIYUN_OSS_MIRROR_WAIT_TIMEOUT_MS=240000
```

Worker 每次认领数不会超过进程网络并发，避免任务尚未开始传输租约就过期。
增加 PM2 Worker 实例前先确认 EC2 出口带宽、文件描述符、上游限流和 OSS QPS。

## 安全与一致性

- URL 仅以加密密文存储，成功、终止失败或过期后清空。
- 仅允许 HTTPS 和配置域名；DNS 解析、每次重定向都重新执行公网地址检查，阻止
  localhost、RFC1918、链路本地地址和云元数据地址。
- 登记前读取最多 64 字节，校验 Content-Length、MIME 和 magic bytes；完整传输时
  再次校验 MIME、长度和 magic bytes。
- 流式管道实时计数，超过预期大小或上限会中止；`Accept-Encoding: identity`
  避免压缩长度与实际对象长度不一致。
- OSS key 与 generation slot 幂等。Worker 崩溃后重领时先做 signed HEAD；完整对象
  已存在则直接完成，错误或半成品对象先删除再重试。
- 408、429 和 5xx 使用指数退避；永久 4xx、非法 URL、SSRF、MIME/magic/长度变化
  终止重试。
- generation 只发布通过 HEAD 验证的 OSS URL。终止失败继续走现有一次性退款 RPC。

## 本地与发布验证

代码变更先在本地完成以下门禁：

```bash
npm test -- --run lib/api/__tests__/oss-mirror-transfer.test.ts \
  lib/api/__tests__/remote-image-fetch.test.ts \
  lib/api/__tests__/result-image-storage.test.ts \
  lib/__tests__/env-contract.test.ts
npm run typecheck
npm run check:release
```

真实协议探测必须使用专用测试 key，并在同一流程中验证 PUT、HEAD 后删除对象。
完整公网回调类能力不能用 `localhost` 证明，应使用隔离 staging 域名/Bucket；当前
stream 模式不依赖 OSS 回调，因此可从本地直接验证远程流到 OSS 的数据面。

发布后只做一次真实用户链路冒烟：确认人物图出现、结果 URL 属于 OSS、对象 HEAD
大小正确、任务完成且余额只扣一次。失败时确认余额自动恢复且没有短期 Provider URL。

## 迁移 Function Compute

FC 迁移不改 API、表结构或任务状态机。将同一 `processPendingOssMirrorTransfers`
执行器部署到与 OSS 同地域的 FC，使用 OSS internal endpoint 和最小权限 RAM Role；
EC2 上关闭 remote-transfer loop。切换时一次只能有一个主执行池，但数据库租约和
`FOR UPDATE SKIP LOCKED` 可保证短暂重叠不会重复发布对象。
