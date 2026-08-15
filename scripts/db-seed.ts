// Seeds (or reseeds) the Supabase corridor store from data/seed-data.json —
// the same reset_corridor RPC the app's /api/reset uses, so there is exactly
// one seeding path. The capture trail is never touched.
//
//   npm run db:seed        (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//                           from .env.local; run after `supabase db push`)
import { createClient } from "@supabase/supabase-js";
import { loadSeed } from "../lib/seed.ts";
import { readSupabaseEnv } from "../lib/supabase-env.ts";

let url: string;
let key: string;
try {
  ({ url, key } = readSupabaseEnv());
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const seed = loadSeed();

const { error } = await client.rpc("reset_corridor", {
  seed_claims: seed.claims,
  seed_rules: seed.rules,
});
if (error) {
  console.error(`reset_corridor failed: ${error.message}`);
  process.exit(1);
}

console.log(
  `Seeded corridor gb-ua-pl: ${seed.claims.length} claims, ${seed.rules.length} rules.`,
);
