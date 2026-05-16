# 服装资产识别、抠图与选区编辑方案

## 1. 背景与目标

单件上身当前的输入主要依赖用户上传原图，再由生成模型理解服装内容。为了提升稳定性和大厂级体感，需要把“用户上传的服装图”先处理成结构化服装资产。

目标：

- 上传后自动识别用户上传的是上装、下装、裙装、外套、鞋包配饰等类型。
- 上传后自动抠图，得到透明 PNG、mask、原图三类资产。
- 前端预览使用透明底图，并在马赛克背景上展示干净主体。
- 用户可以手动编辑选区，修正抠图不准、漏选、多选的问题。
- 生成时优先使用处理后的透明图，并把服装类型同步给生成接口。
- 历史任务、套用历史配置、重新生成都要保存并恢复这份资产信息。

非目标：

- 第一版不做完整 Photoshop 式图片编辑器。
- 第一版不追求一键点选任意目标的 SAM 级交互，先用涂抹增减选区满足核心业务。
- 不依赖淘宝/天猫内部 mtop 接口作为生产能力。

## 2. 推荐整体架构

```text
用户上传服装图
  -> /api/clothing-assets
    -> 上传原图到 OSS
    -> 调用 SegmentCloth 做服饰分割
    -> 必要时调用 SegmentCommodity 兜底
    -> 可选调用视觉模型做细分类
    -> 下载云厂商临时结果 URL
    -> 转存到自己的 OSS
    -> 返回 clothing asset

用户打开编辑选区
  -> 前端 Canvas 加载 originalUrl + maskUrl
  -> 本地涂抹增加/减少选区
  -> 本地实时合成预览 cutout
  -> 完成后上传最终 mask
    -> /api/mask/apply
    -> 可选 /api/mask/refine
    -> 生成新的 cutoutUrl / maskUrl

用户点击生成
  -> /api/tryon
    -> clothing_urls 使用 cutoutUrl 优先
    -> clothing_roles 使用 asset.garmentType
    -> job_payload 保存 clothingAssets
```

## 3. API 服务选择

### 3.1 主方案：阿里云 SegmentCloth

用于服饰抠图和服饰类别识别。

适用场景：

- 人台服饰
- 真人服饰
- 纯服饰
- 虚拟人服饰
- 上衣、外套、裤装、裙装、帽子、鞋子、包包

能力：

- 返回透明 PNG。
- `ReturnForm=mask` 可返回二值 mask。
- `ReturnForm=whiteBK` 可返回白底图。
- 可返回 `ClassUrl`，用于判断服饰类别。

注意：

- 输入图片不超过 3 MB。
- 分辨率大于 50x50，小于 3000x3000。
- URL 不能包含中文字符。
- 返回结果 URL 是临时地址，文档说明约 30 分钟有效，必须下载并转存到自己的 OSS。

官方文档：

- https://help.aliyun.com/zh/viapi/developer-reference/api-clothing-segmentation

### 3.2 兜底方案：阿里云 SegmentCommodity

用于非标准服饰、包、鞋、配饰、商品主体等兜底抠图。

适用场景：

- 包包
- 鞋子
- 帽子
- 配饰
- 非服饰商品
- SegmentCloth 未识别或返回低质量时

能力：

- 返回 4 通道透明 PNG。
- `ReturnForm=mask` 返回单通道 mask。
- `ReturnForm=crop` 返回裁剪后的透明 PNG。
- `ReturnForm=whiteBK` 返回白底图。

注意：

- 输入图片不超过 3 MB。
- 分辨率小于 2000x2000。
- 返回结果 URL 是临时地址，需要转存。

官方文档：

- https://help.aliyun.com/zh/viapi/developer-reference/api-i8iw3k

### 3.3 边缘精修：阿里云 RefineMask

用于用户手动编辑后，把粗糙 mask 做边缘精修。

适用场景：

- 用户手动涂抹后边缘过硬。
- 自动抠图边缘有毛刺。
- 需要保留褶皱、裙摆、领口、袖口等复杂边界。

注意：

- 原图和 mask 必须同分辨率。
- 图片小于 3 MB。
- 分辨率大于 32x32，小于 2000x2000。
- 输出结果 URL 也是临时地址，需要转存。

官方文档：

- https://help.aliyun.com/zh/viapi/developer-reference/api-w9sg6h

### 3.4 不建议使用：InteractiveScribbleSegmentation

阿里云文档已说明该服务因业务调整停止新用户开通并下架，不适合作为新功能生产依赖。

