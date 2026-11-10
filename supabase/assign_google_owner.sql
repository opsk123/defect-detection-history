-- Trusted SQL Editor only. Replace with the Google email confirmed by opsk123.
-- Run after this Google account has signed in once. Never ship this as a client RPC.
do $$
declare owner_email text := '__OWNER_GOOGLE_EMAIL__'; owner_id uuid;
begin
 if owner_email='__OWNER_GOOGLE_EMAIL__' then raise exception 'Set the verified repository owner Google email first'; end if;
 select u.id into strict owner_id from auth.users u
 where lower(u.email)=lower(owner_email) and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 insert into public.accc_web_admin(singleton,user_id,github_owner) values(true,owner_id,'opsk123')
 on conflict(singleton) do update set user_id=excluded.user_id,github_owner=excluded.github_owner;
end; $$;
