# Updating the testing environment — step by step

A plain-English walkthrough for pushing changes to **staging** (your testing site) using
PowerShell on Windows. Follow it top to bottom. Every command is safe to copy and paste.

**The short version:** fix the lock file → tell Git who you are → check what changed →
save it → send it up → run the SQL → test it. Then, when happy, promote to production.

---

## Before you start — one-time cleanup

There is a leftover lock file that will block Git until you delete it. You only need to do
this once.

### Step 0 — Remove the stale lock file

Open PowerShell and run:

```powershell
cd C:\Users\cyrus\dev\RPJF-Membership
Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
```

> **Why:** a tool left a zero-byte `index.lock` behind. Git creates that file while it works
> and deletes it when done — if it's still there, Git assumes another Git is running and
> refuses to start. Deleting it is safe when no Git command is actually running.

If you ever see `Unable to create index.lock: File exists`, this is the fix.

### Step 1 — Tell Git who you are

Git stamps your name and email on every save. Set them once:

```powershell
git config --global user.name "Ariel Cyrus"
git config --global user.email "cyrusariel@gmail.com"
```

Check it worked:

```powershell
git config --global user.name
git config --global user.email
```

> Use the same email as your GitHub account, otherwise your commits won't be linked to your
> GitHub profile.

---

## Every time you want to push changes

### Step 2 — Go to the project and confirm you're on `staging`

```powershell
cd C:\Users\cyrus\dev\RPJF-Membership
git branch
```

You'll see a list with a `*` next to the branch you're on. It should be `* staging`.

If it isn't, switch:

```powershell
git checkout staging
```

> **Never work directly on `main`.** `main` is the live site your church actually uses.
> `staging` is the testing copy — that's where changes go first.

### Step 3 — See what changed

```powershell
git status
```

This lists modified files. **Expect it to look alarming** — this repo will often show
*every* file as modified because of a line-endings quirk. To see what genuinely changed:

```powershell
git diff --ignore-all-space --stat
```

That second command is the honest one. If it lists ~10 files, ten files really changed. If
`git status` showed 28 but this shows 10, the other 18 are noise — ignore them.

### Step 4 — Test it locally first

Before sending anything up, make sure it actually builds:

```powershell
cd church-app-v2
npm install
npm run build
```

If you see `✓ built in ...`, you're good. If you see errors in red, **stop** — pushing now
would break the testing site. Fix the errors first.

To poke at it in a browser before pushing:

```powershell
npm run dev
```

Then open the address it prints (usually `http://localhost:5173`). Press `Ctrl+C` in
PowerShell to stop it.

```powershell
cd ..
```

> That last line walks you back up to the repo root, where the Git commands belong.

### Step 5 — Stage your changes

```powershell
git add -A
```

> **What "staging" means here:** confusingly, Git's "staging area" has nothing to do with
> your `staging` branch. `git add` just marks which changes go into the next save. `-A`
> means "all of them."

### Step 6 — Save the changes with a message

```powershell
git commit -m "Describe what you changed here"
```

Write the message so it makes sense to you in six months. Good: `"Fix edit modal appearing
behind detail panel on mobile"`. Less good: `"updates"` or `"fixes"`.

### Step 7 — Send it to GitHub

```powershell
git push
```

If Git complains that the branch has no upstream, use this instead (first time only):

```powershell
git push -u origin staging
```

Vercel notices the push and builds a preview of the testing site automatically. It usually
takes about a minute.

---

## Step 8 — Run any database migrations

Code changes alone aren't always enough. If a change needs a new database column, there'll
be a `.sql` file that has to be run **by hand**, once, before the feature works.

1. Go to your Supabase project → **SQL Editor** → **New query**
2. Open the `.sql` file from `church-app-v2\` in a text editor
3. Copy the whole thing, paste it in, press **Run**

**Outstanding right now:**

| File | What it does | Run yet? |
|---|---|---|
| `supabase_migration_tab_access.sql` | Lets admins set each user's tabs individually | ❌ **Not yet — do this** |
| `supabase_migration_rosters.sql` | Roster tables for the usher Roster tab | ✅ |
| `supabase_migration_require_2fa.sql` | Per-account 2FA toggle | ✅ |
| `supabase_migration_usher_services.sql` | Ushers can create attendance services | ✅ |
| `supabase_migration_single_session.sql` | Old one-device-at-a-time rule (now unused) | ✅ |

> Until `tab_access` is run, the new **Tabs** button on the Users page will appear to work
> but silently save nothing, and everyone keeps their role's normal tabs. It fails quietly
> rather than showing an error, so it's easy to think it's broken when it just needs the SQL.

These are safe to run twice — they check whether the change already exists first.

---

## Step 9 — Test on the testing site

Open the Vercel preview URL for the `staging` branch and check the things you changed. For
this round specifically:

- [ ] On a **phone**, open Members → tap a member → tap **Edit**. The edit form should cover
      the whole screen. The member's details should *not* show through on top of it.
- [ ] Members → edit someone → Skills. Pick a skill, then open the second dropdown — that
      same skill should be greyed out and unpickable.
- [ ] Ministries → check **Youth Worship Team** appears in the list.
- [ ] Users → **Tabs** on any user → untick a tab → Save. Log in as them and confirm the tab
      is gone. *(Needs the SQL from Step 8 first.)*
- [ ] Log in as the same person on your phone and laptop at once — both should stay logged
      in, with no "signed out on another device" message.

---

## Step 10 — Promote to production, when you're happy

Only once staging looks right. Do this **on GitHub in your browser**, not PowerShell:

1. Go to your repository on GitHub
2. Click **Pull requests** → **New pull request**
3. Set **base: `main`** ← **compare: `staging`**
4. Click **Create pull request**, then **Merge**

Vercel deploys `main` to the live site automatically.

> **Run your migrations on the production database too.** Staging and production are separate
> Supabase databases. A migration you ran for testing has *not* been applied to the live one.

---

## If something goes wrong

**"Unable to create index.lock: File exists"**

```powershell
Remove-Item .git\index.lock -Force
```

**You want to throw away local changes and start clean**

```powershell
git checkout -- church-app-v2
```

⚠️ This permanently deletes uncommitted edits. Only run it when you're sure you want the last
saved version back.

**`git status` says everything changed and you didn't touch anything**

That's the line-endings quirk. Check the truth with:

```powershell
git diff --ignore-all-space --stat
```

**The build fails after you pulled someone else's changes**

Dependencies probably changed:

```powershell
cd church-app-v2
npm install
npm run build
```

**You want to see what you're about to push**

```powershell
git log origin/staging..staging --oneline
```

Lists the saves that exist locally but haven't been sent up yet.

---

## The whole thing, once you're comfortable

```powershell
cd C:\Users\cyrus\dev\RPJF-Membership
git checkout staging
cd church-app-v2; npm run build; cd ..
git add -A
git commit -m "What I changed"
git push
```

Then run any new `.sql` in Supabase, and check the Vercel preview.
