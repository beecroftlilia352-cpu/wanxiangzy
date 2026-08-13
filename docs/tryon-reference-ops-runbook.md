# 服装上身参考图配置运维手册

本文档面向运营、产品和后台管理员，说明 wanxiangzy 项目中「服装分类、系统参考图、参考图推荐、发布回滚」的生产操作流程。当前设计原则是：前台只展示后端发布配置，后台负责分类、场景、标签、排序、启停和版本发布。

## 1. 当前链路

用户侧链路：

1. 用户在 `/create` 上传服装图。
2. 前端调用 `POST /api/tryon/analyze-clothing` 做服装识别。
3. 后端读取或写入 `tryon_clothing_analysis_cache`，返回类目、性别、年龄、槽位等识别结果。
4. 前端调用 `POST /api/tryon/reference-recommendations`。
5. 推荐接口优先读取 `admin_config_versions` 中 `config_key = tryon.reference_config` 的 published 快照；没有快照时读取 `tryon_reference_scenes.status = active`；再没有数据时使用内置兜底场景。
6. 前端在「系统生成参考图」里展示推荐主场景和子图集，用户最多选择 8 张。
7. 生成时仍按「衣服图 + 单张参考图 + 模特图」逐张拆任务执行。

后台链路：

1. 管理员进入 `/admin/tryon`。
2. 初始化或维护服装分类。
3. 导入或手动维护系统参考图主场景和子图集。
4. 用推荐预览检查排序。
5. 校验配置。
6. 发布配置，写入 `admin_config_versions` 快照。
7. 需要回滚时从历史版本恢复，再重新发布。

## 2. 权限与环境

管理员权限依赖 `admin_members`。至少需要：

- 查看：`settings:read`
- 编辑、导入、发布、回滚：`settings:write`

管理员初始化示例：

```sql
insert into public.admin_members (user_id, email, role, status, enabled)
select id, email, 'owner', 'active', true
from auth.users
where email = 'admin@example.com'
on conflict (user_id) do update set
  role = excluded.role,
  status = 'active',
  enabled = true,
  updated_at = now();
```

生产环境变量必须具备：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

TRYON_CLOTHING_ANALYZE_BASE_URL=https://yunwu.ai
TRYON_CLOTHING_ANALYZE_API_KEY=
TRYON_CLOTHING_ANALYZE_MODEL=gpt-5-nano
TRYON_CLOTHING_ANALYZE_TIMEOUT_MS=15000

TRYON_REFERENCE_IMAGE_ALLOWED_HOSTS=vasthk.oss-cn-hongkong.aliyuncs.com
NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS=vasthk.oss-cn-hongkong.aliyuncs.com
```

说明：

- `TRYON_CLOTHING_ANALYZE_BASE_URL` 会被代码自动规范到 `/v1`，最终请求 `/chat/completions`。
- 视觉识别模型可以换成小米或云雾的 OpenAI-compatible 模型，只要支持 `chat/completions` 和 image_url 输入。
- 不要把真实 key 写进文档、截图或工单；只在部署平台和本地 `env.local` 配置。
- 如果参考图不在阿里云 OSS、Supabase 或默认允许域名内，必须把图片域名加入 `TRYON_REFERENCE_IMAGE_ALLOWED_HOSTS`。

本地检查变量是否存在：

```bash
test -n "$NEXT_PUBLIC_SUPABASE_URL" && echo "supabase url ok"
test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" && echo "anon key ok"
test -n "$SUPABASE_SERVICE_ROLE_KEY" && echo "service role ok"
test -n "$TRYON_CLOTHING_ANALYZE_API_KEY" && echo "analyze api key ok"
```

## 3. 数据库初始化

首次上线或新环境需要按顺序执行 SQL：

1. `supabase/admin-console.sql`
2. `supabase/tryon-reference-config.sql`
3. `supabase/tryon-reference-templates.sql`

可以在 Supabase SQL Editor 复制执行，也可以用 `psql`：

```bash
psql "$SUPABASE_DB_URL" -f supabase/admin-console.sql
psql "$SUPABASE_DB_URL" -f supabase/tryon-reference-config.sql
psql "$SUPABASE_DB_URL" -f supabase/tryon-reference-templates.sql
```

注意：多参考图模板表字段叫 `reference_items`，不要使用 `references`，因为 `references` 是 SQL 关键字。

初始化完成后检查：

```sql
select level, count(*)
from public.tryon_clothing_categories
group by level
order by level;

