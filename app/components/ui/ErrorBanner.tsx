type ErrorBannerProps = {
  title: string;
  message: string;
  tone?: "danger" | "warning";
  actionLabel?: string;
  onAction?: () => void;
};

const TONE_STYLES: Record<NonNullable<ErrorBannerProps["tone"]>, string> = {
  danger: "border-rose-200 bg-rose-50/85 text-rose-800",
  warning: "border-amber-200 bg-amber-50/85 text-amber-800",
};

export function ErrorBanner({
  title,
  message,
  tone = "danger",
  actionLabel,
  onAction,
}: ErrorBannerProps) {
  return (
    <div className={`rounded-none border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${TONE_STYLES[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-5">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex items-center rounded-none border border-current/20 bg-white/85 px-3 py-1.5 text-xs font-medium hover:bg-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

