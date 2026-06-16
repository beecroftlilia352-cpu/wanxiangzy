# 后台管理员引导

后台入口依赖 Supabase 登录用户和 `admin_members` 表。首次上线时可以用 `ADMIN_BOOTSTRAP_EMAILS` 临时授予 owner 权限，创建正式管理员后应移除该引导环境变量。

## 初始化表结构

在 Supabase Dashboard 的 SQL Editor 中运行：

```sql
\i supabase/admin-console.sql
```

如果 Dashboard 不支持 `\i`，直接打开 `supabase/admin-console.sql`，复制全部 SQL 后执行。

## 创建第一个管理员

1. 确认目标邮箱已经注册并能登录应用。
2. 在 EC2 的 `~/apps/wanxiangzy/shared/.env.production` 中临时加入：

   ```env
   ADMIN_BOOTSTRAP_EMAILS=owner@example.com
   ```

   多个邮箱可以用逗号或空格分隔。

3. 重启应用：

   ```bash
   pm2 restart wanxiangzy
   ```

4. 使用该邮箱登录，打开 `/admin`。此时访问来源会被识别为 `bootstrap-env`，角色为 `owner`。

5. 写入正式 `admin_members` 记录。可以通过后台成员管理界面添加，也可以在 Supabase SQL Editor 中执行：

   ```sql
   INSERT INTO public.admin_members (
     user_id,
     email,
     role,
     status,
     enabled,
     display_name
   )
   SELECT
     id,
     email,
     'owner',
     'active',
     TRUE,
     COALESCE(raw_user_meta_data->>'display_name', email)
   FROM auth.users
   WHERE LOWER(email) = LOWER('owner@example.com')
   ON CONFLICT (user_id) DO UPDATE SET
     email = EXCLUDED.email,
     role = 'owner',
     status = 'active',
     enabled = TRUE,
     updated_at = NOW();
   ```

6. 移除 `ADMIN_BOOTSTRAP_EMAILS`，再次重启应用：

   ```bash
   pm2 restart wanxiangzy
   ```

7. 重新登录 `/admin`，确认仍可访问。此时权限来源应来自 `admin_members` 表。

## 角色建议

```text
owner：全权限，仅限核心负责人。
engineer：工程和供应商配置，可处理任务、资产、worker、设置。
ops：运营管理，可处理任务、资产、审核、报表和部分配置读取。
finance：积分、账单、运营审批和财务相关操作。
support：客服处理、用户查询、工单和基础风险排查。
reviewer：内容审核、资产检查和工单协作。
viewer：只读查看，用于审计、排查和临时观察。
```

具体权限定义在 `lib/admin/permissions.ts`。新增敏感后台操作前，应先给该操作分配明确 permission，再由角色表授权。

## 排查

如果访问 `/admin` 被重定向到 `/admin-forbidden`，按顺序检查：

1. 用户是否已经登录。
2. `supabase/admin-console.sql` 是否已执行，`public.admin_members` 是否存在。
3. `admin_members.email` 是否与 Supabase Auth 用户邮箱一致。
4. `admin_members.status` 是否为 `active`，`enabled` 是否为 `true`。
5. 临时引导时，`ADMIN_BOOTSTRAP_EMAILS` 是否在 EC2 生产环境文件中，重启后是否生效。
6. `SUPABASE_SERVICE_ROLE_KEY` 是否正确，服务端是否能读取 `admin_members`。

完成首个 owner 创建后，不要长期保留 `ADMIN_BOOTSTRAP_EMAILS`。长期保留会让环境变量中的邮箱绕过成员表直接获得 owner 权限。
