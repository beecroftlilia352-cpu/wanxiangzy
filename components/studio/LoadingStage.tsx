"use client";

type LoadingStageProps = {
  genCount: number;
  progress: number;
};

function getProgressLabel(progress: number): string {
  if (progress < 20) return "准备中...";
  if (progress < 90) return "生成中...";
  return "即将完成...";
}

export function LoadingStage({ genCount, progress }: LoadingStageProps) {
  return (
    <div className="studio-loading-stage min-h-[260px] sm:min-h-[360px] lg:h-full p-4 sm:p-8 flex items-center justify-center">
      <div className="studio-loading-spot-1" />
      <div className="studio-loading-spot-2" />

      <div className="flex flex-wrap justify-center gap-3 sm:gap-5 w-full relative z-10">
        {Array.from({ length: genCount }).map((_, i) => (
          <div
            key={i}
            className={`studio-loading-card ${genCount <= 2 ? "max-w-[min(420px,calc(50%-12px))] w-full sm:max-w-[min(420px,calc(50%-20px))]" : "max-w-[min(340px,calc(50%-12px))] w-full sm:max-w-[min(340px,calc(50%-20px))]"}`}
          >
            <div className="studio-loading-card-inner">
              <div className="studio-loading-shimmer-1" />
              <div className="studio-loading-shimmer-2" />
              <div className="studio-loading-pulse-glow" />
              <div className="studio-loading-noise" />

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="relative w-16 h-16 mb-4">
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 100 100"
                    style={{ animation: "spin 5s linear infinite", transformOrigin: "center", filter: "drop-shadow(0 0 8px rgba(232,121,249,0.4))" }}
                  >
                    <defs>
                      <linearGradient id={`lg${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#e879f9">
                          <animate attributeName="stop-color" values="#e879f9;#a78bfa;#f472b6;#e879f9" dur="4s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#a78bfa">
                          <animate attributeName="stop-color" values="#a78bfa;#f472b6;#e879f9;#a78bfa" dur="4s" repeatCount="indefinite" />
                        </stop>
                      </linearGradient>
                    </defs>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#lg${i})`} strokeWidth="4" strokeLinecap="round" strokeDasharray="180 264" />
                    <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-black studio-loading-spinner-gradient">
                      {Math.round(progress)}
                    </span>
                    <span className="text-xs font-bold ml-0.5" style={{ color: "rgba(168,85,247,0.5)" }}>%</span>
                  </div>
                </div>

                <p className="text-xs font-medium" style={{ color: "rgba(168,85,247,0.7)" }}>
                  {getProgressLabel(progress)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
