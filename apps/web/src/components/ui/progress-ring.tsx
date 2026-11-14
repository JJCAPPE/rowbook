type ProgressRingProps = {
  value: number;
  max: number;
  size?: number;
};

export const ProgressRing = ({ value, max, size = 120 }: ProgressRingProps) => {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const offset = circumference - progress * circumference;
  const ringColor = value >= max ? "hsl(var(--heroui-success))" : "hsl(var(--heroui-danger))";

  return (
    <div className="relative flex items-center justify-center">
      <progress
        className="sr-only"
        value={progress * 100}
        max={100}
        aria-label="Weekly minutes goal"
        aria-valuetext={`${value} of ${max} minutes`}
      />
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--heroui-default-200))"
          strokeWidth="12"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth="12"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <p className="text-2xl font-semibold text-foreground">{Math.round(progress * 100)}%</p>
        <p className="text-xs text-default-500">of goal</p>
      </div>
    </div>
  );
};
