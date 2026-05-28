// ============================================================
// TeX Board — utils.ts
// Shared utility helpers.
// ============================================================

/**
 * Returns a debounced version of `fn` that delays invocation until
 * `ms` milliseconds have elapsed since the last call.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}