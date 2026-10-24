-- Allow sold listings to retain their status in shared Supabase annotations.
alter table public.property_annotations
  drop constraint if exists property_annotations_flag_check;

alter table public.property_annotations
  add constraint property_annotations_flag_check
  check (flag in ('', 'Non interessante', 'Interessante', 'Da contattare', 'Contattato', 'Venduto'));