select status, count(*)
from public.tryon_reference_scenes
group by status
order by status;

select status, count(*)
from public.admin_config_versions
where config_key = 'tryon.reference_config'
group by status;
```

期望：

- `tryon_clothing_categories` 有 8 个一级类目和全部二级类目。
- 初始 `tryon_reference_scenes` 可以为空。
- 发布前 `admin_config_versions` 可以为空。

## 4. 服装分类数据

分类 code 是生产系统的稳定字段，导入和推荐都依赖它。不要随意改 code，名称、别名、启停和排序可以改。

| 一级类目 | code | 二级 code |
| --- | --- | --- |
| 外套 | `outerwear` | `loose_top`, `fitted_top`, `overcoat`, `shawl`, `down_jacket`, `fur_coat`, `suit_set` |
| 单件上衣 | `single_piece_top` | `single_loose_top`, `single_fitted_top` |
| 下身裙子 | `bottom_skirt` | `wrap_skirt`, `wrap_maxi_skirt`, `short_skirt`, `aline_skirt`, `aline_maxi_skirt` |
| 下身裤子 | `bottom_pants` | `shorts`, `long_pants`, `overalls` |
| 连衣裙 | `dress` | `wrap_short_dress`, `wrap_dress`, `aline_short_dress`, `aline_dress` |
| 内衣裤 | `underwear` | `swimsuit`, `underwear_set`, `sexy_lingerie` |
| 功能性服装 | `functional_wear` | `cape`, `raincoat`, `costume`, `ballet_skirt`, `pajamas` |
| 运动类 | `sports_wear` | `yoga_wear`, `volleyball_uniform` |

识别映射最佳实践：

- `upper garment`、背心、吊带、修身上衣：优先 `single_fitted_top`，兼容 `fitted_top`。
- 宽松 T 恤、衬衫、罩衫：`single_loose_top`。
- 长裤、牛仔裤、西裤、阔腿裤：`long_pants`。
- 半裙：按版型进入 `wrap_skirt`、`short_skirt`、`aline_skirt`。
- 连衣裙：按版型进入 `wrap_dress`、`aline_dress` 等。
- 泳衣、内衣、情趣内衣：必须保持 `is_intimate = true`，仅成人年龄段允许推荐。

## 5. 系统参考图字段规范

表：`tryon_reference_scenes`

核心字段：

- `scene_key`：唯一稳定 key，建议 `scene_外部id_短描述` 或导入自动生成。
- `external_scene_id`：外部系统主场景 id。
- `name`：后台和前台展示名称。
- `image_url`：主场景封面。
- `status`：`draft`、`active`、`archived`。
- `priority`：人工权重，越高越靠前。
- `sort_order`：稳定排序，越小越靠前。
- `cloth_categories`：绑定二级类目 code。
- `gender`：`women`、`men`、`unisex`、`all`。
- `age_ranges`：建议 `adult`、`teen`、`big_child`、`middle_child`、`small_child`、`toddler`、`all`。
- `view_tags`：视角，例如 `front_view`、`back_view`、`side_view`。
- `crop_tags`：裁切，例如 `whole_body`、`upper_body`、`lower_body`、`half_body`。
- `scene_tags`：场景，例如 `street`、`studio`、`indoor`、`outdoor`。
- `style_tags`：风格，例如 `minimal`、`commute`、`vacation`、`streetwear`。
- `lens`：镜头描述。
- `posture`：姿势描述。
- `prompt_tags`：生成提示辅助标签。
- `raw_config`：保留外部原始数据和子图集，方便追溯。

权重建议：

- 普通可用场景：`priority = 0`
- 运营精选：`priority = 10`
- 当前类目重点推荐：`priority = 30`
- 临时活动或强运营置顶：`priority = 50`

状态建议：

- 新导入先 `draft`。
- 预览和校验通过后改 `active`。
- 过期、低质、失效图片改 `archived`，不要硬删除。

## 6. 导入数据格式

后台导入接口：`POST /api/admin/tryon/reference-scenes/import`

推荐从 `/admin/tryon` 的「批量导入」面板操作，粘贴主场景和子图集文本。接口支持：

- `scenes`：标准数组。
- `rawText`：主场景原始 JSON 文本。
- `childRawText`：子图集原始 JSON 文本。
- `publish`：是否导入后直接 active。生产建议先 `false`，校验后再上架。

外部获取主场景参考参数：

```json
{
  "configKey": "SCENE",
  "pageNum": 1,
  "pageSize": 54,
  "ids": null,
  "types": [],
  "isExclusive": null,
  "typesOr": null,
  "genderTypes": ["female", "Common"],
  "bizType": "ALL",
  "positions": null,
  "bodyTypes": null,
  "text": null,
  "name": null,
  "onlyLora": true,
  "orderBy": null,
  "ageRange": "adult",
  "ageRanges": null,
  "onlyExperimental": false,
  "clothCategory": ["fitted_top", "single_fitted_top"],
  "typesOrList": [],
  "isHasShowImage": true
}
```

外部获取子图集参考参数：

```json
{
  "idList": [107237]
}
```

主场景样例：

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 107237,
        "name": "熟女-裹身裙咖啡馆街拍",
        "configKey": "SCENE",
        "status": "PROD",
        "order": 1,
        "showImage": "https://vasthk.oss-cn-hongkong.aliyuncs.com/reference-scenes/107237-cover.jpg",
        "type": ["style scene", "front view", "whole body", "Female", "adult"],
        "extInfo": {
          "showImgs": "[\"https://vasthk.oss-cn-hongkong.aliyuncs.com/reference-scenes/107237-preview-1.jpg\"]"
        }
      }
    ]
  }
}
```

