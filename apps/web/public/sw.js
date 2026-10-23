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
  const link = new URL(
    (event.notification.data && event.notification.data.link) || "/",
    self.location.origin,
  );
  // Only ever open a page of this app, whatever the payload says.
  const target = link.origin === self.location.origin ? link.href : self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w || open).navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
