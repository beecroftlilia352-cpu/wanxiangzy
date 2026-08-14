import {
  DEFAULT_POSE_SERIES_STYLE,
  normalizePoseSeriesStyle,
  type PoseSeriesStyle,
} from "@/lib/module-style-presets";
import {
  POSE_VISUAL_BODY_CROP_LABELS,
  fallbackPoseVisualAnalysis,
  isPoseHeadlessCrop,
  normalizeConfidence,
  normalizePoseVisualAnalysis,
  shouldSuppressPoseFacePlanning,
  type PoseVisualAnalysis,
  type PoseVisualBodyCrop,
} from "@/lib/pose-analysis";

export type PosePlanOutputMode = "grid" | "separate";
export type PosePlanSource = "vision_plan" | "fallback" | "cache" | "history" | "user_custom";
export type PosePlanAngle = "front" | "side" | "back" | "detail" | "garment" | "seated";
export type PoseAngleCounts = Record<PosePlanAngle, number>;

export type PoseStylePolicy = {
  style: PoseSeriesStyle;
  intensity: "low" | "medium" | "high";
  cameraFreedom: "source_locked" | "clean_product" | "lookbook" | "editorial";
  motionLevel: "minimal" | "natural" | "expressive";
  productReadability: "strict" | "balanced";
  avoid: string[];
};

export type PoseSlotPlan = {
  index: number;
  angle?: PosePlanAngle;
  poseName: string;
  bodyAction: string;
  handAction: string;
  headDirection: string;
  cameraFraming: string;
  garmentVisibilityRule: string;
  avoidRules: string[];
  confidence: number;
};

export type PosePlan = {
  version: string;
  style: PoseSeriesStyle;
  outputMode: PosePlanOutputMode;
  angleCounts: PoseAngleCounts;
  slots: PoseSlotPlan[];
  edited: boolean;
};

export const POSE_PLAN_VERSION = "pose-plan-v4";
export const POSE_PLAN_MIN_COUNT = 1;
export const POSE_PLAN_MAX_COUNT = 8;
export const DEFAULT_POSE_ANGLE_COUNTS: PoseAngleCounts = {
  front: 1,
  side: 2,
  back: 0,
  detail: 1,
  garment: 0,
  seated: 0,
};
export const POSE_PLAN_ANGLE_LABELS: Record<PosePlanAngle, string> = {
  front: "正面",
  side: "侧面",
  back: "背面",
  detail: "细节",
  garment: "服饰细节",
  seated: "坐姿",
};
export const POSE_PLAN_ANGLE_DESCRIPTIONS: Record<PosePlanAngle, string> = {
  front: "正面轮廓、版型和整体穿搭",
  side: "侧身、三分之二角度和身体线条",
  back: "背面、侧后和转身角度",
  detail: "领口、袖口、衣摆、面料和轻动作",
  garment: "只拍服饰/配饰局部，画面不含头脸",
  seated: "坐姿、靠坐或屈膝坐展示",
};

export type CommercialPoseActionPreset = {
  id: string;
  angle: PosePlanAngle;
  label: string;
  bodyAction: string;
  handAction: string;
  cameraHint: string;
  matchKeywords?: string[];
};

export type CommercialPoseExpressionPreset = {
  id: string;
  label: string;
  text: string;
  angles?: PosePlanAngle[];
  matchKeywords?: string[];
};

