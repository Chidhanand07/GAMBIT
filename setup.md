# Gambit (formerly Chessia) - Setup Guide

This document provides a highly structured, step-by-step guide to installing, configuring, and running the Gambit chess platform locally. 

---

## 1. Prerequisites

Before you begin, ensure your system has the following installed:
- **Node.js** (v18.0.0 or higher) & **npm**
- **Python** (v3.10 or higher) & **pip**
- **Supabase Account**: You will need a cloud project on [Supabase](https://supabase.com/).

---

## 2. Supabase Configuration (Database & Auth)

Gambit relies heavily on Supabase for data, real-time sync, and authentication.

1. **Create Project:** Go to your Supabase dashboard and create a new project.
2. **Execute Migrations:**
   - Open the Supabase **SQL Editor**.
   - Run each migration file **in order** by copying its contents and clicking **Run**:
     1. `supabase/migrations/00001_initial_schema.sql` — tables, indexes, initial RLS
     2. `supabase/migrations/00002_profile_fields.sql` — extended profile columns
     3. `supabase/migrations/00003_rls_policies.sql` — additional policies
     4. `supabase/migrations/00010_fix_rls.sql` — **required**: drops duplicate policies that cause signup to fail with RLS errors, then recreates them cleanly
3. **Enable Realtime:**
   - Go to **Database** -> **Replication** -> **Tables** (or via Table Editor settings).
   - Ensure "Realtime" is toggled **ON** for these tables: `games`, `moves`, `messages`, `notifications`, `profiles`.
4. **Gather Credentials:**
   - Go to **Project Settings** -> **API**.
   - Copy your **Project URL** (`SUPABASE_URL`), **anon public key** (`SUPABASE_ANON_KEY`), and **service_role secret key** (`SUPABASE_SERVICE_KEY`). Keep these safe.

---

## 3. Environment Variable Setup

The platform uses a unified `.env.example` to ease configuration. You need to distribute these environment variables to the respective microservices.

### A. Root Level
1. Copy or rename `.env.example` to `.env` in the root `Gambit` folder for reference.

### B. Frontend (`Gambit/frontend/`)
1. Create a file named `.env.local` inside `Gambit/frontend/`.
2. Add the following keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL="<your_supabase_url>"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="<your_supabase_anon_key>"
   NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
   SUPABASE_SERVICE_ROLE_KEY="<your_supabase_service_role_key>"
   ```
   > **Note:** `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix — it is only used in Server Actions and is never exposed to the browser. This key is required for the signup flow to create user profiles.

### C. Node Server (`Gambit/server/`)
1. Create a file named `.env` inside `Gambit/server/`.
2. Add the following keys:
   ```env
   PORT=3001
   SUPABASE_URL="<your_supabase_url>"
   SUPABASE_SERVICE_KEY="<your_supabase_service_key>"
   GAMBIT_ENGINE_URL="http://127.0.0.1:8001"
   FRONTEND_URL="http://localhost:3000"
   ```

### D. Python Engine (`Gambit/chess-engine/`)
1. Create a file named `.env` inside `Gambit/chess-engine/`.
2. Add the following keys:
   ```env
   PORT=8001
   SUPABASE_URL="<your_supabase_url>"
   SUPABASE_SERVICE_KEY="<your_supabase_service_key>"
   ```

---

## 4. Installing Dependencies

You must install dependencies for all three layers: the Root Orchestrator, the Node Server, and the Python Engine.

Open your terminal in the `Gambit` root directory:

**Step 1: Node & Frontend Dependencies**
```bash
# This uses the root package.json helper script to install root, server, and frontend node_modules automatically
npm run install:all
```

**Step 2: Python Engine Dependencies**
```bash
# Navigate to engine
cd chess-engine

# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install the required pip packages (including Stockfish bindings)
pip install -r requirements.txt

# Return to root directory
cd ..
```

---

## 5. Running the Application

Gambit uses the `concurrently` package to launch all three microservices directly from the root folder in a single command. 

Ensure your Python virtual environment remains active in that terminal session (if you used one). From the `Gambit` root directory:

```bash
npm run dev
```

This single command will boot:
1. The **FastAPI Engine** via `uvicorn` on port `8001`.
2. The **Node Server** via `node` on port `3001`.
3. The **Next.js Frontend** via `next dev` on port `3000`.

**Success!** You can now access the full Gambit platform by opening [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 6. (Optional) Testing Local Connectivity
If you want to verify that all the internal ports and health metrics are communicating correctly across the stack, open a second terminal inside `Gambit` and run:

```bash
chmod +x scripts/test-deployment.sh
./scripts/test-deployment.sh
```

A console output of `PASS` ensures your backend logic gates are fully active!
