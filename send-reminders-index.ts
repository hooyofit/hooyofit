import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails(
  "mailto:hooyofit@somalibd.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("reminder_on", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const nowUtc = new Date();
  let sent = 0;

  for (const sub of subs ?? []) {
    // Convert current UTC time into this user's local time using the offset
    // captured when they subscribed (getTimezoneOffset semantics: local = UTC - offset)
    const localMs = nowUtc.getTime() - sub.timezone_offset_minutes * 60000;
    const local = new Date(localMs);
    const nowKey = `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;

    const [targetH, targetM] = (sub.reminder_time || "17:00").split(":").map(Number);
    const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const targetMinutes = targetH * 60 + targetM;

    const alreadySent = sub.last_sent_date === nowKey;
    // 15-minute window matches how often this function is triggered (see GitHub Action)
    const isDue = nowMinutes >= targetMinutes && nowMinutes < targetMinutes + 15;

    if (isDue && !alreadySent) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify({
            title: "HooyoFit",
            body: "Time for your workout! 💪",
          })
        );
        await supabase
          .from("push_subscriptions")
          .update({ last_sent_date: nowKey })
          .eq("id", sub.id);
        sent++;
      } catch (e) {
        // Dead subscription (browser data cleared, uninstalled, etc.) — clean it up
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ checked: subs?.length ?? 0, sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
