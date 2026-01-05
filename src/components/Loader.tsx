interface LoaderProps {
  active: boolean;
  progress?: number;
  total?: number;
  processed?: number;
}

export function Loader({ active, progress, total, processed }: LoaderProps) {
  const hasProgress = typeof progress === "number" && active;
  const hasCounts = typeof total === "number" && typeof processed === "number" && total > 0 && active;
  const progressValue = hasProgress ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  return (
    <div className={`theater-loader${active ? " active" : ""}`} role="status" aria-label="Loading" aria-hidden={!active}>
      <div className="theater-curtain top" aria-hidden="true" />
      <div className="theater-spot">
        <div className="duck" />
        {hasProgress && (
          <div className="loader-progress" aria-hidden="true">
            <div className="loader-progress-track">
              <div className="loader-progress-fill" style={{ width: `${progressValue}%` }} />
            </div>
            <div className="loader-progress-label">
              {progressValue}%
              {hasCounts && ` (${processed}/${total})`}
            </div>
          </div>
        )}
      </div>
      <div className="theater-curtain bottom" aria-hidden="true" />
    </div>
  );
}
