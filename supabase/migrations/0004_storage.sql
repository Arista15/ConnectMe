-- Pièces justificatives (photos de reçus, PDF) : bucket privé, rangé par site
-- Chemin : <site_id>/<annee>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces', 'pieces', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy "pieces_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'pieces' and public.has_site_access(((storage.foldername(name))[1])::uuid));

create policy "pieces_depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces' and public.has_site_access(((storage.foldername(name))[1])::uuid));
