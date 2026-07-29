import { createClient } from '@supabase/supabase-js'

// Dashboard's Data API field may include `/rest/v1`; supabase-js expects the
// project origin and adds API paths itself.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/rest\/v1\/?$/, '')
// `anon` is supported for existing Supabase projects. New projects expose a
// publishable key instead, so prefer it when it is available.
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
