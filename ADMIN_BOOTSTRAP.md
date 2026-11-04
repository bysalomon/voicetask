# Secure administrator setup

1. Create a dedicated Supabase Auth user **manually in the trusted Auth admin console** with a strong, unique password; require verified email and MFA/TOTP before granting administrator capability.
2. In a privileged database console, execute `insert into public.user_roles(user_id,role) values('<verified-admin-user-uuid>','admin') on conflict do nothing;` substituting the placeholder only in the console, not in this repository.
3. Confirm the user has a verified MFA factor and can log in through `/admsalomon/login`.
4. Ensure ordinary members cannot insert `user_roles` or obtain `admin` access from editable user metadata.
5. Create a second recovery admin via a separate approved operator process and record an audit event.

Never store a permanent admin password in GitHub, migrations, screenshots or the browser bundle. Treat production admin provisioning as an audited manual operation. The ordinary user PIN is **not** an adequate admin password.
