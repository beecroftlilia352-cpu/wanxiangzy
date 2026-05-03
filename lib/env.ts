/**
 * 启动时环境变量校验
 * 在 dev/production 启动阶段尽早发现缺失的关键配置。
 */

const REQUIRED_SERVER_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const REQUIRED_API_VARS = [
  "LINGYA_API_KEY",
] as const;

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const missing: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    if (!process.env[key]) missing.push(key);
  }

  if (missing.length > 0) {
    console.error(
      `[env] 缺少必要的环境变量: ${missing.join(", ")}\n` +
      `请在 .env.local 中配置这些变量。`
    );
  }

  const optionalMissing: string[] = [];
  for (const key of REQUIRED_API_VARS) {
    if (!process.env[key]) optionalMissing.push(key);
  }

  if (optionalMissing.length > 0) {
    console.warn(
      `[env] 以下 API Key 未配置，相关功能将不可用: ${optionalMissing.join(", ")}`
    );
  }
}

// 自动执行（模块加载时）
validateEnv();