export const COMMERCIAL_POSE_ACTION_PRESETS: Record<PosePlanAngle, CommercialPoseActionPreset[]> = {
  front: [
    {
      id: "front-natural-stand",
      angle: "front",
      label: "自然正面站姿",
      bodyAction: "正面站定，肩颈放松，重心轻微偏向一侧，完整展示正面轮廓、腰线和整体穿搭",
      handAction: "双臂自然离身，一只手轻触衣摆或口袋边缘，不遮挡核心版型",
      cameraHint: "正面商业构图，人物稳定居中，保留自然留白",
    },
    {
      id: "front-waist-hands",
      angle: "front",
      label: "双手轻扶腰",
      bodyAction: "正面站立，双手轻扶腰侧，肩线自然打开，腰线、廓形和下摆关系清楚",
      handAction: "手指自然放松贴近腰侧，肘部轻微离身，不压住衣服纹理和扣位",
      cameraHint: "近全身或七分身商业构图，突出腰线和肩线",
    },
    {
      id: "front-pocket-shift",
      angle: "front",
      label: "单手插袋重心",
      bodyAction: "正面轻微重心变化，一侧髋部自然放松，形成更有层次的站姿但不改变体态比例",
      handAction: "一只手自然插袋或贴近口袋边缘，另一只手放松垂落；没有口袋时改为轻触衣摆",
      cameraHint: "全身或近全身构图，腿部线条和衣摆不要被裁掉",
    },
    {
      id: "front-hem-adjust",
      angle: "front",
      label: "轻整理衣摆",
      bodyAction: "正面站定并小幅整理衣摆，动作克制，重点让衣摆、下装长度和面料垂坠更清楚",
      handAction: "双手或单手轻拉衣摆边缘、袖口或包袋附近，不能遮住图案和正面廓形",
      cameraHint: "略近的商业构图，保留头身比例并让手部动作清楚",
    },
    {
      id: "front-cross-weight",
      angle: "front",
      label: "交叉重心站姿",
      bodyAction: "正面展示，一脚轻微前点或腿部自然交叉，身体保持稳定，形成更修长的商业模特站姿",
      handAction: "手臂自然离身，可一手轻扶腕部或衣侧，避免双臂紧贴身体",
      cameraHint: "全身构图优先，脚部、下摆和身体比例完整",
    },
    {
      id: "front-soft-angle",
      angle: "front",
      label: "正面微侧站姿",
      bodyAction: "正面为主，身体轻微侧转，重心落在一条腿上，另一条腿自然放松，保持正面服装卖点清楚",
      handAction: "一手自然下垂，另一手轻触腰部、口袋或衣侧，动作干净不遮挡版型",
      cameraHint: "正面偏微侧商业构图，保留完整穿搭和自然头身比",
      matchKeywords: ["微侧", "微微侧转", "重心放在一条腿", "一条腿略弯", "轻触腰部"],
    },
    {
      id: "front-arm-cross-soft",
      angle: "front",
      label: "轻抱臂站姿",
      bodyAction: "正面站立，肩颈放松，双臂轻轻交叠在身体前方，呈现干练商业感但不压扁服装",
      handAction: "手臂交叠幅度克制，手掌和手指自然可见，不能遮住胸前主要图案或领口结构",
      cameraHint: "七分身或近全身构图，强调上半身轮廓和整体气质",
      matchKeywords: ["抱臂", "交叉手臂", "手臂交叠", "干练"],
    },
    {
      id: "front-bag-hold",
      angle: "front",
      label: "正面持包造型",
      bodyAction: "正面稳定站姿，身体保持自然挺拔，利用包袋或随身物形成轻微商业造型层次",
      handAction: "单手自然持包、拎包或轻触包带；没有包袋时改为轻扶衣侧或袖口",
      cameraHint: "近全身构图，包袋动作不能抢服装主体",
      matchKeywords: ["持包", "拎包", "包袋", "包带"],
    },
    {
      id: "front-open-jacket",
      angle: "front",
      label: "轻拉外套边",
      bodyAction: "正面展示，肩线打开，身体自然直立，外套或上衣前片被轻轻带开以展示层次",
      handAction: "双手或单手轻拉门襟、外套边或衣侧，不能改变服装结构和闭合方式",
      cameraHint: "七分身构图，突出层次、领口和前片线条",
      matchKeywords: ["外套", "门襟", "拉开", "前片", "衣侧"],
    },
    {
      id: "front-power-stance",
      angle: "front",
      label: "气场直立站姿",
      bodyAction: "正面站定，肩颈舒展，重心稳定居于双腿之间，整体呈现气场稳定的商业主图姿态",
      handAction: "双臂自然离身下垂，手指放松；不插袋、不交叠、不遮挡服装正面结构",
      cameraHint: "全身商业构图，下摆、腿部比例和脚部完整",
      matchKeywords: ["气场", "直立", "稳定", "power", "stance"],
    },
    {
      id: "front-chin-rest",
      angle: "front",
      label: "手托下巴",
      bodyAction: "正面站定或七分身构图，一只手轻触下颌或脸颊位置，下巴微收，整体呈现高冷大片感",
      handAction: "单手轻托下颌或靠近脸颊，手指放松不压脸；另一只手自然垂落或贴近腰侧",
      cameraHint: "近上半身构图，突出表情和手部动作，服装正面仍清楚",
      matchKeywords: ["托下巴", "手部", "chin", "rest"],
    },
    {
      id: "front-shoulder-lean",
      angle: "front",
      label: "肩部依靠",
      bodyAction: "正面为主，一侧肩膀和上臂自然向后微靠，呈现街拍或大片感的稳定倚靠姿态",
      handAction: "靠后侧手臂自然贴近身体，前侧手可轻触腰侧、衣摆或包袋；动作克制",
      cameraHint: "近全身商业构图，肩线和身体比例清楚",
      matchKeywords: ["依靠", "肩部", "靠墙", "lean", "shoulder"],
    },
    {
      id: "front-walking",
      angle: "front",
      label: "行走姿态",
      bodyAction: "正面自然行走瞬间，双腿前后错落、重心轻移，衣摆和裤腿随步伐出现自然摆动，整体舒展不僵硬",
      handAction: "双臂随步伐自然摆动，幅度克制；可以单手提包或轻持配饰，不遮挡正面廓形",
      cameraHint: "全身商业构图，留出脚下和前进方向空间，抓拍感但不模糊",
      matchKeywords: ["行走", "走姿", "步伐", "walking", "stride"],
    },
  ],
  side: [
    {
      id: "side-three-quarter",
      angle: "side",
      label: "三分之二侧身",
      bodyAction: "身体转为三分之二侧身，头颈、肩膀和躯干方向协调，侧面轮廓、肩线和腰胯关系清楚",
      handAction: "一只手自然靠近腰侧，另一只手放松垂落，手臂不要压住服装侧缝",
      cameraHint: "侧前方商业构图，突出侧面厚度和身体线条",
    },
    {
      id: "side-collar-adjust",
      angle: "side",
      label: "侧身整理领口",
      bodyAction: "三分之二侧身站立，上半身微微转向镜头，领口、肩线和袖型保持清楚",
      handAction: "一只手轻整理领口、肩带或袖口，另一只手保持自然垂落",
      cameraHint: "略近的七分身或半身构图，领口和肩线清晰",
    },
    {
      id: "side-waist-line",
      angle: "side",
      label: "侧身扶腰线",
      bodyAction: "侧身站定，腰胯轻微错开，突出侧面腰线、衣身厚度和下摆垂坠",
      handAction: "靠镜头一侧手轻扶腰线或衣侧，另一只手自然放松",
      cameraHint: "近全身商业构图，保持真实透视和稳定头身比",
    },
    {
      id: "side-soft-step",
      angle: "side",
      label: "侧身轻迈步",
      bodyAction: "侧身小幅迈步或停步瞬间，身体方向和腿部动作一致，表现自然动态但不夸张",
      handAction: "手臂随步态自然摆动，可轻带衣摆形成可信褶皱",
      cameraHint: "允许方向性留白，运动感克制，服装仍然清楚",
    },
    {
      id: "side-sleeve-detail",
      angle: "side",
      label: "侧身整理袖口",
      bodyAction: "侧身或斜侧身站立，手臂抬起幅度小，突出袖口、袖型、侧缝和面料层次",
      handAction: "一只手轻整理袖口或手腕附近，另一只手保持松弛",
      cameraHint: "半身到七分身构图，动作细节清楚且不遮挡衣身",
    },
    {
      id: "side-look-back-soft",
      angle: "side",
      label: "侧身轻回望",
      bodyAction: "身体保持侧身或侧后方向，头部只做轻微自然回望，肩颈不过度扭转，侧面轮廓保持清楚",
      handAction: "手臂自然垂落或轻触衣侧，避免遮住背侧结构",
      cameraHint: "侧后到侧前之间的商业构图，回望幅度克制",
      matchKeywords: ["回望", "回头", "侧后", "侧脸"],
    },
    {
      id: "side-pocket-profile",
      angle: "side",
      label: "侧身插袋轮廓",
      bodyAction: "侧身站立，一侧腿部自然前后错开，突出腰胯、侧缝和服装厚度",
      handAction: "靠镜头一侧手自然插袋或贴近口袋边缘，另一只手放松",
      cameraHint: "全身或近全身侧面构图，腿部和衣摆完整",
      matchKeywords: ["插袋", "侧缝", "侧面轮廓", "腰胯"],
    },
    {
      id: "side-cross-step",
      angle: "side",
      label: "侧身交叉步",
      bodyAction: "侧身轻交叉步停住，腿部线条自然拉开，动作有连续感但不是走路抓拍",
      handAction: "手臂随身体自然摆放，可轻带衣摆形成真实褶皱",
      cameraHint: "全身构图优先，保留脚部和下摆动态",
      matchKeywords: ["交叉步", "停步", "腿部线条", "动态"],
    },
    {
      id: "side-lean-forward",
      angle: "side",
      label: "前倾凝视",
      bodyAction: "三分之二侧身并轻微向镜头前倾，肩线略压，呈现大片凝视感而不是弯腰",
      handAction: "双手可轻搭大腿前侧或自然垂落；不抱臂、不插袋",
      cameraHint: "近全身偏七分身构图，突出肩线和前倾姿态",
      matchKeywords: ["前倾", "凝视", "lean", "forward"],
    },
    {
      id: "side-arch-back",
      angle: "side",
      label: "侧身拱背",
      bodyAction: "侧身或三分之二侧身，肩部和上背轻微向后拱起，下巴微收，整体呈现大片张力",
      handAction: "一手轻扶后腰或自然后置，另一手放松垂落；动作干净",
      cameraHint: "近全身构图，强调肩背弧线和腰线",
      matchKeywords: ["拱背", "侧身", "arch", "editorial"],
    },
  ],
  back: [
    {
      id: "back-clean-stand",
      angle: "back",
      label: "背面稳定展示",
      bodyAction: "背面站定或轻微侧后站姿，优先展示肩背线条、后片结构、下摆和面料垂坠，不强行露出正脸",
      handAction: "双臂自然放松或轻离身体，避免遮住背部结构和后片细节",
      cameraHint: "背面或侧后商业构图，保持真实透视和稳定头身比",
    },
    {
      id: "back-soft-turn",
      angle: "back",
      label: "侧后自然转身",
      bodyAction: "身体处于侧后转身瞬间，肩背和腰线形成层次，背部、侧缝和下摆可见",
      handAction: "手臂随转身自然摆放，可轻带衣摆但不挡住背面关键结构",
      cameraHint: "侧后角度，保留背面信息，不做夸张回眸",
    },
    {
      id: "back-hem-touch",
      angle: "back",
      label: "背面轻扶衣摆",
      bodyAction: "背面或侧后站姿，一只手轻扶衣摆或后腰附近，突出后片垂坠、裙摆/裤管后缘和面料厚度",
      handAction: "手部只做轻触辅助，不能遮挡拉链、后袋、腰头或背部线条",
      cameraHint: "近全身构图，背后结构清楚，避免凭空新增装饰",
    },
    {
      id: "back-shoulder-profile",
      angle: "back",
      label: "肩背侧轮廓",
      bodyAction: "侧后站定，肩部和躯干轻微错开，重点展示肩背轮廓、袖型厚度和侧后身体线条",
      handAction: "靠镜头一侧手臂自然离身，另一只手放松，不压住袖型和侧缝",
      cameraHint: "侧后七分身构图，脸部只作为侧轮廓出现或不出现",
    },
    {
      id: "back-walking-away",
      angle: "back",
      label: "背面轻迈步",
      bodyAction: "背面或侧后轻迈步，身体方向自然向前，重点展示后片、肩背、裙摆/裤管后缘和真实垂坠",
      handAction: "手臂随步态自然摆动，不遮挡后腰、后袋或背部结构",
      cameraHint: "背面全身或近全身构图，脚步动态稳定",
      matchKeywords: ["背面迈步", "向前", "走开", "背影"],
    },
    {
      id: "back-hair-shoulder",
      angle: "back",
      label: "背面肩颈整理",
      bodyAction: "背面或侧后站姿，肩颈保持自然，突出后领、肩背线和袖型厚度",
      handAction: "一只手可轻整理后领、头发或肩部附近，但不能遮挡后片结构",
      cameraHint: "偏半身到七分身构图，后领和肩背清楚",
      matchKeywords: ["后领", "肩颈", "整理头发", "肩背"],
    },
    {
      id: "back-arms-crossed",
      angle: "back",
      label: "背面抱臂",
      bodyAction: "背面或侧后站姿，肩线保持打开，呈现稳定干练的商业大片背影",
      handAction: "双臂在身前或身前偏下自然交叠，幅度克制，不挤压衣身结构",
      cameraHint: "背面七分身构图，肩背、袖型和后片清楚",
      matchKeywords: ["抱臂", "交叉", "背影", "arms crossed"],
    },
    {
      id: "back-over-shoulder-soft",
      angle: "back",
      label: "克制侧头",
      bodyAction: "背面为主，头颈轻微向一侧倾斜，不做夸张回眸；保留侧脸轮廓或后脑轮廓",
      handAction: "手臂自然垂落或轻带包袋；不刻意举手、不摸脸",
      cameraHint: "背面近全身构图，肩颈和侧脸轮廓清楚",
      matchKeywords: ["侧头", "克次回眸", "over-shoulder", "克制"],
    },
  ],
  detail: [
    {
      id: "detail-collar-shoulder",
      angle: "detail",
      label: "领口肩线近景",
      bodyAction: "偏半身或七分身近景，重点展示领口、肩线、胸前图案和上半身面料层次",
      handAction: "一只手轻整理领口或肩线附近，动作小，不能遮挡主要图案",
      cameraHint: "略近商业构图，保留人物比例，不变成无关大头照",
    },
    {
      id: "detail-sleeve-cuff",
      angle: "detail",
      label: "袖口手部近景",
      bodyAction: "上半身或七分身细节构图，突出袖型、袖口、手腕附近结构和面料纹理",
      handAction: "一只手轻整理袖口，另一只手自然辅助，手指结构要自然",
      cameraHint: "半身到七分身构图，手部和袖口清楚",
    },
    {
      id: "detail-waist-hem",
      angle: "detail",
      label: "腰线衣摆近景",
      bodyAction: "七分身或近全身细节构图，重点展示腰线、衣摆、下装衔接和面料垂坠",
      handAction: "手部轻触腰线、衣摆或包袋边缘，不遮挡扣位、图案和下摆形状",
      cameraHint: "略近但不裁掉关键服装结构，保持商业主图质感",
    },
    {
      id: "detail-fabric-drape",
      angle: "detail",
      label: "面料垂坠动作",
      bodyAction: "自然站定并产生小幅褶皱变化，突出面料厚度、垂坠、纹理和边缘细节",
      handAction: "手部轻带衣侧或衣摆，让褶皱自然出现，不制造夸张变形",
      cameraHint: "七分身或偏半身构图，材质细节清楚",
    },
    {
      id: "detail-button-zipper",
      angle: "detail",
      label: "扣位拉链近景",
      bodyAction: "偏半身或局部近景，重点展示扣位、拉链、门襟、口袋和结构线",
      handAction: "手部轻靠近扣位或拉链边缘，只做指示式动作，不改变闭合状态",
      cameraHint: "近景商业构图，细节清楚但不裁成无人物产品图",
      matchKeywords: ["扣位", "拉链", "门襟", "口袋"],
    },
    {
      id: "detail-pocket-seam",
      angle: "detail",
      label: "口袋侧缝近景",
      bodyAction: "七分身或局部近景，突出侧缝、口袋、腰头、拼接线和面料厚度",
      handAction: "一只手自然靠近口袋或侧缝，不能遮住关键结构",
      cameraHint: "偏近商业构图，保留服装上下文",
      matchKeywords: ["口袋", "侧缝", "腰头", "拼接线"],
    },
    {
      id: "detail-hem-motion",
      angle: "detail",
      label: "下摆动态近景",
      bodyAction: "近全身或七分身细节画面，利用轻微转身或停步突出下摆、裙摆/裤脚和面料运动褶皱",
      handAction: "手部可轻带下摆边缘，动作幅度小，褶皱必须自然",
      cameraHint: "略近构图，保留下摆完整形状",
      matchKeywords: ["下摆", "裙摆", "裤脚", "动态褶皱"],
    },
    {
      id: "detail-fabric-texture",
      angle: "detail",
      label: "面料质感近景",
      bodyAction: "近景构图，肩部、手臂或腿部局部，突出面料的纹理、织法、纹路和光照下的真实质感",
      handAction: "手部远离取景区域或轻搭衣身，不能挡住面料纹理关键位置",
      cameraHint: "极近商业构图，保留服装上下文一段",
      matchKeywords: ["面料", "质感", "纹理", "织法", "texture"],
    },
  ],
  garment: [
    {
      id: "garment-collar",
      angle: "garment",
      label: "领口细节特写",
      bodyAction: "只拍领口到肩部上方区域，头脸完全不入画，展示领型、肩线、缝线和面料层次",
      handAction: "手指轻触领口边缘或自然靠近锁骨下方，指示细节但不遮挡领型",
      cameraHint: "无头局部特写构图，画面从颈部以下开始，不出现人脸",
      matchKeywords: ["领口", "领型", "肩线", "collar", "neckline"],
    },
    {
      id: "garment-accessory",
      angle: "garment",
      label: "配饰特写",
      bodyAction: "只拍腰带、包袋、鞋履或配饰所在区域，头脸不入画，突出配饰质感与服装搭配关系",
      handAction: "手部轻持或靠近配饰做指示动作，不遮挡配饰主体结构",
      cameraHint: "无头局部特写，画面聚焦配饰与相邻服装区域",
      matchKeywords: ["配饰", "腰带", "包袋", "鞋履", "accessory", "belt", "bag"],
    },
    {
      id: "garment-hem",
      angle: "garment",
      label: "下摆/袖口特写",
      bodyAction: "只拍衣摆、裤脚、裙摆或袖口区域，头脸不入画，展示下摆形状、面料垂坠和边缘工艺",
      handAction: "手指轻带下摆或袖口边缘，让褶皱与垂坠自然呈现",
      cameraHint: "无头局部特写，画面保持下半部分服装结构完整",
      matchKeywords: ["下摆", "袖口", "裤脚", "裙摆", "hem", "cuff"],
    },
  ],
  seated: [
    {
      id: "seated-forward",
      angle: "seated",
      label: "正坐直背",
      bodyAction: "坐姿正面展示，背部自然挺直，双腿并拢或自然放置，坐姿下腰线、裤装/裙摆和上衣下摆关系清楚",
      handAction: "双手自然搭在腿上或轻放膝盖上方，不遮挡腰部结构",
      cameraHint: "坐姿全身或近全身商业构图，椅凳不抢镜，脚部尽量完整",
      matchKeywords: ["正坐", "直背", "端坐", "sitting", "seated"],
    },
    {
      id: "seated-cross",
      angle: "seated",
      label: "叠腿坐姿",
      bodyAction: "坐姿跷腿或叠腿，身体轻微侧转，展示坐姿下的裤装垂坠、裙摆层次和鞋履搭配",
      handAction: "一只手轻搭膝盖或扶椅面，另一只手自然垂放，动作克制",
      cameraHint: "坐姿七分身或近全身构图，腿部叠放关系清楚",
      matchKeywords: ["叠腿", "跷腿", "cross", "legs"],
    },
    {
      id: "seated-lean",
      angle: "seated",
      label: "靠坐放松",
      bodyAction: "靠坐椅背或沙发，肩颈放松，身体轻微后倾，展示休闲场景下服装的松弛廓形和垂坠感",
      handAction: "双手自然搭放于扶手、腿上或轻扶一侧，姿态放松不垮塌",
      cameraHint: "坐姿商业构图，保留椅背或沙发的环境线索，人物比例清楚",
      matchKeywords: ["靠坐", "沙发", "放松", "lean", "sofa"],
    },
  ],
};

