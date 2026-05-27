// ============================================================
// TeX Board — toast.ts
// ============================================================

const toast = document.getElementById('toast') as HTMLDivElement;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}