官方文档：

- https://help.aliyun.com/zh/viapi/developer-reference/api-interactivescribblesegmentation

## 4. 服装类型映射

内部统一类型建议：

```ts
type GarmentAssetType =
  | "upper"
  | "lower"
  | "dress"
  | "coat"
  | "intimate"
  | "shoes"
  | "bag"
  | "hat"
  | "accessory"
  | "unknown";
```

阿里云 `SegmentCloth` 映射：

```text
tops  -> upper
coat  -> coat
pants -> lower
skirt -> lower 或 dress，需要视觉模型二次判断
shoes -> shoes
bag   -> bag
hat   -> hat
```

试衣模块映射：

```text
upper / coat       -> clothing_role: upper
lower              -> clothing_role: lower
dress / jumpsuit   -> clothing_role: single
intimate           -> clothing_role: single, garment_category: intimate
shoes / bag / hat  -> 不直接进入服装上身，提示用户该图像更适合商品图/配饰处理
unknown            -> 允许生成，但提示用户手动选择类型
```

建议增加视觉模型校验：

```json
{
  "garmentType": "lower",
  "label": "裤装",
  "confidence": 0.92,
  "reason": "图中主体为长裤，腰部、裤腿结构明显"
}
```

## 5. 数据模型

建议新增 `clothing_assets` 表，或者先把结构存在 `generations.job_payload` 中，后续再独立成表。

第一阶段推荐结构：

```ts
type ClothingAsset = {
  id: string;
  userId: string;
  originalUrl: string;
  cutoutUrl?: string;
  maskUrl?: string;
  whiteBgUrl?: string;
  garmentType: GarmentAssetType;
  garmentLabel: string;
  confidence: number;
  provider: "aliyun-segment-cloth" | "aliyun-segment-commodity" | "manual" | "fallback";
  width: number;
  height: number;
  bbox?: [number, number, number, number];
  status: "processing" | "ready" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

`tryon` 的历史 payload 建议扩展：

```ts
type TryOnHistoryPayload = {
  kind: "tryon";
  clothingUrls: string[];
  clothingAssets?: ClothingAssetSnapshot[];
  clothingMode?: "single" | "multi";
  clothingRoles?: string[];
  // existing fields...
};
```

快照字段不需要保存完整运行态，只保存可复现生成的关键数据：

```ts
type ClothingAssetSnapshot = {
  originalUrl: string;
  cutoutUrl?: string;
  maskUrl?: string;
  garmentType: GarmentAssetType;
  garmentLabel: string;
  confidence?: number;
  provider?: string;
};
```

## 6. 后端接口设计

### 6.1 创建服装资产

```text
POST /api/clothing-assets
```

请求：

```json
{
  "image": "data:image/jpeg;base64,...",
  "name": "pants",
  "module": "tryon"
}
```

响应：

```json
{
  "asset": {
    "id": "asset_xxx",
    "status": "ready",
    "originalUrl": "https://...",
    "cutoutUrl": "https://...",
    "maskUrl": "https://...",
    "garmentType": "lower",
    "garmentLabel": "裤装",
    "confidence": 0.92,
    "provider": "aliyun-segment-cloth",
    "width": 1024,
    "height": 1536
  }
}
```

降级响应：

```json
{
  "asset": {
    "id": "asset_xxx",
    "status": "ready",
    "originalUrl": "https://...",
    "garmentType": "unknown",
    "garmentLabel": "未识别",
    "confidence": 0,
    "provider": "fallback"
  },
  "warning": "自动抠图失败，已保留原图，可手动选择服装类型后继续生成。"
}
```

### 6.2 更新服装资产类型

```text
PATCH /api/clothing-assets/:id
```

请求：

```json
{
  "garmentType": "upper"
}
```

### 6.3 应用用户编辑后的 mask

```text
POST /api/mask/apply
```

请求：

```json
{
  "assetId": "asset_xxx",
  "originalUrl": "https://...",
  "mask": "data:image/png;base64,...",
  "refine": false
}
```

响应：

```json
{
  "maskUrl": "https://...",
  "cutoutUrl": "https://...",
  "width": 1024,
  "height": 1536
}
```

### 6.4 边缘精修

```text
POST /api/mask/refine
```

请求：

```json
{
  "assetId": "asset_xxx",
  "originalUrl": "https://...",
  "maskUrl": "https://..."
}
```

响应：

```json
{
  "refinedMaskUrl": "https://...",
  "cutoutUrl": "https://..."
}
```

## 7. 选区编辑器设计

### 7.1 前端组件

建议组件：

```text
components/studio/mask-editor/
  MaskEditorDialog.tsx
  MaskCanvas.tsx
  MaskToolbar.tsx
  MaskTipsPanel.tsx
  useMaskEditor.ts
  mask-operations.ts
  mask-renderer.worker.ts