export const COMMERCIAL_POSE_EXPRESSION_PRESETS: CommercialPoseExpressionPreset[] = [
  {
    id: "cool-editorial",
    label: "高冷大片感",
    text: "Cool editorial expression, no smile, lips closed and relaxed, sharp jaw, gaze steady at camera or slightly off-camera, high-fashion commercial mood",
    angles: ["front", "side", "detail"],
    matchKeywords: ["高冷", "冷酷", "冷静", "cool", "editorial", "fashion"],
  },
  {
    id: "editorial-fierce",
    label: "锐利冷峻",
    text: "Fierce editorial expression, no smile, slight jaw tension, intense focused gaze, runway-style poise, eyes locked forward",
    angles: ["front", "side", "detail"],
    matchKeywords: ["锐利", "冷峻", "fierce", "runway"],
  },
  {
    id: "serene-editorial",
    label: "沉静大片",
    text: "Serene editorial expression, neutral lips, eyes slightly downcast or sideways, calm composed look, no smile",
    angles: ["front", "side", "detail"],
    matchKeywords: ["沉静", "深邃", "serene", "calm"],
  },
  {
    id: "chin-up-confident",
    label: "轻抬下巴",
    text: "Slight chin-up confident expression, no smile, gaze slightly downward at camera, model poise, jaw defined",
    angles: ["front", "side", "detail"],
    matchKeywords: ["轻抬", "下巴", "自信", "chin", "confident"],
  },
  {
    id: "side-gaze-cool",
    label: "侧视冷峻",
    text: "Cool off-camera gaze, head slightly turned, no smile, calm composed profile expression, eyes directed off-frame",
    angles: ["side", "front"],
    matchKeywords: ["侧视", "冷峻", "off-camera", "profile"],
  },
  {
    id: "calm-premium",
    label: "平静高级感",
    text: "Calm composed expression, neutral lips, soft focused gaze, premium commercial mood, no exaggerated smile",
    angles: ["front", "side", "detail"],
    matchKeywords: ["平静", "高级", "calm", "premium"],
  },
  {
    id: "soft-confident",
    label: "自信轻抬眼",
    text: "Confident relaxed expression, no smile, slight eyebrow lift, gaze steady, clean model look",
    angles: ["front", "side", "detail"],
    matchKeywords: ["自信", "抬眼", "confident"],
  },
  {
    id: "natural-camera",
    label: "自然看镜头",
    text: "Natural look at camera, lips closed and relaxed, neutral expression, soft focused gaze",
    angles: ["front", "detail"],
    matchKeywords: ["自然", "看镜头", "neutral"],
  },
  {
    id: "side-gaze",
    label: "自然侧视",
    text: "Natural off-camera gaze, head follows body direction, relaxed expression, no smile",
    angles: ["side", "front"],
    matchKeywords: ["侧视", "侧向", "off-camera"],
  },
  {
    id: "down-soft",
    label: "自然垂眸",
    text: "Eyes softly downcast or looking toward hand action, relaxed expression, no forced smile",
    angles: ["front", "side", "detail"],
    matchKeywords: ["垂眸", "down", "低头"],
  },
  {
    id: "soft-smile",
    label: "轻微微笑",
    text: "Soft subtle smile, eyes bright and stable, clean approachable commercial mood, slight lip corner lift",
    angles: ["front", "side", "detail"],
    matchKeywords: ["微笑", "亲和", "smile"],
  },
  {
    id: "warm-commercial",
    label: "亲和商业感",
    text: "Warm approachable expression, gentle lip lift, steady gaze, e-commerce main image mood",
    angles: ["front", "detail"],
    matchKeywords: ["亲和", "商业", "warm"],
  },
  {
    id: "detail-down-gaze",
    label: "看向细节",
    text: "Gaze naturally falls toward hand or garment detail, focused expression, no forced smile",
    angles: ["detail", "side"],
    matchKeywords: ["细节", "detail", "gaze"],
  },
  {
    id: "back-profile",
    label: "侧后轮廓",
    text: "Head follows body turn, keep only side profile or no face visible, no exaggerated over-shoulder glance",
    angles: ["back"],
    matchKeywords: ["侧后", "profile"],
  },
  {
    id: "back-away",
    label: "背面不露脸",
    text: "Head and neck follow back direction, no looking at camera, focus on shoulder back and rear garment structure",
    angles: ["back"],
    matchKeywords: ["背面", "不露脸", "back"],
  },
];