子图集样例：

```json
{
  "success": true,
  "data": {
    "107237": {
      "children": [
        {
          "id": 107238,
          "parentId": 107237,
          "name": "咖啡馆正面全身",
          "order": 1,
          "showImage": "https://vasthk.oss-cn-hongkong.aliyuncs.com/reference-scenes/107237-child-1.jpg",
          "type": ["style scene", "front view", "whole body", "Female", "adult"],
          "extInfo": {
            "clothCategory": ["wrap_skirt", "single_fitted_top"],
            "lens": "front view whole body",
            "posture": "standing natural pose",
            "showImage": "https://vasthk.oss-cn-hongkong.aliyuncs.com/reference-scenes/107237-child-1.jpg"
          }
        }
      ]
    }
  }
}
```

导入结果应关注：

- `parsedCount`：解析到多少条主场景。
- `successCount`：成功 upsert 多少条。
- `errorCount`：失败数量。
- `childParentCount`：识别到多少个父场景的子图集。
- `errors`：逐条错误明细。

常见导入失败：

- `image_url 不在允许域名或 OSS 域名内`：补充 `TRYON_REFERENCE_IMAGE_ALLOWED_HOSTS` 或把图片转存 OSS。
- `active 场景至少需要绑定类目或标签`：补充 `clothCategory`、`type`、`tags` 或先导入为 draft。
- `类目不存在或未启用`：检查 `clothCategory` 是否是已启用 code。

## 7. 后台操作流程

### 7.1 初始化分类

路径：`/admin/tryon` ->「服装分类」

1. 检查分类数量。
2. 如果为空，点击初始化默认分类。
3. 确认 8 个一级类目和全部二级类目都启用。
4. 不要删除线上已绑定的 code；如果不想推荐，改为禁用。

### 7.2 导入主场景和子图集

路径：`/admin/tryon` ->「批量导入」

1. 把主场景 JSON 粘贴到主数据输入框。
2. 把子图集 JSON 粘贴到子图集输入框。
3. 首次导入建议不勾选直接发布。
4. 导入后检查 `successCount` 和 `errors`。
5. 进入「系统场景」检查封面、类目、视角、裁切和状态。

