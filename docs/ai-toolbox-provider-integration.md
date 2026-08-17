# AI 工具箱 Provider 接入说明

## 能力分工

| 前台工具 | 公开路由 | 服务端 operation | 执行能力 |
| --- | --- | --- | --- |
| AI 抠图 | `/ai-tools/matting` | `matting` | 阿里云图像分割 |
| 图片超清 | `/ai-tools/upscale` | `upscale` | 阿里云专用超分/增强 |
| AI 扩图 | `/ai-tools/outpaint` | `outpaint` | 支持 outpainting 的生图编辑模型 |
| AI 消除 | `/ai-tools/erase` | `erase` | 支持 mask 的局部重绘模型 |
| 手脚修复 | `/ai-tools/hand-foot-repair` | `repair-limbs` | 支持 mask 的局部重绘模型 |
| 服饰修复 | `/ai-tools/clothing-repair` | `repair-garment` | 目标图、商品参考图与 mask 的局部重绘模型 |
| 鞋靴修复 | `/ai-tools/shoe-repair` | `repair-footwear` | 目标图、商品参考图与 mask 的局部重绘模型 |
| 无损改尺寸 | `/ai-tools/resize` | `resize` | Sharp/确定性图片处理，不调用生图模型 |

超清服务不能静默降级为通用生图模型，改尺寸也不能用生图结果冒充确定性缩放。修复类任务必须在 Provider 侧或结果后处理层将原图重新合成到 mask 外区域，保证未选区像素不漂移。

## 应用侧接口

- `GET /api/ai-tools/capabilities`：返回八项能力的可用状态，不暴露密钥。
- `POST /api/ai-tools`：鉴权、限流、严格校验并提交任务。
- `GET /api/ai-tools?task_id=...`：鉴权并查询异步任务状态。
- `POST /api/ai-tools/masks`：上传与规范化临时编辑蒙版，不登记到资源仓库。
- `POST /api/ai-tools/matting/compose`：使用原图、Provider mask/alpha 与编辑蒙版，在服务端合成全分辨率透明 PNG。

创建请求的统一外层结构：

```json
{
  "request_id": "matting-0-unique-id",
  "operation": "matting",
  "source_url": "https://public-oss.example/source.png",
  "mask_url": "https://public-oss.example/mask.png",
  "reference_urls": [],
  "options": {}
}
```

批量上传与“生成张数”由前端工作台编排为多个幂等任务；单个 API 请求只处理一张目标图，并在服饰/鞋靴修复时额外接受一张商品参考图。

局部修复约束与当前工具行为保持一致：

- `repair-limbs` 必须携带目标图 `mask_url`；`options.target` 为 `hands | feet | both`，旧客户端未传时服务端规范化为 `both`。
- `repair-garment` 的 `style + flat` 不接受 `reference_mask_url`；`style + model` 以及所有 `detail` 请求必须携带参考图蒙版。
- `repair-footwear` 必须同时携带目标图 `mask_url`、一张 `reference_urls` 参考图及其 `reference_mask_url`。
- `reference_mask_url` 与 `mask_url` 一样必须来自 `/api/ai-tools/masks` 签发的短期引用；服务端会分别校验它与参考图、目标图的可信尺寸，之后才交给内部 generations worker。客户端也可以随请求附带对应的 `reference_mask_ref` 证明。

例如鞋靴修复的图像字段为：

```json
{
  "source_url": "https://public-oss.example/person.png",
  "mask_url": "https://app.example/api/ai-tools/assets/mask/source-signed-ref",
  "reference_urls": ["https://public-oss.example/shoe.png"],
  "reference_mask_url": "https://app.example/api/ai-tools/assets/mask/reference-signed-ref"
}
```

## 阿里云分割 / 超清 Provider Gateway

应用通过一个窄网关隔离具体供应商 SDK。配置：

```env
AI_TOOLS_EXECUTION_MODE=live
AI_TOOLS_PROVIDER_GATEWAY_URL=https://provider-gateway.example.com/
AI_TOOLS_PROVIDER_GATEWAY_TOKEN=replace-with-secret
# 必须显式配置。未设置或空字符串都关闭全部远程 operation；
# 只开放逗号分隔列表中已经取得权限并完成验收的 operation。
AI_TOOLS_PROVIDER_OPERATIONS=matting,upscale
AI_TOOLS_PROVIDER_TIMEOUT_MS=45000
```

开发环境可显式使用 `AI_TOOLS_EXECUTION_MODE=mock`。Mock 在 production 会被拒绝，未配置 live Provider 时接口返回结构化 503，界面主按钮显示“服务待配置”。

`AI_TOOLS_PROVIDER_OPERATIONS` 只控制外部阿里云抠图/超清 Gateway，不会探测或替代 Gateway 自身的鉴权。未设置和空字符串均为 default-deny。建议按实际取得的权限逐项开放，例如只取得阿里云分割权限时设置为 `matting`；列表包含 `outpaint`、修复类、`resize` 或未知值时 Gateway 能力会 fail closed，并返回 `INVALID_CONFIGURATION`。扩图、消除、手脚/服饰/鞋靴修复不读取该列表，统一复用 `/admin/providers` 已发布的生图模型配置与现有 generations worker；`resize` 由应用本地 Sharp 执行。

所有 live 工具显示“已就绪”前还必须满足公共前置条件：