export function getCommercialPoseActionPresets(angle?: PosePlanAngle) {
  return COMMERCIAL_POSE_ACTION_PRESETS[angle || "front"];
}

export function getCommercialPoseExpressionPresets(angle?: PosePlanAngle, suppressFacePlanning = false) {
  if (suppressFacePlanning) return [];
  const safeAngle = angle || "front";
  // 服饰细节不露脸，不提供任何表情/视线选项
  if (safeAngle === "garment") return [];
  const options = COMMERCIAL_POSE_EXPRESSION_PRESETS.filter((preset) => !preset.angles || preset.angles.includes(safeAngle));
  return options.length ? options : COMMERCIAL_POSE_EXPRESSION_PRESETS.filter((preset) => !preset.angles || preset.angles.includes("front"));
}

export type PosePlanContext = {
  poseAnalysis?: PoseVisualAnalysis | null;
  poseStyle?: PoseSeriesStyle;
  outputMode?: PosePlanOutputMode;
  prompt?: string;
  poseCount?: number;
  angleCounts?: Partial<Record<PosePlanAngle, unknown>> | null;
};

export function normalizePosePlanCount(value: unknown, fallback = 4) {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num)) return clamp(Math.floor(Number(fallback) || 4), POSE_PLAN_MIN_COUNT, POSE_PLAN_MAX_COUNT);
  return clamp(Math.floor(num), POSE_PLAN_MIN_COUNT, POSE_PLAN_MAX_COUNT);
}

export function getPoseAngleTotal(counts: Partial<Record<PosePlanAngle, unknown>> | null | undefined) {
  const normalized = normalizePoseAngleCounts(counts);
  return (Object.keys(POSE_PLAN_ANGLE_LABELS) as PosePlanAngle[])
    .reduce((sum, key) => sum + normalized[key], 0);
}

export function buildDefaultPoseAngleCounts(count = 4): PoseAngleCounts {
  const safeCount = normalizePosePlanCount(count);
  const counts: PoseAngleCounts = { front: 0, side: 0, back: 0, detail: 0, garment: 0, seated: 0 };
  const sequence: PosePlanAngle[] = ["front", "side", "side", "detail", "back", "front", "side", "back"];
  sequence.slice(0, safeCount).forEach((angle) => {
    counts[angle] += 1;
  });
  return counts;
}

export function normalizePoseAngleCounts(
  input?: Partial<Record<PosePlanAngle, unknown>> | null,
  fallback: PoseAngleCounts = DEFAULT_POSE_ANGLE_COUNTS
): PoseAngleCounts {
  const keys = Object.keys(POSE_PLAN_ANGLE_LABELS) as PosePlanAngle[];
  const counts = keys.reduce((next, key) => {
    const raw = input && Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback[key];
    const num = Number(raw);
    next[key] = Number.isFinite(num) ? clamp(Math.floor(num), 0, POSE_PLAN_MAX_COUNT) : 0;
    return next;
  }, { front: 0, side: 0, back: 0, detail: 0, garment: 0, seated: 0 } as PoseAngleCounts);

  let total = keys.reduce((sum, key) => sum + counts[key], 0);
  if (total < POSE_PLAN_MIN_COUNT) return { ...DEFAULT_POSE_ANGLE_COUNTS };
  while (total > POSE_PLAN_MAX_COUNT) {
    const maxKey = keys.reduce((largest, key) => counts[key] > counts[largest] ? key : largest, keys[0]);
    counts[maxKey] -= 1;
    total -= 1;
  }
  return counts;
}

export function buildPoseAngleSequence(counts: Partial<Record<PosePlanAngle, unknown>> | null | undefined) {
  const normalized = normalizePoseAngleCounts(counts);
  const remaining = { ...normalized };
  const sequence: PosePlanAngle[] = [];
  const preferredOrder: PosePlanAngle[] = ["front", "side", "back", "detail", "garment", "seated", "side", "front", "detail", "garment", "back", "seated"];
  while (sequence.length < POSE_PLAN_MAX_COUNT && Object.values(remaining).some((count) => count > 0)) {
    let progressed = false;
    for (const angle of preferredOrder) {
      if (remaining[angle] <= 0) continue;
      sequence.push(angle);
      remaining[angle] -= 1;
      progressed = true;
      if (sequence.length >= POSE_PLAN_MAX_COUNT) break;
    }
    if (!progressed) break;
  }
  return sequence;
}

export function getPoseStylePolicy(value: unknown): PoseStylePolicy {
  const style = normalizePoseSeriesStyle(value);
  if (style === "luxury_white_studio" || style === "ecommerce_clean") {
    return {
      style,
      intensity: "low",
      cameraFreedom: "clean_product",
      motionLevel: "minimal",
      productReadability: "strict",
      avoid: ["dramatic posing", "complex props", "unreadable outfit", "extreme crop"],
    };
  }
  if (style === "source_continuity") {
    return {
      style,
      intensity: "low",
      cameraFreedom: "source_locked",
      motionLevel: "minimal",
      productReadability: "strict",
      avoid: ["new scene", "over-stylized atmosphere", "large motion", "unreadable outfit"],
    };
  }
  if (style === "fashion_editorial" || style === "euro_campaign") {
    return {
      style,
      intensity: "high",
      cameraFreedom: "editorial",
      motionLevel: "expressive",
      productReadability: "balanced",
      avoid: ["unreadable clothing", "extreme body angle", "excessive motion blur", "identity drift"],
    };
  }
  if (style === "luxury_lookbook" || style === "korean_clean" || style === "xiaohongshu_lifestyle") {
    return {
      style,
      intensity: "medium",
      cameraFreedom: "lookbook",
      motionLevel: "natural",
      productReadability: "balanced",
      avoid: ["over-posing", "heavy retouching", "unreadable outfit", "identity drift"],
    };
  }
  return {
    style,
    intensity: "medium",
    cameraFreedom: "lookbook",
    motionLevel: "natural",
    productReadability: "balanced",
    avoid: ["unreadable outfit", "identity drift", "body proportion drift"],
  };
}