### 7.3 手动维护场景

路径：`/admin/tryon` ->「系统场景」

推荐维护规则：

- 一个主场景代表一组相似风格、姿势、镜头或环境。
- 子图集存进 `raw_config.children`，前台侧边弹框会展示这些子图。
- `cloth_categories` 尽量绑二级类目，不要只绑一级类目。
- 上衣类目优先 `front_view + upper_body/whole_body`。
- 裤子、半裙、连衣裙优先 `front_view + whole_body/lower_body`。
- 外套优先 `front_view + whole_body`。
- 内衣、泳衣、情趣内衣只绑定成人场景，并避免不适合的姿势。

### 7.4 推荐预览

路径：`/admin/tryon` ->「推荐预览」

预览参数建议：

```json
{
  "analysis": {
    "mainCategory": "single_piece_top",
    "subcategories": ["single_fitted_top", "fitted_top"],
    "clothTypeRaw": "upper garment",
    "desc": "sleeveless striped ribbed tank top",
    "genderType": "women",
    "ageRange": "adult",
    "slot": "upper",
    "fit": "fitted",
    "confidence": 0.88
  },
  "garment_audience": "women",
  "age_group": "adult"
}
```

检查点：

- `single_fitted_top` 命中的场景应排在前面。
- `matchReasons` 应能解释排序原因，例如二级类目命中、性别命中、年龄命中、镜头匹配。
- 如果全身裤装、半裙、连衣裙推荐了大量上半身图，需要补充 `crop_tags` 或调低这批图权重。

### 7.5 校验与发布

路径：`/admin/tryon` ->「总览」或「配置版本」

1. 点击校验配置。
2. 如果有 issues，先修复。
3. 校验通过后点击发布配置。
4. 发布会把当前分类和场景写成快照到 `admin_config_versions`。
5. 用户侧推荐接口最多有 60 秒服务端缓存，发布后等一分钟或刷新页面验证。

发布后检查：

```sql
select id, status, published_at, created_at
from public.admin_config_versions
where config_key = 'tryon.reference_config'
order by created_at desc
limit 5;
```

用户侧接口返回中应看到：

```json
{
  "ok": true,
  "source": "published",
  "configVersion": {
    "id": "...",
    "publishedAt": "..."
  }
}
```

### 7.6 回滚

路径：`/admin/tryon` ->「配置版本」

1. 找到要恢复的历史版本。
2. 点击回滚。
3. 回滚会把历史快照 upsert 回分类和场景表。
4. 回滚后必须再次校验并发布，用户侧才会读取新的 published 快照。

## 8. 前台验收清单

路径：`/create`

1. 上传一张服装图。
2. 页面应显示识别标签，例如「单件合身上衣 / 女装 / 成人」。
3. 「系统生成参考图」默认展示推荐卡片。
4. 点击卡片打开右侧场景抽屉。
5. 顶部有「推荐场景 / 专属场景 / 全部场景」。
6. 可以按正背面、全半身、类目、关键词筛选。
7. 点击主分类后，下方展示子图集。
8. 可多选最多 8 张参考图。
9. 用户未手动选择时，系统可自动预选 Top 1。
10. 用户手动选择或删除后，后续识别刷新不能覆盖用户选择。
11. 生成数量 = 参考图数量 x 当前数量；自动设计不乘参考图数量。

## 9. 推荐规则

后端推荐排序权重从高到低：

1. 二级类目精确命中。
2. 一级类目命中。
3. 槽位匹配：`upper`、`lower`、`single`、`outer`、`intimate`、`functional`。
4. 性别匹配：`women`、`men`、`unisex`、`all`。
5. 年龄匹配。
6. 镜头范围匹配。
7. 风格标签匹配。
8. 人工 `priority`。
9. `sort_order`。

推荐策略建议：

- 商品主图、详情页和种草图都应优先明确比例和构图，不建议把 `auto` 放第一位。
- 上衣参考图要尽量包含上半身或全身，不要大量使用下半身裁切。
- 裤子和半裙必须优先全身或下半身。
- 连衣裙、外套应优先全身正面。
- 保留原图构图、换脸等场景可以使用 `auto` 或更宽松参考。

