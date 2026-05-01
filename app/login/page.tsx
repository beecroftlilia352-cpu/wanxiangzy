"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

type AuthView = "login" | "signup" | "check-email" | "forgot-password" | "reset-sent";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 如果已登录，直接跳转
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/create");
    });

    // 监听 auth 状态变化（如点击确认链接后）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.replace("/create");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ---- 登录 ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setError("邮箱或密码错误");
      } else if (error.message.includes("Email not confirmed")) {
        setError("请先点击确认邮件中的链接完成验证");
        setView("check-email");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    router.push("/create");
  };

  // ---- 注册 ----
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password.length < 6) {
      setError("密码至少需要 6 位");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/create`,
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        setError("该邮箱已注册，请直接登录");
        setView("login");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    // 如果 Supabase 没有开启邮箱确认，用户会自动登录
    if (data.session) {
      router.push("/create");
      return;
    }

    // 需要邮箱确认
    setView("check-email");
    setLoading(false);
  };

  // ---- 忘记密码 ----
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      setError(error.message);
    } else {
      setView("reset-sent");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-purple-500" />
          <h1 className="text-2xl font-bold">
            {view === "login" && "登录"}
            {view === "signup" && "创建账号"}
            {view === "check-email" && "查收邮件"}
            {view === "forgot-password" && "重置密码"}
            {view === "reset-sent" && "邮件已发送"}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {view === "login" && "欢迎回来，请登录以继续"}
            {view === "signup" && "注册即赠 50 分免费生成额度"}
            {view === "check-email" && `确认邮件已发送至 ${email}`}
            {view === "forgot-password" && "输入注册邮箱，我们将发送重置链接"}
            {view === "reset-sent" && "密码重置链接已发送，请查收邮件"}
          </p>
        </div>

        {/* ---- 登录表单 ---- */}
        {view === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl border focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  placeholder="输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl gradient-brand text-white font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  登录中...
                </span>
              ) : "登录"}
            </button>

            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={() => { setView("forgot-password"); setError(""); }}
                className="text-purple-600 hover:underline"
              >
                忘记密码？
              </button>
              <button
                type="button"
                onClick={() => { setView("signup"); setError(""); }}
                className="text-purple-600 hover:underline"
              >
                没有账号？注册
              </button>
            </div>
          </form>
        )}

        {/* ---- 注册表单 ---- */}
        {view === "signup" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  placeholder="至少 6 位"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">至少 6 位字符</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl gradient-brand text-white font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  注册中...
                </span>
              ) : "注册"}
            </button>

            <p className="text-center text-sm text-gray-400">
              已有账号？
              <button
                type="button"
                onClick={() => { setView("login"); setError(""); }}
                className="text-purple-600 font-medium ml-1 hover:underline"
              >
                去登录
              </button>
            </p>
          </form>
        )}

        {/* ---- 查收邮件确认 ---- */}
        {view === "check-email" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-purple-50 flex items-center justify-center">
              <Mail className="w-10 h-10 text-purple-500" />
            </div>

            <div className="space-y-2">
              <p className="text-gray-600">
                我们已向 <span className="font-semibold text-gray-900">{email}</span> 发送了一封确认邮件
              </p>
              <p className="text-sm text-gray-400">
                请点击邮件中的链接完成验证，然后返回此页面登录
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
              <p className="text-sm text-amber-800 font-medium mb-2">没收到邮件？</p>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• 检查垃圾邮件 / 广告邮件文件夹</li>
                <li>• 确认邮箱地址拼写正确</li>
                <li>• 等待 1-2 分钟后重试</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setView("signup")}
                className="flex-1 py-2.5 rounded-xl border font-medium text-sm hover:bg-gray-50"
              >
                换个邮箱
              </button>
              <button
                onClick={() => setView("login")}
                className="flex-1 py-2.5 rounded-xl gradient-brand text-white font-medium text-sm"
              >
                我已验证，去登录
              </button>
            </div>
          </div>
        )}

        {/* ---- 忘记密码 ---- */}
        {view === "forgot-password" && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">注册邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl gradient-brand text-white font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {loading ? "发送中..." : "发送重置链接"}
            </button>

            <button
              type="button"
              onClick={() => { setView("login"); setError(""); }}
              className="flex items-center justify-center gap-1 w-full text-sm text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="w-3 h-3" /> 返回登录
            </button>
          </form>
        )}

        {/* ---- 重置邮件已发送 ---- */}
        {view === "reset-sent" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>

            <div className="space-y-2">
              <p className="text-gray-600">
                密码重置链接已发送至 <span className="font-semibold text-gray-900">{email}</span>
              </p>
              <p className="text-sm text-gray-400">
                请点击邮件中的链接设置新密码
              </p>
            </div>

            <button
              onClick={() => setView("login")}
              className="w-full py-3 rounded-xl gradient-brand text-white font-semibold hover:opacity-90"
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
