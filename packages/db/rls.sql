-- Row-level security: the database-layer braces under the application-layer belt.
-- Kept as readable SQL (not in the Drizzle schema) because policies are SECURITY,
-- not shape, and deserve to be read in one place. Applied by migrate.ts AFTER the
-- Drizzle migrations. Idempotent: safe to run on every migrate.

-- The application role: LOGIN, no BYPASSRLS, not a table owner -> RLS actually
-- applies to it. The app connects as forge_app; migrations/seed connect as the owner
-- (which is exempt from RLS unless FORCE is set, so seeding is unfiltered).
do $$
begin
  if not exists (select from pg_roles where rolname = 'forge_app') then
    create role forge_app login password 'forge_app';
  end if;
end $$;

grant usage on schema public to forge_app;
grant select, insert, update, delete on all tables in schema public to forge_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to forge_app;

-- Enable RLS on every tenant-owned table.
alter table app_item enable row level security;
alter table document_chunk enable row level security;

-- The tenant policy. current_setting('forge.org_id', true) returns NULL when the GUC
-- is unset; nullif(..., '') also maps an empty value to NULL; NULL::uuid compared to
-- org_id is NULL -> the row is excluded. So a query with NO tenant set returns ZERO
-- rows (fail closed), never all rows. WITH CHECK applies the same rule to INSERT and
-- UPDATE, so a write cannot attribute a row to another org (write-path contamination).
drop policy if exists app_item_tenant on app_item;
create policy app_item_tenant on app_item
  using (org_id = nullif(current_setting('forge.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('forge.org_id', true), '')::uuid);

drop policy if exists document_chunk_tenant on document_chunk;
create policy document_chunk_tenant on document_chunk
  using (org_id = nullif(current_setting('forge.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('forge.org_id', true), '')::uuid);

-- HNSW index for cosine similarity on the tenant-scoped embedding column.
create index if not exists document_chunk_embedding_hnsw
  on document_chunk using hnsw (embedding vector_cosine_ops);