export function normalizePosePlan(input: unknown, context: PosePlanContext = {}): PosePlan {
  const fallback = buildFallbackPosePlan(context);
  const record = Array.isArray(input) ? { slots: input } : toRecord(input);
  if (!record) return fallback;
  const rawSlots = Array.isArray(record.slots)
    ? record.slots
    : Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.poses)
        ? record.poses
        : Array.isArray(record.poseSlots)
          ? record.poseSlots
          : Array.isArray(record["姿势列表"])
            ? record["姿势列表"]
      : [];
  const explicitCount = readNumber(record, "poseCount", "pose_count", "targetCount", "target_count");
  const inferredSlotCount = rawSlots.length ? Math.max(rawSlots.length, fallback.slots.length) : fallback.slots.length;
  const targetCount = normalizePosePlanCount(explicitCount || context.poseCount || inferredSlotCount, fallback.slots.length);
  const angleCounts = normalizePoseAngleCounts(
    readAngleCounts(record) || context.angleCounts,
    context.angleCounts ? normalizePoseAngleCounts(context.angleCounts) : buildDefaultPoseAngleCounts(targetCount)
  );
  const fallbackForCount = fallback.slots.length === targetCount
    ? fallback
    : buildFallbackPosePlan({ ...context, poseCount: targetCount, angleCounts });
  const analysis = normalizePoseVisualAnalysis(context.poseAnalysis);
  const slots = Array.from({ length: targetCount }, (_, slotIndex) => sanitizePoseSlotForVisibility(
    normalizePoseSlotPlan(rawSlots[slotIndex], fallbackForCount.slots[slotIndex], slotIndex + 1),
    analysis
  ));
  const style = normalizePoseSeriesStyle(readString(record, "style", "poseStyle", "pose_style") || context.poseStyle || fallback.style);
  const outputMode = normalizeOutputMode(readString(record, "outputMode", "output_mode") || context.outputMode || fallback.outputMode);

  return {
    version: readString(record, "version") || POSE_PLAN_VERSION,
    style,
    outputMode,
    angleCounts: derivePoseAngleCounts(slots, angleCounts),
    slots,
    edited: readBoolean(record, "edited") ?? fallback.edited,
  };
}

export function buildFallbackPosePlan(context: PosePlanContext = {}): PosePlan {
  const style = normalizePoseSeriesStyle(context.poseStyle || DEFAULT_POSE_SERIES_STYLE);
  const outputMode = normalizeOutputMode(context.outputMode);
  const analysis = normalizePoseVisualAnalysis(context.poseAnalysis) || fallbackPoseVisualAnalysis();
  const policy = getPoseStylePolicy(style);
  const defaultCounts = context.poseCount ? buildDefaultPoseAngleCounts(context.poseCount) : DEFAULT_POSE_ANGLE_COUNTS;
  const angleCounts = normalizePoseAngleCounts(context.angleCounts, defaultCounts);
  const slots = buildFallbackSlots(analysis, policy, buildPoseAngleSequence(angleCounts));

  return {
    version: POSE_PLAN_VERSION,
    style,
    outputMode,
    angleCounts: derivePoseAngleCounts(slots, angleCounts),
    slots,
    edited: false,
  };
}

export function buildUserCustomPosePlan(input: PosePlanContext & {
  customPosePrompt?: string;
  customCamera?: string;
  customPoses?: string[];
}): PosePlan {
  const fallback = buildFallbackPosePlan({ ...input, poseStyle: "user_custom" });
  const customPoses = Array.isArray(input.customPoses) ? input.customPoses : [];
  const customCamera = clampText(input.customCamera || "", 180);
  const slots = fallback.slots.map((slot, index) => {
    const text = clampText(customPoses[index] || slot.bodyAction, 260);
    return {
      ...slot,
      poseName: `自定义姿势 ${index + 1}`,
      bodyAction: text,
      handAction: "",
      headDirection: "",
      cameraFraming: customCamera || slot.cameraFraming,
      confidence: 1,
    };
  });
  return {
    ...fallback,
    style: "user_custom",
    angleCounts: derivePoseAngleCounts(slots, fallback.angleCounts),
    slots,
    edited: true,
  };
}

export function buildPosePlanCacheKey(input: {
  mainImageUrl?: string | null;
  poseAnalysis?: PoseVisualAnalysis | null;
  poseStyle?: PoseSeriesStyle;
  outputMode?: PosePlanOutputMode;
  prompt?: string;
  poseCount?: number;
  angleCounts?: Partial<Record<PosePlanAngle, unknown>> | null;
}) {
  const analysis = normalizePoseVisualAnalysis(input.poseAnalysis);
  const angleCounts = normalizePoseAngleCounts(
    input.angleCounts,
    input.poseCount ? buildDefaultPoseAngleCounts(input.poseCount) : DEFAULT_POSE_ANGLE_COUNTS
  );
  return JSON.stringify({
    version: POSE_PLAN_VERSION,
    mainImageUrl: normalizeAnalysisUrl(input.mainImageUrl || ""),
    poseStyle: normalizePoseSeriesStyle(input.poseStyle),
    outputMode: normalizeOutputMode(input.outputMode),
    poseCount: normalizePosePlanCount(input.poseCount || getPoseAngleTotal(angleCounts), getPoseAngleTotal(angleCounts)),
    angleCounts,
    prompt: clampText(input.prompt || "", 500),
    analysis: analysis ? {
      genderExpression: analysis.genderExpression,
      ageRange: analysis.ageRange,
      bodyCrop: analysis.bodyCrop,
      headVisible: analysis.headVisible,
      faceVisible: analysis.faceVisible,
      upperTorsoVisible: analysis.upperTorsoVisible,
      lowerBodyVisible: analysis.lowerBodyVisible,
      bodyOrientation: analysis.bodyOrientation,
      poseBaseline: analysis.poseBaseline,
      cameraFraming: analysis.cameraFraming,
      handsVisible: analysis.handsVisible,
      feetVisible: analysis.feetVisible,
      confidence: Math.round(analysis.confidence * 100) / 100,
    } : null,
  });
}

export function getPosePlanSummary(plan: PosePlan | null | undefined) {
  if (!plan) return [];
  return plan.slots.map((slot) => ({
    key: `pose-slot-${slot.index}`,
    title: `姿势${slot.index} · ${slot.angle ? POSE_PLAN_ANGLE_LABELS[slot.angle] : "展示"}：${getPoseSlotDisplayName(slot)}`,
    detail: getPoseSlotDisplayDetail(slot),
    angle: slot.angle,
  }));
}

export function buildPosePlanPoseLines(plan: PosePlan | null | undefined) {
  if (!plan) return [];
  return plan.slots.map((slot) => {
    const parts = [
      slot.bodyAction,
      slot.handAction,
      slot.headDirection,
      slot.cameraFraming ? `镜头/构图：${slot.cameraFraming}` : "",
      slot.garmentVisibilityRule ? `服装展示：${slot.garmentVisibilityRule}` : "",
      slot.avoidRules.length ? `避免：${slot.avoidRules.join("、")}` : "",
    ].filter(Boolean);
    return `姿势${slot.index}：${parts.join("；")}。`;
  });
}

export function buildPoseSlotPlanDirective(slot: PoseSlotPlan | null | undefined) {
  if (!slot) return "";
  return [
    "Target pose:",
    `${slot.poseName}.`,
    slot.bodyAction,
    slot.handAction,
    slot.headDirection,
    "",
    "Camera:",
    slot.cameraFraming,
    "",
    "Outfit readability:",
    slot.garmentVisibilityRule,
    "",
    "Avoid:",
    slot.avoidRules.join(", "),
  ].filter(Boolean).join("\n");
}

function buildFallbackSlots(analysis: PoseVisualAnalysis, policy: PoseStylePolicy, sequence: PosePlanAngle[]): PoseSlotPlan[] {
  const safeSequence = sequence.length ? sequence : buildPoseAngleSequence(DEFAULT_POSE_ANGLE_COUNTS);
  const variants: Partial<Record<PosePlanAngle, number>> = {};
  return safeSequence.map((angle, index) => {
    variants[angle] = (variants[angle] || 0) + 1;
    return buildDirectionalSlot(index + 1, angle, variants[angle] || 1, policy, analysis);
  });
}

function buildDirectionalSlot(
  index: number,
  angle: PosePlanAngle,
  variant: number,
  policy: PoseStylePolicy,
  analysis: PoseVisualAnalysis
): PoseSlotPlan {
  const crop = analysis.bodyCrop;
  const avoid = buildAvoidRules(policy, analysis);
  const cameraBase = getCameraBase(policy, analysis);
  // 角度模板优先于源图裁切分发：服饰细节强制无头，坐姿走坐姿动作库
  if (angle === "garment") {
    return buildGarmentDirectionalSlot(index, variant, cameraBase, avoid);
  }
  if (angle === "seated") {
    return buildSeatedDirectionalSlot(index, variant, cameraBase, avoid);
  }
  if (isPoseHeadlessCrop(analysis) || crop === "lower_body") {
    return buildLowerBodyDirectionalSlot(index, angle, variant, cameraBase, avoid);
  }
  if (crop === "upper_body") {
    return buildUpperBodyDirectionalSlot(index, angle, variant, cameraBase, avoid, shouldSuppressPoseFacePlanning(analysis));
  }
  if (crop === "closeup") {
    return buildCloseupDirectionalSlot(index, angle, variant, cameraBase, avoid);
  }
  return buildFullBodyDirectionalSlot(index, angle, variant, cameraBase, avoid);
}

