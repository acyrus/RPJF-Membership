import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(url, key);

// Exposed so a throwaway client can verify a password without disturbing the main
// session (see SecurityModal's current-password check). Don't use these to make a
// second *persistent* client — that would fight over the auth token in storage.
export const supabaseUrl = url;
export const supabaseAnonKey = key;