```

核心能力：

- 原图层：展示 originalUrl。
- mask 层：半透明蓝色或红色 overlay。
- cutout 预览层：展示透明背景结果。
- brush cursor：显示当前笔刷大小。
- pan/zoom：支持拖拽、缩放、适应屏幕。
- undo/redo：撤销和重做。
- apply：导出最终 mask。

### 7.2 工具栏

第一版工具：

```text
涂抹选区
擦除选区
自动选区
增加选区
减少选区
反选选区
撤销
重做
缩小
放大
适应屏幕
完成
```

工具语义：

- 涂抹选区：白色画到 mask 上。
- 擦除选区：从 mask 上擦掉。
- 增加选区：当前画笔 strokes 作为正向修正。
- 减少选区：当前画笔 strokes 作为负向修正。
- 反选选区：对整张 mask 做 `alpha = 255 - alpha`。
- 自动选区：重新调用自动抠图，或未来接入 SAM 服务。

### 7.3 Canvas 实现方式

不用 Fabric/Konva，使用原生 Canvas 2D。

理由：

- 当前项目没有 Fabric/Konva 依赖。
- 选区编辑是像素级 mask，不是矢量排版。
- 原生 Canvas 更轻、更可控，性能更容易优化。

Canvas 层：

```text
baseCanvas      原图
maskCanvas      当前 mask
overlayCanvas   半透明选区显示
previewCanvas   透明图预览
interaction     鼠标/触控事件
```

画笔逻辑：

```ts
if (tool === "add") {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255,255,255,1)";
}

if (tool === "erase") {
  ctx.globalCompositeOperation = "destination-out";
}
```

参考：

- https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation

大图性能：

- 图像解码使用 `createImageBitmap`。
- 预览合成使用 `OffscreenCanvas` 或 Worker。
- 鼠标移动时只更新 dirty rect，不重绘全图。
- 导出最终 PNG 时再做全尺寸合成。

参考：

- https://developer.mozilla.org/docs/Web/API/OffscreenCanvas

### 7.4 坐标系统

必须明确三个坐标：

```text
screen coordinate  屏幕坐标
viewport coordinate 画布可视区坐标
image coordinate   原图像素坐标
```

所有 mask 操作最终都要落到 image coordinate。

```ts
type ViewTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function screenToImage(point, transform) {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  };
}
```

### 7.5 撤销与重做

不要每次保存整张大图。推荐保存局部 patch：

```ts
type MaskPatch = {
  rect: { x: number; y: number; width: number; height: number };
  before: ImageData;
  after: ImageData;
};
```

每一笔 stroke：

1. 计算 stroke 影响区域。
2. 保存区域绘制前的 ImageData。
3. 绘制到 maskCanvas。
4. 保存区域绘制后的 ImageData。
5. 入 undo stack。

限制：

- 最多保留 30 步。
- 单步 patch 超过阈值时压缩成 PNG blob 或只保存整图快照。

## 8. 与单件上身集成

### 8.1 上传区

上传后状态：

```text
上传中
识别中
抠图中
已识别：裤装
```

上传完成后展示：

- 使用 `cutoutUrl` 做主预览。
- 背景使用马赛克透明格。
- 右上角提供“编辑选区”按钮。
- 识别类型提供下拉手动修正。

### 8.2 生成请求

单件上身生成时：

```ts
const primaryUrl = asset.cutoutUrl || asset.originalUrl;

