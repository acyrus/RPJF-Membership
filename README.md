# RPJF Membership

Church membership app for Righteousness Peace and Joy Fellowship (Trinidad & Tobago).
React 18 + Vite 5 + Supabase, hosted on Vercel.

The application lives in [`church-app-v2/`](church-app-v2/).

## Run it locally

```bash
cd church-app-v2
npm install
cp .env.example .env      # then fill in your Supabase URL and anon key
npm run dev               # http://localhost:5173
```

`npm run build` produces the production bundle; Vercel runs this on every push.

## Environment variables

Set these in `church-app-v2/.env` for local dev, and in the Vercel project settings for
deployment:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

## Branches and deployment

- Work on **`staging`**; open a pull request to merge into **`main`**.
- **`main`** is production and deploys to Vercel automatically.
- Loop: `git status` -> `git add -A` -> `git commit -m "..."` -> `git push`.

## Database

`church-app-v2/supabase_setup.sql` is the full schema for a fresh project. The
`supabase_migration_*.sql` files are applied by hand in the Supabase SQL editor for an
existing database. See `CLAUDE.md` for the migration inventory and architecture notes.

## More docs

- `DEPLOY-GUIDE.md` — step-by-step deploy walkthrough for PowerShell.
- `ROADMAP.md` — prioritized development roadmap.
- `CLAUDE.md` — detailed working notes (architecture, auth, migrations, gotchas).
