-- Libera o ADM autenticado para excluir avisos
drop policy if exists "notices delete" on public.notices;

create policy "notices delete"
on public.notices
for delete
to authenticated
using (true);
