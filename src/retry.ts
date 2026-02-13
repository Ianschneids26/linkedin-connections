export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 2000, label = "operation" } = {},
): Promise<T> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = i === attempts;
      const msg = err?.message ?? String(err);

      // Don't retry auth errors — they won't resolve on retry
      if (msg.includes("401") || msg.includes("403") || msg.includes("JSESSIONID")) {
        throw err;
      }

      if (isLast) throw err;

      const wait = delayMs * i;
      console.log(`${label} failed (attempt ${i}/${attempts}): ${msg}`);
      console.log(`Retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}