function buildGarmentDirectionalSlot(
  index: number,
  variant: number,
  cameraBase: string,
  avoid: string[]
): PoseSlotPlan {
  const actionPreset = pickCommercialPoseActionPreset("garment", variant);
  return createSlot(
    index,
    "garment",
    actionPreset.label,
    actionPreset.bodyAction,
    actionPreset.handAction,
    "",
    `无头服饰/配饰局部特写，画面不含头脸；${cameraBase}`,
    getCommercialGarmentReadabilityRule("garment"),
    avoid,
    0.72
  );
}

function buildSeatedDirectionalSlot(
  index: number,
  variant: number,
  cameraBase: string,
  avoid: string[]
): PoseSlotPlan {
  const actionPreset = pickCommercialPoseActionPreset("seated", variant);
  const expressionPreset = pickCommercialPoseExpressionPreset("seated", variant);
  return createSlot(
    index,
    "seated",
    actionPreset.label,
    actionPreset.bodyAction,
    actionPreset.handAction,
    expressionPreset?.text || "",
    `坐姿商业构图，椅凳或沙发不抢镜；${cameraBase}`,
    getCommercialGarmentReadabilityRule("seated"),
    avoid,
    0.74
  );
}

function getCameraBase(policy: PoseStylePolicy, analysis: PoseVisualAnalysis) {
  if (analysis.bodyCrop === "lower_body") return "保持下半身无头局部商业构图，不扩成完整人像";
  if (policy.cameraFreedom === "source_locked") {
    return `保持图1${POSE_VISUAL_BODY_CROP_LABELS[analysis.bodyCrop]}的镜头范围和真实透视`;
  }
  if (analysis.bodyCrop === "three_quarter") {
    return "以图1七分身/近全身为参考，可按姿势在近全身、七分身或偏半身商业构图之间自然变化";
  }
  if (analysis.bodyCrop === "upper_body") return "保持上半身或半身商业构图，不扩成全身";
  if (analysis.bodyCrop === "closeup") return "保持局部近景商业构图，不扩成无关全身照";
  return "以图1全身比例为参考，可按姿势在全身、近全身、七分身之间自然变化，不固定同一镜头距离";
}

function buildFullBodyDirectionalSlot(
  index: number,
  angle: PosePlanAngle,
  variant: number,
  cameraBase: string,
  avoid: string[]
) {
  const actionPreset = pickCommercialPoseActionPreset(angle, variant);
  const expressionPreset = pickCommercialPoseExpressionPreset(angle, variant);
  const garmentRule = getCommercialGarmentReadabilityRule(angle);
  const camera = [cameraBase, actionPreset.cameraHint].filter(Boolean).join("，");
  return createSlot(
    index,
    angle,
    actionPreset.label,
    actionPreset.bodyAction,
    actionPreset.handAction,
    expressionPreset?.text || "",
    camera,
    garmentRule,
    avoid,
    angle === "back" ? 0.68 : 0.74
  );
}

function pickCommercialPoseActionPreset(angle: PosePlanAngle, variant: number) {
  const options = getCommercialPoseActionPresets(angle);
  return options[(Math.max(variant, 1) - 1) % options.length] || options[0];
}

function pickCommercialPoseExpressionPreset(angle: PosePlanAngle, variant: number) {
  const options = getCommercialPoseExpressionPresets(angle);
  return options[(Math.max(variant, 1) - 1) % options.length] || options[0] || null;
}

function getCommercialGarmentReadabilityRule(angle: PosePlanAngle) {
  if (angle === "back") {
    return "背面/侧后可见结构、肩背、后片、下摆、裙摆/裤管和面料垂坠必须清楚；不可凭空生成原图没有的背面 logo 或装饰";
  }
  if (angle === "detail") {
    return "对应局部的领口、袖口、腰线、衣摆、扣位、图案、缝线、面料纹理和边缘细节必须清楚";
  }
  if (angle === "side") {
    return "侧面轮廓、肩线、腰线、侧缝、衣身厚度、面料垂坠和关键细节必须清楚";
  }
  if (angle === "garment") {
    return "只展示服饰/配饰局部：领型、袖型、扣位、图案、缝线、下摆、面料纹理和配饰细节必须清楚；画面不得出现头脸";
  }
  if (angle === "seated") {
    return "坐姿下腰线、裤装/裙摆垂坠、上衣下摆和鞋履关系必须清楚；坐姿不改变服装结构和版型";
  }
  return "服装正面轮廓、肩线、腰线、廓形、面料垂坠、图案和关键细节必须清楚";
}

function buildUpperBodyDirectionalSlot(
  index: number,
  angle: PosePlanAngle,
  variant: number,
  cameraBase: string,
  avoid: string[],
  suppressFacePlanning: boolean
) {
  const garmentRule = "领口、肩线、袖型、胸前图案、上衣版型和面料纹理必须清楚";
  const headDirection = suppressFacePlanning ? "" : "视线自然，表情克制，头颈跟随肩膀方向";
  if (angle === "front") {
    return createSlot(index, angle, variant > 1 ? "上身正面变化" : "上身正面展示", "上半身正面自然姿态，肩颈放松，躯干轻微重心变化", "手部可轻触衣摆上缘、袖口或自然入画", headDirection, cameraBase, garmentRule, avoid, 0.6);
  }
  if (angle === "back") {
    return createSlot(index, angle, "上身侧后展示", "上半身侧后或背面转身方向，展示肩背、袖型和衣身厚度，不扩成全身", "手臂自然贴近身体或轻带衣摆上缘", suppressFacePlanning ? "" : "头部跟随身体侧转，不夸张回头", cameraBase, "上衣背面/侧后轮廓、肩背、袖型和面料层次清楚，不凭空新增背面装饰", avoid, 0.58);
  }
  if (angle === "detail") {
    return createSlot(index, angle, variant > 1 ? "上身细节变化" : "上身细节展示", "躯干轻微倾斜或重心变化，突出领口、肩线、胸前图案和面料层次", "手部靠近服装细节但不遮挡关键图案", headDirection, cameraBase, garmentRule, avoid, 0.6);
  }
  return createSlot(index, angle, variant > 1 ? "上身侧向变化" : "上身侧向展示", "肩膀和躯干转为三分之二侧向，展示侧面肩线和衣身厚度", "一只手可整理领口或袖口", headDirection, cameraBase, garmentRule, avoid, 0.6);
}

function buildLowerBodyDirectionalSlot(
  index: number,
  angle: PosePlanAngle,
  variant: number,
  cameraBase: string,
  avoid: string[]
) {
  const garmentRule = "腰部、胯部、腿部线条、裤脚/裙摆、面料垂坠和下装长度必须清楚";
  if (angle === "front") return createSlot(index, angle, "下装正面展示", "下半身正面站姿，重心轻微变化，展示腰胯和裤管/裙摆正面", "", "", cameraBase, garmentRule, avoid, 0.58);
  if (angle === "back") return createSlot(index, angle, "下装侧后展示", "下半身背面、侧后或小幅转身，展示臀胯、侧缝、后片垂坠和裤脚/裙摆后缘", "", "", cameraBase, "下装背面/侧后轮廓、后片垂坠、侧缝和下摆清楚，不扩成完整人像", avoid, 0.56);
  if (angle === "detail") return createSlot(index, angle, variant > 1 ? "下装细节变化" : "下装细节展示", "站定重心偏移或局部小幅动作，突出腰部结构、口袋、侧缝、裤脚/裙摆和面料纹理", "", "", cameraBase, garmentRule, avoid, 0.56);
  return createSlot(index, angle, variant > 1 ? "下装侧面变化" : "下装侧面展示", "腿部和胯部转为侧向或三分之二侧向，展示侧缝、垂坠和厚度", "", "", cameraBase, garmentRule, avoid, 0.58);
}

