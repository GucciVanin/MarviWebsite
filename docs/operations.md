# Operations: running Marvi for real

This is for whoever deploys and runs Marvi. The repository ships working **development** values so that everything runs locally
(`deploy/.env.example`, `appsettings.json`); none of them may reach a real deployment.

## 1. Secrets (MRV-3.3a)

The API image is Production by default, and **in Production it refuses to start** while a secret still holds an example or weak
value. It lists every problem at once, names the setting, and never prints a value. Settings are ASP.NET configuration keys; in a
container, set them as environment variables (`:` becomes `__`).

| What | Setting (environment variable) | Must be |
|---|---|---|
| JWT signing key | `Jwt:Key` (`Jwt__Key`) | at least 32 random characters, not an example (no "change-me", "dev-only", "placeholder") |
| First admin's e-mail | `Seed:AdminEmail` (`Seed__AdminEmail`) | a real address, not `@marvi.local` |
| First admin's password | `Seed:AdminPassword` (`Seed__AdminPassword`) | at least 12 characters, not an example. The admin is created only when both are set; after the first start you may remove both |
| Database password | `PGPASSWORD`, or `Password=` in `ConnectionStrings:AppDb` | at least 12 characters, not `marvi`, `postgres`, `password`... |
| Public address of the site | `Cors:AllowedOrigin` (`Cors__AllowedOrigin`) | the `https://` address of the site |

Generate secrets with a password manager or `openssl rand -base64 48`. Keep them in your platform's secret store (for example
Docker/Kubernetes secrets, a cloud key vault) and inject them as environment variables; never commit them. `deploy/.env` is
untracked on purpose.

**`Deployment:AllowExampleSecrets=true` switches the check off.** It exists only so the development compose file and the
runtime test suite can run the same image on the example values. **Do not set it in a real deployment.** If you do not use
`deploy/docker-compose.yml`, you do not need it.

To see the check work: start the API image with the example values and without that flag; it exits at once with
`Refusing to start in Production: ...`.