## 10. 日常巡检 SQL

场景数量：

```sql
select status, count(*)
from public.tryon_reference_scenes
group by status
order by status;
```

按类目统计 active 场景：

```sql
select category, count(*)
from public.tryon_reference_scenes,
unnest(cloth_categories) as category
where status = 'active'
group by category
order by count(*) desc;
```

检查 active 场景是否有子图集：

```sql
select scene_key,
       name,
       jsonb_array_length(coalesce(raw_config -> 'children', '[]'::jsonb)) as child_count
from public.tryon_reference_scenes
where status = 'active'
order by child_count asc, sort_order asc
limit 50;
```

检查无类目 active 场景：

```sql
select scene_key, name, scene_tags, style_tags
from public.tryon_reference_scenes
where status = 'active'
  and coalesce(array_length(cloth_categories, 1), 0) = 0;
```

检查识别缓存最近数据：

```sql
select model,
       provider,
       main_category,
       subcategories,
       confidence,
       created_at
from public.tryon_clothing_analysis_cache
order by created_at desc
limit 20;
```

检查发布版本：

```sql
select id,
       status,
       published_at,
       created_at,
       jsonb_array_length(value -> 'categories') as category_count,
       jsonb_array_length(value -> 'scenes') as scene_count
from public.admin_config_versions
where config_key = 'tryon.reference_config'
order by created_at desc
limit 20;
```

## 11. 运维节奏

每日：

- 查看导入错误。
- 检查 active 场景图片是否可访问。
- 抽查推荐预览的 Top 10。
- 检查识别缓存是否大量 fallback。

每周：

- 按类目统计 active 场景，补齐低覆盖类目。
- 清理低质、过期、失效图片，改为 archived。
- 对转化好的参考图提高 `priority`。
- 抽查内衣、泳衣、儿童年龄段的安全过滤。

每次发布前：

```bash
npx tsc --noEmit
npm test
git diff --check
```

每次发布后：

- 登录普通用户账号打开 `/create`。
- 上传一张上衣、一张裤子、一张连衣裙做推荐验证。
- 确认推荐接口 `source = published`。
- 确认右侧弹框子图集可选，最多 8 张。
- 确认生成按钮不会在参考图上传未完成时放行。

## 12. 故障排查

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `/admin/tryon` 空白或 403 | 当前用户不是 admin，或缺少权限 | 检查 `admin_members`，确认 role/status/enabled |
| 分类为空 | SQL 未执行或初始化未点 | 执行 `tryon-reference-config.sql`，或后台初始化默认分类 |
| 导入成功但前台看不到 | 未 active、未发布、缓存未刷新 | 改 active，校验发布，等待 60 秒刷新 |
| 推荐接口返回 `fallback` | 没有 published 快照，也没有 active 场景 | 发布配置，或检查 `tryon_reference_scenes` |
| 抽屉没有子图集 | 未导入 `childRawText`，或 parentId 与主场景 id 不匹配 | 重新导入子图集，确认 `raw_config.children` |
| 图片不显示 | 图片 URL 失效、签名过期、域名未允许 | 转存 OSS，补充允许域名，重新导入 |
| 识别一直 fallback | API key、base_url、model 或超时异常 | 检查 `TRYON_CLOTHING_ANALYZE_*`，查服务端日志和缓存表 |
| 发布校验失败 | active 场景缺图、缺名、缺类目或非法域名 | 根据 issues 修复后重试 |
| 回滚后前台仍旧配置 | 回滚后没有重新发布，或缓存未过期 | 校验并发布，再等待 60 秒 |

## 13. 随文样例数据

完整样例数据另见：

- `docs/tryon-reference-sample-data.json`

这个文件包含：

- 当前完整服装分类体系。
- 外部主场景请求参数。
- 外部子图集请求参数。
- 可直接参考的主场景和子图集导入 JSON 结构。
- 服装识别和推荐预览请求样例。