- `IMAGE_STORAGE_PROVIDER=aliyun-oss`，且 OSS AccessKey、Bucket、Region 与 HTTPS 公网地址完整；
- `NEXT_PUBLIC_SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 完整，用于 `ai_tool_tasks` 的可信归属和结果持久化；
- 已执行 `supabase/ai-tool-tasks.sql`。能力接口只能验证环境变量，迁移是否真正部署仍需发布检查确认。

`resize` 是例外：它在应用服务端直接使用 Sharp，不读取 Gateway 配置或 operation allowlist；完整配置阿里云 OSS 与 Supabase 任务持久化后即可用。画布编辑器会提交原图坐标系中的 `crop_x / crop_y / crop_width / crop_height`，服务端重新校验边界与目标比例后再用 Sharp 裁切、缩放；旧客户端仅提供 `position_x / position_y` 时仍按居中/焦点 cover 兼容。结果写入 generated OSS。

`outpaint` 携带画布拖动产生的 `position_x / position_y`（0-1）及四角等比缩放产生的 `source_scale`，表示规范化原图缩放后在目标画布剩余可移动空间中的位置。内部 generations worker 会把它们编译为生图约束；`anchor` 仅作为旧客户端兼容字段。目标画布不得小于原图的最终放置矩形，完成后服务端会按同一变换恢复原图像素。

仅 `matting` / `upscale` 向 Gateway 发送：

- `POST {gateway}/tasks`
- `GET {gateway}/tasks/{task_id}`
- `Authorization: Bearer <token>`
- 创建请求额外携带 `Idempotency-Key: <request_id>`

创建任务请求体：

```json
{
  "api_version": "v1",
  "user_id": "authenticated-user-id",
  "provider": "aliyun-segmentation",
  "capability": "segment",
  "request": {
    "request_id": "matting-0-unique-id",
    "operation": "matting",
    "source_url": "https://public-oss.example/source.png",
    "reference_urls": [],
    "options": {
      "subject": "auto",
      "background": "transparent",
      "edge_refinement": "fine",
      "output_format": "png"
    }
  }
}
```

Gateway 响应至少包含 `task_id` 与 `status`。完成态优先返回结构化 `outputs`；`result_urls` 只用于兼容旧网关：

```json
{
  "task_id": "provider-task-id",
  "request_id": "matting-0-unique-id",
  "status": "completed",
  "stage": "completed",
  "progress": 100,
  "outputs": [
    {
      "url": "https://provider.example/result.png",
      "role": "result",
      "kind": "image",
      "mime_type": "image/png",
      "dimensions": { "width": 1200, "height": 1600 }
    },
    {
      "url": "https://provider.example/alpha.png",
      "role": "alpha",
      "kind": "alpha",
      "mime_type": "image/png",
      "dimensions": { "width": 1200, "height": 1600 }
    }
  ],
  "warnings": []
}
```

`matting` 建议同时返回 `result` 与 `alpha`（或 `mask`），前端才能提供“绿色补回、红色移除”的边缘细化。应用会在 completed 边界真解码并校验声明 MIME/尺寸：`result` 转存 generated OSS，`mask/alpha/preview` 转存 temp OSS；转存失败会 fail closed，不回退短期 Provider URL。

## 抠图边缘细化

编辑器只生成黑底白色操作蒙版，浏览器不读取跨域 Provider 像素。应用通过服务端合成接口执行添加或删除：

```json
{
  "request_id": "matting-compose-unique-id",
  "source_url": "https://public-oss.example/source.png",
  "base_mask_url": "https://public-oss.example/alpha.png",
  "base_mask_kind": "alpha",
  "edit_mask_url": "https://public-oss.example/edit-mask.png",
  "edit_operation": "subtract"
}
```

`edit_operation` 支持 `add | subtract | replace`。若一次编辑同时包含补回与移除，前端顺序调用两次，并把第一次返回的 `role=alpha` URL 作为下一次 `base_mask_url`。

接受的状态别名会规范化为 `queued | processing | completed | failed`。失败响应应返回稳定的 `code`、用户可读 `error` 以及 `retryable`。

## 图片与 OSS 约束

- 输入图、参考图与 mask 必须是 Provider 可访问的公开 HTTP(S) URL；私网、localhost、带凭证的 URL 会被拒绝。
- `mask_url` 为与目标原图同尺寸的 PNG，`reference_mask_url` 为与唯一参考图同尺寸的 PNG：黑色不可修改/不选中，白色允许模型修改/作为参考区域；边缘羽化由 `mask_feather` 控制。
- Provider 临时地址不能直接成为长期结果。完成结果必须转存到项目配置的阿里云 OSS，再返回公开 OSS URL。
- 生成结果使用 `ALIYUN_OSS_GENERATED_PREFIX`；网站静态视觉资产才使用 `ALIYUN_OSS_SITE_ASSET_PREFIX`。
- 临时 mask/alpha 使用 `ALIYUN_OSS_TEMP_PREFIX`；上线前必须在 OSS 为该前缀配置生命周期自动删除规则。
- 不覆盖原图；结果要保留 `task_id`、来源 URL、operation 与参数，方便资源仓库与审计追踪。

## 取得 API 权限后的发布检查

1. 在 Gateway 中配置阿里云分割与超分凭据，并完成 operation 到具体阿里云 action 的适配。
2. 在 `/admin/providers` 发布至少一个可用生图模型；扩图与局部修复会自动进入现有 generations worker。
3. 确认 resize 走 Sharp 或同等确定性处理链路。
4. 配置上述 `AI_TOOLS_*` 环境变量，以及现有 OSS 环境变量。
5. 用真实图片验证 queued、processing、completed、failed、429、超时、部分成功与幂等重试。
6. 检查所有 result URL 已进入 generated 前缀、辅助输出已进入 temp 前缀，未选区像素对比一致。
7. 为 `ALIYUN_OSS_TEMP_PREFIX` 配置生命周期，并验证 mask/alpha 过期不影响最终结果下载。
8. 运行类型检查、定向测试和生产构建。
9. 按项目约定通过 `.github/workflows/deploy-aws-on-tag.yml` 发布到 AWS EC2。
