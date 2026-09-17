/** Browser notifications for long waits (attestations, relays), only when the tab is hidden and the user opted in. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function notify(title: string, body: string, tag?: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // notification constructor can throw in some embedded contexts
  }
}
