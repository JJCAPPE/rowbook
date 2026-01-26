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

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
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
          stroke="hsl(var(--heroui-primary))"
          strokeWidth="12"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-semibold text-foreground">{Math.round(progress * 100)}%</p>
        <p className="text-xs text-default-500">of goal</p>
      </div>
    </div>
  );
};
