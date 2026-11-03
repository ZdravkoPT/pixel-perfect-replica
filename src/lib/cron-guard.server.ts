import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Lets automatic jobs be started either by the existing Cloud schedules or by a free
 * outside scheduler (GitHub Actions) that sends the shared CRON_SECRET header.
 */
export async function authenticateJob(request: Request): Promise<Response | null> {
  const secret = process.env["CRON_SECRET"];
  const given = request.headers.get("x-cron-secret");
  if (secret && given && secret.length >= 32 && given.length === secret.length) {
    let diff = 0;
    for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff === 0) return null;
  }
  return authenticateCronRequest(request) as Promise<Response | null>;
}
