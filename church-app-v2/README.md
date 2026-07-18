# ✝ Church Connect — Free Deployment Guide
## Supabase (database + auth) + Vercel (hosting) = $0/month

---

## Overview

| Service | What it does | Cost |
|---|---|---|
| Supabase | Database (PostgreSQL) + Authentication | Free |
| Vercel | Hosts the React app | Free |
| GitHub | Stores the code (required for Vercel) | Free |

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click **New Project**
3. Choose a name (e.g. `church-connect`), set a database password, pick the region closest to you
4. Wait ~2 minutes for it to provision

---

## Step 2 — Run the Database Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Copy the entire contents of **`supabase_schema.sql`** and paste it in
4. Click **Run** (the green button)
5. You should see: "Success. No rows returned"

---

## Step 3 — Create Your First Admin Account

### 3a. Create the login
1. In Supabase, go to **Authentication → Users**
2. Click **Add user → Create new user**
3. Enter your email and a password
4. Click **Create user**
5. Copy the **UUID** shown (looks like `a1b2c3d4-...`)

### 3b. Give them the admin role
1. Go to **Table Editor → profiles**
2. Click **Insert row**
3. Fill in:
   - `id` → paste the UUID from above
   - `name` → Your Name
   - `role` → `admin`
4. Click **Save**

That's your admin account. You can now log in.

---

## Step 4 — Get Your Supabase Keys

1. Go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (long string starting with `eyJ...`)

---

## Step 5 — Push Code to GitHub

```bash
# In the church-connect folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com (call it church-connect), then:
git remote add origin https://github.com/YOUR_USERNAME/church-connect.git
git push -u origin main
```

---

## Step 6 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (use GitHub login)
2. Click **Add New → Project**
3. Select your `church-connect` GitHub repo
4. Click **Environment Variables** and add:
   ```
   VITE_SUPABASE_URL        = https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY   = eyJ...your-anon-key...
   ```
5. Click **Deploy**

Vercel will build and deploy. In ~2 minutes you'll get a live URL like:
`https://church-connect.vercel.app`

---

## Step 7 — Adding More Users (Ushers / Admins)

For each new user:

### In Supabase Dashboard:
1. **Authentication → Users → Add user → Create new user**
   - Enter their email + a temporary password
   - Copy their UUID

2. **Table Editor → profiles → Insert row**
   - `id` = their UUID
   - `name` = their name
   - `role` = `usher` (or `admin`)

3. Tell them to log in at your Vercel URL with the email/password you set

### Password resets:
- Go to **Authentication → Users**, find the user, click the ⋯ menu → **Send password recovery**
- Or use the "Reset Password" button in the app's Users tab (sends a reset email)

---

## What Ushers Can Do vs Admins

| Feature | Usher | Admin |
|---|---|---|
| View members | ✅ | ✅ |
| Take attendance | ✅ | ✅ |
| Add/edit/delete members | ❌ | ✅ |
| Create service sessions | ❌ | ✅ |
| Manage user accounts | ❌ | ✅ |

---

## Free Tier Limits (Supabase)

| Limit | Value | Your church's usage |
|---|---|---|
| Database storage | 500 MB | ~1 MB per 1,000 members |
| Monthly active users | 50,000 | More than enough |
| API requests | Unlimited | ✅ |
| Projects | 2 | You need 1 |
| **Inactivity pause** | **1 week** | Won't happen — used weekly |

---

## Local Development (Optional)

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase URL and anon key

# Run locally
npm run dev
```

Open http://localhost:5173

---

## File Structure

```
church-connect/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx        # Sign-in screen
│   │   ├── MembersPage.jsx      # Member database
│   │   ├── AttendancePage.jsx   # Attendance tracking
│   │   ├── RolesPage.jsx        # Ministry overview
│   │   └── UsersPage.jsx        # User management (admin)
│   ├── App.jsx                  # Auth + routing
│   ├── supabase.js              # Supabase client
│   ├── components.jsx           # Shared UI components
│   └── styles.css
├── supabase_schema.sql          # ← Run this in Supabase SQL Editor
├── .env.example                 # ← Copy to .env and fill in
├── vercel.json                  # Routing config for Vercel
└── README.md
```
