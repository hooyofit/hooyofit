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

const WINDOW_MINUTES = 15; // matches how often the GitHub Action triggers this

// Computes the current local date/time in ANY IANA timezone correctly,
// including automatic daylight-saving handling — no hardcoded offsets that
// would silently drift wrong twice a year.
function getLocalNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
  };
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("reminder_on", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  const results: Array<{ id: string; timezone: string; localTime: string; isDue: boolean }> = [];

  for (const sub of subs ?? []) {
    const timezone = sub.timezone_name || "Europe/Stockholm";
    const { dateKey, hour, minute } = getLocalNow(timezone);
    const nowMinutes = hour * 60 + minute;

    const [targetH, targetM] = (sub.reminder_time || "17:00").split(":").map(Number);
    const targetMinutes = targetH * 60 + targetM;
    const isDue = nowMinutes >= targetMinutes && nowMinutes < targetMinutes + WINDOW_MINUTES;

    results.push({ id: sub.id, timezone, localTime: `${hour}:${String(minute).padStart(2, "0")}`, isDue });

    const alreadySent = sub.last_sent_date === dateKey;
    if (!isDue || alreadySent) continue;

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
        .update({ last_sent_date: dateKey })
        .eq("id", sub.id);
      sent++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return new Response(JSON.stringify({ checked: subs?.length ?? 0, sent, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
