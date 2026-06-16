# 备份与恢复 Runbook

本项目的核心持久化数据在 Supabase PostgreSQL，图片和视频资源在外部存储供应商中。备份策略必须同时覆盖数据库、对象存储和生产密钥。

## 备份范围

数据库至少覆盖这些业务表：

```text
profiles
generations
task_queue_items
credit_transactions
billing_events
credit_packages
user_credit_accounts
admin_members
admin_audit_logs
admin_config_versions
tryon_reference_*
support_tickets
operation_requests
saved_views
```

对象存储至少覆盖这些前缀：

```text
site-assets/original
user-uploads/original
generated-results/original
user-favorites/original
temp/original
```

生产密钥至少覆盖 GitHub Actions Secrets、EC2 `shared/.env.production`、Supabase 项目 API keys、OSS RAM keys、Stripe keys 和 AI provider keys。密钥备份只能进入密码管理器或云厂商 Secret Manager，不能提交到仓库。

## Supabase 备份

如果 Supabase 项目开启了 Point-in-Time Recovery，优先使用 Supabase Dashboard 的备份和恢复能力。恢复到生产前，先恢复到 staging 项目并完成验证。

也可以用 `pg_dump` 生成逻辑备份：

```bash
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "backup-$(date +%Y%m%d-%H%M%S).dump"
```

如需导出纯 SQL：

```bash
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-acl \
  --file "backup-$(date +%Y%m%d-%H%M%S).sql"
```

备份完成后记录：

```text
Supabase project ref
backup file name
backup start/end time
schema migration state
application tag
storage provider and bucket
```

## 对象存储备份

阿里云 OSS 建议开启 bucket 版本控制、生命周期规则和同区域或跨区域复制。手动备份可使用 `ossutil` 或控制台批量复制到备份 bucket。

ImgBB 不适合作为长期唯一备份源。若生产仍使用 ImgBB，数据库中的结果 URL 只能保证业务可引用，不等于可恢复的对象副本。建议迁移到 OSS 后再上线高价值生产流量。

## 恢复前检查

1. 暂停发布和后台任务处理器，避免恢复过程中继续写入。
2. 对当前生产库再做一次即时备份。
3. 确认要恢复的应用 tag、数据库备份和对象存储备份来自同一时间窗口。
4. 先恢复到 staging，验证登录、生成历史、积分余额、后台管理和对象 URL。
5. 准备回退方案：保留恢复前备份、当前应用 release 和当前 `.env.production`。

## 恢复数据库

自定义格式备份恢复示例：

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname "$TARGET_DATABASE_URL" \
  backup-20260616-120000.dump
```

纯 SQL 恢复示例：

```bash
psql "$TARGET_DATABASE_URL" < backup-20260616-120000.sql
```

恢复生产前再次确认 `TARGET_DATABASE_URL` 指向正确项目。生产恢复完成后，重新运行当前代码要求的 SQL 迁移，避免备份时间早于最新 schema。

## 恢复对象

1. 先恢复 `site-assets/original`，确保页面静态资源可访问。
2. 再恢复 `generated-results/original` 和 `user-favorites/original`，确保历史作品和收藏可打开。
3. 最后恢复 `user-uploads/original` 和 `temp/original`，这些对象通常时效性最低。
4. 抽查数据库中最近 20 条 `generations` 的 `result_url` 和 `input_image_url`。

## 恢复后验证

1. 运行本地或 CI 发布门禁：

   ```bash
   npm run check:release
   ```

2. 部署当前稳定 tag。
3. 打开线上 `/create`、`/history`、`/pricing`、`/admin`。
4. 验证一个普通用户的登录、余额、历史记录和图片打开。
5. 验证一个后台管理员的权限、审计日志和关键列表页。
6. 恢复后台任务处理器，并观察 30 分钟日志。

## 例行频率

```text
每日：数据库自动备份或 pg_dump
每日：OSS 增量复制或版本控制
每周：staging 恢复演练
每月：生产密钥盘点和权限复核
重大版本发布前：手动数据库备份 + 对象存储快照
```
