import styles from "./app-loading-screen.module.css";

export const AppLoadingScreen = ({
  overlay = false,
  compact = false,
}: {
  overlay?: boolean;
  compact?: boolean;
}) => (
  <div
    role="status"
    aria-label="Loading Rowbook"
    className={`flex items-center justify-center px-6 text-foreground ${compact ? "min-h-24" : "min-h-dvh bg-background"}${overlay ? " fixed inset-0 z-[100]" : ""}`}
  >
    <span aria-hidden="true" className={`${styles.wordmark}${compact ? ` ${styles.compact}` : ""}`}>
      {Array.from("#Temple", (letter, index) => (
        <span
          key={index}
          className={styles.letter}
          style={{ animationDelay: `${index * 80}ms` }}
        >
          {letter}
        </span>
      ))}
    </span>
  </div>
);
