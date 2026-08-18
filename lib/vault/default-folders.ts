// Every workspace gets these seeded on creation (see app/api/v1/workspaces/route.ts and the
// backfill in supabase/migrations/20260816_folders.sql). Users can add any number of
// additional custom folders on top of this base set.
export const DEFAULT_FOLDERS = ['Ideas', 'Research', 'Sources', 'People & Customers', 'Journal', 'Tasks'] as const
