/**
 * 登录页视图枚举 + 国际化文案映射。
 *
 * 把页面里 "view -> titleKey/descKey" 这张表抽到独立文件，方便后续多端复用
 * （如注册落地页 / 后台引导）。文案仍由 next-intl 在页面里翻译。
 */
export const AUTH_VIEW_KEYS = ["login", "signup", "check-email", "forgot-password", "reset-sent"] as const;
export type AuthView = (typeof AUTH_VIEW_KEYS)[number];

export const authViewCopy: Record<AuthView, { titleKey: string; descKey: string }> = {
  login: {
    titleKey: "loginTitle",
    descKey: "loginDesc",
  },
  signup: {
    titleKey: "signupTitle",
    descKey: "signupDesc",
  },
  "check-email": {
    titleKey: "checkEmailTitle",
    descKey: "checkEmailDesc",
  },
  "forgot-password": {
    titleKey: "forgotPasswordTitle",
    descKey: "forgotPasswordDesc",
  },
  "reset-sent": {
    titleKey: "resetSentTitle",
    descKey: "resetSentDesc",
  },
};

/** 登录页右侧 hero 用的 showcase 图片。 */
export const LOGIN_SHOWCASE_IMAGES = [
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-striped-top-white-skirt.png",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-grey-tank-denim-culottes.jpg",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/models/model-natural-smile.jpg",
  "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/references/reference-soft-blue-cardigan.jpg",
];