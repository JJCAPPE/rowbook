import { waitUntil } from "@vercel/functions";

/** Keep request-triggered reconciliation alive after the response on Vercel. */
export const runInBackground = (
  label: string,
  createTask: () => Promise<unknown>,
) => {
  if (process.env.ROWBOOK_DISABLE_BACKGROUND_JOBS === "1") return;

  const guarded = createTask().catch((error) => {
    console.error(label, {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  });

  try {
    waitUntil(guarded);
  } catch {
    // The promise is already running. This path is expected in plain Node tests.
  }
};
