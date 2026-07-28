# AWS EC2 发布检查表

本项目生产部署由 GitHub Actions 触发，目标是 AWS EC2。工作流文件是 `.github/workflows/deploy-aws-on-tag.yml`；当推送任意 Git tag 时，CI 会先运行 `npm run check:release`，再打包源码并通过 SSH 上传到 EC2，最后执行 `scripts/deploy-aws-release.sh`。

## 发布前

1. 确认本地改动范围只包含本次发布内容：

   ```bash
   git status --short
   git diff --stat
   ```

2. 在本地运行完整发布门禁：

   ```bash
   npm run check:release
   ```

   该命令会依次执行测试、提示词回归、lint、TypeScript、生产构建和 SSR 包体积检查。任何一步失败都先修复后再打 tag。

3. 确认 Supabase SQL 已按顺序应用。完整顺序见 `docs/supabase-migration-order.md`。基础生产环境至少需要：

   ```text
   supabase/schema.sql
   supabase/credits-update.sql
   supabase/set-signup-credits-50.sql
   supabase/atomic-credit-rpc.sql
   supabase/agent-workflows.sql
   supabase/task-queue-items.sql
   supabase/admin-console.sql
   ```

   只在需要对应功能时再应用后续专项 SQL，例如计费、积分包、运营配置、参考图工作台等。

4. 检查生产环境变量。EC2 上的文件固定在：

   ```bash
   ~/apps/wanxiangzy/shared/.env.production
   ```

   必需项包括 `NEXT_PUBLIC_APP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`LINGYA_API_KEY`、`PLATO_API_KEY`、`YUNWU_API_KEY`、`JOB_PROCESSOR_SECRET`、阿里云 OSS 与 Upstash Redis 凭据（若启用对应模块）。商品精修无开关，发布后直接可用。

5. 确认后台处理器密钥是强随机值，长度不少于 32 个字符。不要使用 `change-me`、`secret`、`password` 或示例值。

6. 确认上传和远程下载域名策略符合本次发布目标：

   ```env
   IMAGE_STORAGE_PROVIDER=aliyun-oss
   NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS=...
   DOWNLOAD_IMAGE_ALLOWED_HOSTS=...
   REMOTE_IMAGE_ALLOWED_HOSTS=...
   ```

7. 做一次人工冒烟测试。至少覆盖：

   ```text
   /create
   /product-retouch
   /history
   /pricing
   /admin
   /api/jobs/process-generations  (手动触发, 非必需)
   ```

## GitHub Secrets

GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 至少需要：

```env
AWS_HOST=
AWS_USER=ec2-user
AWS_SSH_PRIVATE_KEY=
AWS_PORT=22
AWS_APP_DIR=/home/ec2-user/apps/wanxiangzy
AWS_APP_NAME=wanxiangzy
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
LINGYA_API_KEY=
PLATO_API_KEY=
YUNWU_API_KEY=
PRODUCT_RETOUCH_RUNTIME_SKILL_ENABLED=true
```

工作流会把 GPT-Image-2 与 Yunwu 识别配置写入 EC2 的共享 `.env.production`。商品精修无开关，发布后直接可用。

## 发布

1. 从准备发布的 commit 创建 tag：

   ```bash
   git tag v1.0.0
   ```

2. 推送 tag 触发部署：

   ```bash
   git push origin v1.0.0
   ```

3. 在 GitHub Actions 中查看 `Deploy AWS on tag`。流程应该依次通过：

   ```text
   Run release checks
   Create deployment archive
   Upload deployment archive
   Update production GPT image provider env
   Deploy on EC2
   ```

4. 部署成功后，EC2 上的当前版本链接应指向本次 tag release：

   ```bash
   readlink -f ~/apps/wanxiangzy/current
   pm2 status
   ```

## 发布后验证

1. 打开线上域名，确认首页和 `/create` 可访问。
2. 登录普通用户，发起一次低风险生成或测试任务。
3. 登录后台，确认用户、任务、资产、账单、运营配置页面可加载。
4. 确认 PM2 同时拉起了 Next.js server 与 worker 进程 (默认情况下):

   ```bash
   pm2 status
   # 应显示 wanxiangzy 与 wanxiangzy-worker 两个 online 进程
   ```

5. 查看 worker 心跳与最近批次日志 (应有 `event=heartbeat` / `event=batch.complete` 行):

   ```bash
   pm2 logs wanxiangzy-worker --lines 60 --nostream
   ```

6. (可选) 手动触发一次 HTTP 任务处理器作为兜底验证 (HTTP 路由仍保留):

   ```bash
   curl -i -H "Authorization: Bearer $JOB_PROCESSOR_SECRET" \
     https://your-domain.example/api/jobs/process-generations
   ```

7. 查看 PM2 日志，确认没有启动循环或持续 5xx：

   ```bash
   pm2 logs wanxiangzy --lines 120 --nostream
   ```

## 回滚

部署脚本在新版本健康检查失败时会自动回滚：它会把 `~/apps/wanxiangzy/current` 重新指向上一版 release，并重启 PM2。

如果发布已经成功但后续需要人工回滚，优先重新部署上一个稳定 tag：

```bash
git push origin v0.9.9
```

如果必须在 EC2 上快速切回上一版，先列出保留的 release，再手动切换 `current`：

```bash
ls -lt ~/apps/wanxiangzy/releases
ln -sfn ~/apps/wanxiangzy/releases/v0.9.9 ~/apps/wanxiangzy/current
cd ~/apps/wanxiangzy/current
pm2 delete wanxiangzy || true
pm2 start npm --name wanxiangzy -- start
pm2 save
```

回滚后仍需执行发布后验证，尤其是数据库迁移已经应用但代码回退的场景。