body = {
  clothing_urls: [primaryUrl],
  clothing_assets: [assetSnapshot],
  clothing_roles: [mapAssetTypeToRole(asset.garmentType)],
};
```

如果是配饰：

```text
提示：当前图片识别为包/鞋/帽，不适合服装上身。可继续使用原图生成，但效果可能不稳定。
```

### 8.3 历史任务

必须保存：

- originalUrl
- cutoutUrl
- maskUrl
- garmentType
- garmentLabel
- userEditedMask 标记

套用历史配置时：

- 恢复透明预览图。
- 恢复用户修正后的 garmentType。
- 重新生成时使用历史 cutoutUrl。

## 9. 降级与错误处理

自动抠图失败：

```text
保留原图，提示用户可继续生成或手动编辑选区。
```

类别识别失败：

```text
类型显示“未识别”，要求用户手动选择上装/下装/连体衣。
```

RefineMask 失败：

```text
使用用户编辑后的原始 mask 合成 cutout，不阻断完成。
```

云厂商临时 URL 下载失败：

```text
立即重试 1 次；仍失败则回退 originalUrl，并记录 provider error。
```

## 10. 安全与合规

- AccessKey 只放服务端环境变量。
- 前端不能直接调用阿里云 API。
- 用户上传图片必须先过登录态和速率限制。
- 云厂商返回的临时 URL 必须服务端下载并转存到自己的 OSS。
- 数据库只保存自己的 OSS URL，不保存外部临时 URL。
- 用户删除作品时，应同步删除 original/cutout/mask 资产。

建议环境变量：

```text
ALIBABA_CLOUD_ACCESS_KEY_ID=
ALIBABA_CLOUD_ACCESS_KEY_SECRET=
ALIYUN_VIAPI_REGION=cn-shanghai
ALIYUN_VIAPI_IMAGESEG_ENDPOINT=imageseg.cn-shanghai.aliyuncs.com
ALIYUN_VIAPI_AIGEN_ENDPOINT=aigen.cn-shanghai.aliyuncs.com
CLOTHING_ASSET_SEGMENT_TIMEOUT_MS=12000
```

## 11. 性能与体验

前端：

- 上传后立即显示原图，不等抠图完成。
- 抠图完成后平滑切换成透明 PNG。
- 编辑器打开时先展示低清预览，再加载全尺寸 mask。
- 涂抹必须 60fps 左右，不能每次 pointermove 调接口。
- 大图导出放到 Worker 或完成按钮时执行。

后端：

- 抠图超时建议 12 秒。
- 结果 URL 转存失败要有重试。
- 相同 originalUrl 可做内容 hash 缓存，避免重复扣费。
- SegmentCloth 失败再调用 SegmentCommodity，不要无脑双调用。

## 12. 分阶段实现计划

### Phase 1：上传即抠图

- 新增 `/api/clothing-assets`。
- 接入 SegmentCloth。
- 返回 originalUrl、cutoutUrl、maskUrl、garmentType。
- 前端上传区展示透明 PNG 和识别标签。
- 生成请求改用 cutoutUrl 优先。
- 历史 payload 保存 asset snapshot。

验收：

- 上传裤子后自动显示“裤装”。
- 上传上衣后自动显示“上装”。
- 透明图在马赛克背景上展示正常。
- 生成时使用透明图。
- 套用历史后仍恢复透明图和类型。

### Phase 2：选区编辑器 MVP

- 新增 `MaskEditorDialog`。
- 支持增加选区、减少选区、反选、撤销、重做、缩放、拖拽。
- 完成后调用 `/api/mask/apply` 生成新 cutout。
- 前端替换当前 asset 的 cutoutUrl/maskUrl。

验收：

- 用户能擦掉多余背景。
- 用户能补回漏掉的裙摆/袖口。
- 完成后预览图更新。
- 重新生成使用编辑后的 cutout。

### Phase 3：边缘精修

- 接入 RefineMask。
- 编辑器完成时提供“边缘优化”选项。
- RefineMask 失败不阻断保存。

验收：

- 边缘毛刺明显减少。
- 细边界比本地硬 mask 更自然。

### Phase 4：智能交互增强

- 自动选区升级为 SAM/自建交互式分割服务。
- 支持正负点、框选、涂抹提示。
- 支持局部重算 mask。

验收：

- 点选衣服局部后能自动吸附完整服装区域。
- 正负点修正比纯画笔更快。

## 13. 关键验收标准

功能：

- 上传服装图后自动识别类型。
- 上传服装图后自动生成透明 PNG。
- 用户可以手动编辑选区。
- 完成后生成结果使用编辑后的 cutout。
- 历史套用、失败重试、重新生成不丢 asset 信息。

体验：

- 上传后不空等，原图立即可见。
- 抠图中有明确状态。
- 编辑器涂抹不卡顿。
- 马赛克背景只在透明图预览时出现。
- 用户不需要理解 mask，也能完成修正。

稳定性：

- 阿里临时 URL 不入库。
- API 失败有降级。
- 速率限制和登录鉴权完整。
- 大图不会导致页面卡死。