function buildCloseupDirectionalSlot(
  index: number,
  angle: PosePlanAngle,
  variant: number,
  cameraBase: string,
  avoid: string[]
) {
  const garmentRule = "局部服装结构、纹理、图案、开口位置和边缘细节必须清楚";
  const name = angle === "front"
    ? "局部正向细节"
    : angle === "back"
      ? "局部背侧细节"
      : angle === "side"
        ? "局部侧向细节"
        : variant > 1 ? "局部质感变化" : "局部细节展示";
  const action = angle === "back"
    ? "局部转为背侧或侧后方向，突出背侧边缘、厚度、缝线和面料层次"
    : angle === "side"
      ? "局部转为侧向或斜向展示，突出厚度、缝线和面料层次"
      : angle === "detail"
        ? "通过小幅姿态和褶皱变化展示材质、垂坠、图案和边缘细节"
        : "保持局部正向展示，轻微改变角度突出结构边缘";
  return createSlot(index, angle, name, action, "手部仅在图1允许时自然辅助展示", "", cameraBase, garmentRule, avoid, 0.56);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildLegacyFullBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis, crop: PoseVisualBodyCrop): PoseSlotPlan[] {
  const cameraBase = crop === "three_quarter"
    ? "以图1七分身/近全身为参考，可按姿势在近全身、七分身或偏半身商业构图之间自然变化"
    : "以图1全身比例为参考，可按姿势在全身、近全身、七分身之间自然变化，不要固定同一镜头距离";
  const garmentRule = "服装正面轮廓、侧面轮廓、肩线、腰线、廓形、面料垂坠、运动褶皱和关键细节必须清楚";
  const avoid = buildAvoidRules(policy, analysis);

  return [
    createSlot(1, "front", "正面服装展示", "正面服装展示方向；AI 可自由选择自然手势、重心、视线、表情和镜头语言，服装正面轮廓必须清楚", "手臂自然离身或轻触衣摆/口袋，不遮挡核心版型", "轻松直视镜头，表情自然克制", `${cameraBase}，构图干净但可有自然留白`, garmentRule, avoid, 0.72),
    createSlot(2, "side", "侧身或三分之二侧身展示", "侧身或三分之二侧身展示方向；AI 可自由选择头发/衣领/袖口/衣摆手势、腿部节奏、视线和镜头语言，侧面轮廓和肩线必须清楚", "一只手可整理领口、袖口或自然靠近腰侧", "视线略偏离镜头，可带轻微微笑", `${cameraBase}，允许略微靠近以突出侧面轮廓`, garmentRule, avoid, 0.72),
    createSlot(3, "detail", "站定造型", "站定造型方向，不要走路；AI 可自由选择扶腰、胯部、肩线、手部造型、视线和镜头语言，腰线、廓形和面料垂坠必须清楚", "手部造型与服装结构配合，不要两张都重复同一扶腰动作", "自信眼神或轻微抬下巴，与姿势气质匹配", `${cameraBase}，可使用七分身或偏半身商业构图突出上身结构和腰线`, garmentRule, avoid, 0.72),
    createSlot(4, "side", "轻微迈步或自然转身", "轻微迈步或自然转身方向，不要静态扶腰；头部方向与肩膀、躯干和身体转向保持一致，不要单独回头看镜头；AI 可自由选择步态、手臂运动、身体转向、视线和镜头语言，服装运动褶皱和垂坠必须清楚", "手臂随步态自然摆动或轻带衣摆，形成可信动态褶皱", "表情更有呼吸感，视线跟随身体方向", `${cameraBase}，允许方向性留白和轻微动态构图`, garmentRule, avoid, 0.72),
  ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildUpperBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "领口、肩线、袖型、胸前图案、上衣版型和面料纹理必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1上半身裁切和镜头距离"
    : "保持上半身或半身商业构图，不扩成全身";
  if (shouldSuppressPoseFacePlanning(analysis)) {
    return [
      createSlot(1, "front", "无头上身正面展示", "保持无头上半身正面展示，肩线、胸前、袖型和衣摆上缘清楚", "手部可轻触衣摆上缘、袖口或自然入画", "", camera, garmentRule, avoid, 0.58),
      createSlot(2, "side", "无头上身侧向展示", "无头上半身转为三分之二侧向，展示侧面肩线、衣身厚度和袖型", "一只手可整理领口以下或袖口，不越界补脸", "", camera, garmentRule, avoid, 0.58),
      createSlot(3, "detail", "无头上身细节造型", "躯干轻微倾斜或重心变化，突出领口以下服装层次和面料垂坠", "手部靠近服装细节但不遮挡关键图案", "", camera, garmentRule, avoid, 0.58),
      createSlot(4, "side", "无头上身轻微转动", "肩部和躯干做小幅自然转动，保持无头裁切和可信服装动态", "手臂自然带动袖口和衣摆产生可信褶皱", "", camera, garmentRule, avoid, 0.58),
    ];
  }
  return [
    createSlot(1, "front", "上半身正面展示", "上半身正面自然姿态，肩颈放松，躯干轻微重心变化", "手部可轻触衣摆上缘、袖口或自然入画", "视线自然看向镜头", camera, garmentRule, avoid, 0.6),
    createSlot(2, "side", "上半身侧向展示", "肩膀和躯干转为三分之二侧向，展示侧面肩线和衣身厚度", "一只手可整理领口或袖口", "头颈跟随肩膀方向，避免独立回望", camera, garmentRule, avoid, 0.6),
    createSlot(3, "detail", "上半身细节造型", "躯干轻微倾斜或重心变化，突出领口、肩线和面料层次", "手部靠近服装细节但不遮挡关键图案", "表情自然克制", camera, garmentRule, avoid, 0.6),
    createSlot(4, "side", "上半身轻微转动", "肩颈和躯干做小幅自然转动，制造轻微动态感", "手臂自然带动袖口和衣摆产生可信褶皱", "视线与身体方向一致", camera, garmentRule, avoid, 0.6),
  ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildLowerBodySlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "腰部、胯部、腿部线条、裤脚/裙摆、面料垂坠和下装长度必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1下半身无头裁切和镜头距离，不扩成完整人像"
    : "保持下半身局部商业构图，不扩成完整人像";
  return [
    createSlot(1, "front", "下装正面展示", "下半身正面站姿，重心轻微变化，展示腰胯和裤管/裙摆正面", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(2, "side", "下装侧面展示", "腿部和胯部转为侧向或三分之二侧向，展示侧缝、垂坠和厚度", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(3, "detail", "下装站定重心", "站定重心偏移，一侧膝部自然放松，突出下摆和面料张力", "", "", camera, garmentRule, avoid, 0.58),
    createSlot(4, "side", "下装轻微步态", "小幅迈步或自然转身，展示运动褶皱和裤脚/裙摆动态", "", "", camera, garmentRule, avoid, 0.58),
  ];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildCloseupSlots(policy: PoseStylePolicy, analysis: PoseVisualAnalysis): PoseSlotPlan[] {
  const avoid = buildAvoidRules(policy, analysis);
  const garmentRule = "局部服装结构、纹理、图案、开口位置和边缘细节必须清楚";
  const camera = policy.cameraFreedom === "source_locked"
    ? "保持图1局部近景裁切和镜头距离"
    : "保持局部近景商业构图，不扩成无关全身照";
  return [
    createSlot(1, "front", "局部正向细节", "保持局部正向展示，轻微改变角度突出结构边缘", "手部仅在图1允许时自然辅助展示", "", camera, garmentRule, avoid, 0.56),
    createSlot(2, "side", "局部侧向细节", "局部转为侧向或斜向展示，突出厚度、缝线和面料层次", "避免遮挡主要纹理", "", camera, garmentRule, avoid, 0.56),
    createSlot(3, "detail", "局部质感变化", "通过小幅姿态和褶皱变化展示材质、垂坠和张力", "动作保持克制", "", camera, garmentRule, avoid, 0.56),
    createSlot(4, "detail", "局部轻微动态", "局部产生轻微自然动态，展示边缘和面料运动感", "不要制造夸张变形", "", camera, garmentRule, avoid, 0.56),
  ];
}

function buildAvoidRules(policy: PoseStylePolicy, analysis: PoseVisualAnalysis) {
  const criticalRules = shouldSuppressPoseFacePlanning(analysis)
    ? ["invented head", "invented face", "portrait expansion", "gaze direction", "facial expression", "looking at camera"]
    : [];
  const rules = [
    ...criticalRules,
    ...policy.avoid,
    "face change",
    "outfit change",
    "body proportion drift",
    "twisted neck",
    "broken limbs",
  ];
  if (analysis.genderExpression === "male") {
    rules.push("male-to-female change", "feminized body", "gendered makeup change");
  } else if (analysis.genderExpression === "female") {
    rules.push("female-to-male change", "masculinized body frame");
  } else {
    rules.push("gender expression drift");
  }
  if (analysis.bodyCrop === "upper_body") {
    rules.push("full-body expansion", "invented lower body");
  }
  if (analysis.bodyCrop === "lower_body") {
    rules.push("full portrait expansion", "invented upper body", "invented head", "invented face", "facial expression planning");
  }
  if (analysis.bodyCrop === "closeup") {
    rules.push("wide shot expansion");
  }
  return Array.from(new Set(rules)).slice(0, 10);
}

function sanitizePoseSlotForVisibility(slot: PoseSlotPlan, analysis: PoseVisualAnalysis | null): PoseSlotPlan {
  if (!shouldSuppressPoseFacePlanning(analysis)) return slot;
  return {
    ...slot,
    headDirection: "",
    bodyAction: stripFacePlanningText(slot.bodyAction),
    handAction: stripFacePlanningText(slot.handAction),
    cameraFraming: ensureNoHeadCameraRule(slot.cameraFraming, analysis),
    avoidRules: Array.from(new Set([
      ...slot.avoidRules,
      "invented head",
      "invented face",
      "portrait expansion",
      "facial expression",
      "looking at camera",
    ])).slice(0, 10),
  };
}

function stripFacePlanningText(value: string) {
  return value
    .replace(/(?:，|；|、)?[^，；。]*?(?:看镜头|直视|视线|眼神|表情|微笑|回眸|抬下巴|头部|脸部|发型)[^，；。]*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[，；、\s]+|[，；、\s]+$/g, "")
    .trim();
}

function ensureNoHeadCameraRule(value: string, analysis: PoseVisualAnalysis | null) {
  const base = value || (analysis?.bodyCrop === "lower_body" ? "保持下半身局部商业构图" : "保持原图无头裁切");
  const lock = analysis?.bodyCrop === "lower_body"
    ? "保持下半身无头局部裁切，不扩成完整人像"
    : "保持无头裁切，不补头不补脸";
  return base.includes("无头") || base.includes("不补头") ? base : `${base}；${lock}`;
}

function createSlot(
  index: number,
  angle: PosePlanAngle,
  poseName: string,
  bodyAction: string,
  handAction: string,
  headDirection: string,
  cameraFraming: string,
  garmentVisibilityRule: string,
  avoidRules: string[],
  confidence: number
): PoseSlotPlan {
  return {
    index: normalizePosePlanCount(index),
    angle,
    poseName,
    bodyAction,
    handAction,
    headDirection,
    cameraFraming,
    garmentVisibilityRule,
    avoidRules,
    confidence,
  };
}

function normalizePoseSlotPlan(input: unknown, fallback: PoseSlotPlan, fallbackIndex: number): PoseSlotPlan {
  const record = toRecord(input);
  if (!record) return { ...fallback, index: fallbackIndex };
  return {
    index: fallbackIndex,
    angle: normalizePosePlanAngle(readString(record, "angle", "poseAngle", "pose_angle", "angleIntent", "angle_intent", "展示角度")) || fallback.angle,
    poseName: clampText(readString(record, "poseName", "pose_name", "name", "title", "summary", "姿势名", "名称") || fallback.poseName),
    bodyAction: clampText(readString(record, "bodyAction", "body_action", "action", "body", "body_pose", "movement", "description", "动作", "身体动作", "姿势描述") || fallback.bodyAction, 260),
    handAction: clampText(readString(record, "handAction", "hand_action", "hands", "hand", "hand_pose", "手部", "手部动作") || fallback.handAction, 220),
    headDirection: clampText(readString(record, "headDirection", "head_direction", "gaze", "head", "face", "头部", "头部方向", "视线") || fallback.headDirection, 220),
    cameraFraming: clampText(readString(record, "cameraFraming", "camera_framing", "camera", "framing", "composition", "镜头", "构图", "取景") || fallback.cameraFraming, 220),
    garmentVisibilityRule: clampText(readString(record, "garmentVisibilityRule", "garment_visibility_rule", "outfit", "garment", "garment_rule", "visibility", "服装展示", "服装可读性") || fallback.garmentVisibilityRule, 240),
    avoidRules: normalizeStringArray(record.avoidRules ?? record.avoid_rules ?? record.avoid ?? record.negative ?? record.禁忌 ?? record.避免, 10, 90, fallback.avoidRules),
    confidence: normalizeConfidence(record.confidence, fallback.confidence),
  };
}

function getPoseSlotDisplayName(slot: PoseSlotPlan) {
  if (isChineseDisplayText(slot.poseName)) return clampText(slot.poseName, 24);
  const text = [slot.poseName, slot.bodyAction].join(" ").toLowerCase();
  if (slot.angle === "front") return "正面服装展示";
  if (slot.angle === "side") return "侧身角度展示";
  if (slot.angle === "back") return "背面/侧后展示";
  if (slot.angle === "detail") return "服装细节展示";
  if (/front|facing|confident/.test(text) && slot.index === 1) return "正面服装展示";
  if (/side|angle|turn|profile/.test(text)) return "侧身角度展示";
  if (/walk-free|walk free|paused|stride|stand/.test(text) && slot.index === 3) return "站定造型展示";
  if (/powerful|open|confident|chest/.test(text)) return "开放站姿展示";
  return LEGACY_DISPLAY_SLOT_NAMES[slot.index - 1] || "自然姿势展示";
}

function getPoseSlotDisplayDetail(slot: PoseSlotPlan) {
  const raw = [slot.bodyAction, slot.handAction, slot.headDirection].filter(Boolean).join("；");
  if (isChineseDisplayText(raw)) return raw;
  if (slot.angle) return POSE_PLAN_ANGLE_DESCRIPTIONS[slot.angle];
  const text = raw.toLowerCase();
  if (/20\s*-\s*30|side|turn body|one side/.test(text)) {
    return "身体轻微侧转，保持直立姿态，重心自然变化，展示侧面轮廓和服装线条。";
  }
  if (/paused|stride|one foot|heel|knees|walk-free/.test(text)) {
    return "站定跨步造型，一脚轻微向前但不走路，保持身体稳定并突出服装垂坠。";
  }
  if (/chest|open posture|arms slightly away|powerful/.test(text)) {
    return "挺拔开放站姿，胸肩自然打开，手臂轻微离身，表现自信但不过度摆拍。";
  }
  if (/standing|stand|shoulders|weight|torso|front/.test(text)) {
    return "正面自然站立，肩颈放松，重心轻微变化，服装正面轮廓清楚。";
  }
  return LEGACY_DISPLAY_SLOT_DETAILS[slot.index - 1] || "自然可信的商业时装姿势，保持人物身份、服装结构和身体比例稳定。";
}

const LEGACY_DISPLAY_SLOT_NAMES = [
  "正面服装展示",
  "侧身角度展示",
  "站定造型展示",
  "轻微动态展示",
];

const LEGACY_DISPLAY_SLOT_DETAILS = [
  "正面服装展示方向，服装正面轮廓清楚，手势和重心自然变化。",
  "侧身或三分之二侧身展示方向，侧面轮廓和肩线清楚。",
  "站定造型方向，不要走路，腰线、廓形和面料垂坠清楚。",
  "轻微迈步或自然转身方向，动作幅度克制，服装运动褶皱和垂坠清楚。",
];

function derivePoseAngleCounts(slots: PoseSlotPlan[], fallback: PoseAngleCounts): PoseAngleCounts {
  const counts: PoseAngleCounts = { front: 0, side: 0, back: 0, detail: 0, garment: 0, seated: 0 };
  slots.forEach((slot) => {
    if (slot.angle) counts[slot.angle] += 1;
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return total ? counts : normalizePoseAngleCounts(fallback);
}

function readAngleCounts(record: Record<string, unknown>): Partial<Record<PosePlanAngle, unknown>> | null {
  const raw = record.angleCounts ?? record.angle_counts ?? record.poseAngleCounts ?? record.pose_angle_counts;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Partial<Record<PosePlanAngle, unknown>>;
  return null;
}

function normalizePosePlanAngle(value: unknown): PosePlanAngle | undefined {
  if (value === "front" || value === "正面") return "front";
  if (value === "side" || value === "three_quarter" || value === "侧面" || value === "侧身") return "side";
  if (value === "back" || value === "侧后" || value === "背面") return "back";
  if (value === "detail" || value === "motion" || value === "细节" || value === "动态") return "detail";
  if (value === "garment" || value === "服饰细节" || value === "配饰细节" || value === "特写") return "garment";
  if (value === "seated" || value === "sitting" || value === "坐姿") return "seated";
  return undefined;
}

function normalizeOutputMode(value: unknown): PosePlanOutputMode {
  return value === "separate" ? "separate" : "grid";
}

function normalizeAnalysisUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return String(value || "").split("?")[0].trim().toLowerCase();
  }
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number, fallback: string[] = []) {
  const values = Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? clampText(item, maxLength) : "").filter(Boolean)
    : fallback;
  return Array.from(new Set(values)).slice(0, maxItems);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clampText(value: string, maxLength = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function isChineseDisplayText(value: string) {
  return containsCjk(value) && !/[A-Za-z]{4,}/.test(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
