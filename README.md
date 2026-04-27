# Intellix

Intellix is a full-stack AI chat application with:
- A React + Vite frontend
- An Express backend
- Supabase for persistence
- Clerk for authentication
- Mistral for chat + OCR over uploaded documents

Users can create chats, upload files (`.pdf`, `.doc`, `.docx`, `.txt`), and ask questions grounded in uploaded content.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Clerk
- Backend: Node.js, Express, Multer
- Database: Supabase
- AI/OCR: Mistral (`ministral-14b-2512`, `mistral-ocr-latest`)

## Prerequisites

- Node.js `20.x` (recommended, backend enforces this)
- npm (comes with Node)
- A Supabase project
- A Clerk application
- A Mistral API key

## Supabase Setup (Required Tables)

No migration files are currently included in this repo, so create tables manually in your Supabase project.

Minimum tables expected by the backend:
- `profiles` (`id`, `clerk_id`, `name`, `email`, `image_url`)
- `chats` (`id`, `user_id`, `clerk_id`, `title`, `created_at`)
- `chat_files` (`id`, `chat_id`, `file_name`, `content`, `created_at`)
- `messages` (`id`, `chat_id`, `role`, `content`, `created_at`)

Query to create these tables. (Paste the query in supabase sql query editor)
```
 -- Needed for gen_random_uuid()
  create extension if not exists "pgcrypto";

  -- 1) User profiles
  create table if not exists public.profiles (
    id uuid primary key default gen_random_uuid(),
    clerk_id text not null unique,
    name text,
    email text,
    image_url text,
    created_at timestamptz not null default now()
  );

  -- 2) Chats
  create table if not exists public.chats (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    clerk_id text not null,
    title text not null default 'New Chat',
    created_at timestamptz not null default now()
  );

  -- 3) Uploaded files per chat
  create table if not exists public.chat_files (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats(id) on delete cascade,
    file_name text not null,
    content text not null,
    created_at timestamptz not null default now()
  );

  -- 4) Chat messages
  create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null,
    created_at timestamptz not null default now()
  );

  -- Helpful indexes for your current queries
  create index if not exists idx_chats_clerk_id on public.chats(clerk_id);
  create index if not exists idx_chat_files_chat_id on
  public.chat_files(chat_id);
  create index if not exists idx_messages_chat_id on public.messages(chat_id);

  -- Your backend currently uses Supabase anon/publishable key from server code.
  -- To make this work quickly with current code, disable RLS:
  alter table public.profiles disable row level security;
  alter table public.chats disable row level security;
  alter table public.chat_files disable row level security;
  alter table public.messages disable row level security;

```

Notes:
- `profiles.clerk_id` should be unique (used for upsert).
- `created_at` columns should default to current timestamp.

## Local Setup

Run the app in two terminals:

Terminal 1 (backend):

```bash
cd backend
npm install
node src/index.js
```

Terminal 2 (frontend):

```bash
cd frontend
npm install 
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Available Scripts

### Backend (`backend/package.json`)

- `node src/index.js` -> start backend (`src/index.js`)
- `npm start` -> start backend (`src/index.js`)

### Frontend (`frontend/package.json`)

- `npm run dev` -> start Vite dev server
- `npm run build` -> production build
- `npm run preview` -> preview production build
- `npm run lint` -> run ESLint

## API Overview

Main backend routes:

- `POST /api/user` -> create/update profile
- `POST /api/chats` -> create chat
- `GET /api/chats/:clerkId` -> list chats
- `PATCH /api/chats/:chatId/title` -> update chat title
- `GET /api/messages/:chatId` -> list messages
- `POST /api/messages` -> save message
- `GET /api/files/:chatId` -> list uploaded files
- `POST /api/upload` -> upload + OCR document
- `DELETE /api/files/:fileId` -> delete file record
- `POST /api/chat` -> generate assistant response