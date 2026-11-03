/** App data lives in Neon. Same shape as the old admin client so existing code keeps its types. */
import { neonDb } from "./neon-client.server";
type Legacy = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
export const supabaseAdmin = neonDb as unknown as Legacy;
