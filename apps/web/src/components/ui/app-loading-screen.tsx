import styles from "./app-loading-screen.module.css";

export const AppLoadingScreen = ({ overlay = false }: { overlay?: boolean }) => (
  <div
    role="status"
    aria-label="Loading Rowbook"
    className={`flex min-h-dvh items-center justify-center bg-background px-6 text-foreground${overlay ? " fixed inset-0 z-[100]" : ""}`}
  >
    <span aria-hidden="true" className={styles.wordmark}>
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
