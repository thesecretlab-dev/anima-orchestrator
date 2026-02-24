import type { Notifier, Notification, PluginModule } from "@composio/ao-core";

// =============================================================================
// Plugin Manifest
// =============================================================================

export const manifest = {
  name: "anima",
  slot: "notifier" as const,
  description: "Notifier plugin: ANIMA messaging (routes through VEIL agent communication layer)",
  version: "0.1.0",
};

// =============================================================================
// ANIMA Notifier
//
// Sends notifications through the ANIMA agent communication infrastructure.
// Routes to configured channels: Telegram, Discord, Signal, webhook, etc.
// 
// Env vars:
//   ANIMA_NOTIFY_URL     — webhook endpoint (default: http://localhost:3284/api/v1/message)
//   ANIMA_NOTIFY_KEY     — auth token
//   ANIMA_NOTIFY_CHANNEL — target channel ID
// =============================================================================

function createAnimaNotifier(): Notifier {
  const apiUrl = process.env["ANIMA_NOTIFY_URL"] || "http://localhost:3284/api/v1/message";
  const apiKey = process.env["ANIMA_NOTIFY_KEY"] || "";
  const defaultChannel = process.env["ANIMA_NOTIFY_CHANNEL"] || "";

  return {
    name: "anima",

    async send(notification: Notification): Promise<void> {
      const channel = defaultChannel;
      if (!channel) {
        console.warn("[anima-notifier] No ANIMA_NOTIFY_CHANNEL set, skipping");
        return;
      }

      const emoji = notification.priority === "urgent" ? "🚨"
        : notification.priority === "action" ? "✅"
        : notification.priority === "warning" ? "⚠️"
        : "ℹ️";

      const lines: string[] = [
        `${emoji} **ANIMA Orchestrator**`,
        "",
        notification.title,
      ];

      if (notification.body) lines.push("", notification.body);
      if (notification.sessionId) lines.push("", `Session: \`${notification.sessionId}\``);
      if (notification.url) lines.push(`[View](${notification.url})`);

      const message = lines.join("\n");

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ channel, message }),
        });

        if (!res.ok) {
          console.error(`[anima-notifier] Failed: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        console.error("[anima-notifier] Error:", err);
      }
    },
  };
}

// =============================================================================
// Plugin Export
// =============================================================================

export function create(): Notifier {
  return createAnimaNotifier();
}

export default { manifest, create } satisfies PluginModule<Notifier>;
