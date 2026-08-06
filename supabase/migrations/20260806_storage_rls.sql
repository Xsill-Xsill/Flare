-- Bucket "uploads" хранит файлы по пути <workspace_id>/<filename>.
-- Бакет приватный, поэтому нужны явные policy на чтение/запись владельцем workspace.

CREATE POLICY "owner_upload_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );

CREATE POLICY "owner_upload_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );
