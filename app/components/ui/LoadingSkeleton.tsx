type LoadingSkeletonProps = {
  className?: string;
  lines?: number;
};

export function LoadingSkeleton({ className, lines = 4 }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={`skeleton-line-${index}`}
          className="h-3 animate-pulse rounded-full bg-zinc-200/85"
          style={{ width: `${96 - index * 12}%` }}
        />
      ))}
    </div>
  );
}
