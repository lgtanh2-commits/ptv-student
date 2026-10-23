// Shows a notification when the server pushes one, and opens the work when it is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // not JSON: show nothing useful, but a push must always show something
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tutorio", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: { link: data.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const origin = self.location.origin;
  let target = origin + "/";
  try {
    const link = new URL((event.notification.data && event.notification.data.link) || "/", origin);
    // Only ever open a page of this app, whatever the payload says.
    if (link.origin === origin) target = link.href;
  } catch {
    // a malformed link: open the home page
  }
  event.waitUntil(
    // Without includeUncontrolled this lists only windows this worker controls, the only ones navigate() accepts.
    self.clients.matchAll({ type: "window" }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === origin);
      if (open) {
        try {
          const focused = await open.focus();
          await (focused || open).navigate(target);
          return;
        } catch {
          // navigating failed: open a new window instead
        }
      }
      await self.clients.openWindow(target);
    }),
  );
});
