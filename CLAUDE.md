# Flare — контекст проекта для Claude/Codex

## Что строим

AI second brain для фаундеров на ранней стадии. Пользователь закидывает заметки, URL, аудио, файлы — система сама находит паттерны и присылает инсайты без запроса. Целевая аудитория: США, 20–30 лет, pre-seed/seed.

Это **не RAG-чат**. Главная ценность — проактивные инсайты, которые приходят сами.

---

## Стек

- **Framework:** Next.js 16 + TypeScript, монолит в `flare_code/`
- **UI:** Tailwind v4 + shadcn/ui
- **DB:** PostgreSQL 16 + pgvector (Supabase), Drizzle ORM
- **Auth:** Supabase SSR Auth
- **Background jobs:** Inngest
- **AI:** Groq (llama-3.3-70b-versatile + whisper-large-v3-turbo), Voyage AI (embeddings, 1024d)
- **Email:** Resend
- **Deploy:** Vercel

**Цвета бренда:**
- Primary: `#0D9F6E`
- Surface: `#1A2620`
- Variant: `#5C6F65`
- Border: `#D8E2DC`
- Container: `#EEF2F0`

---

## Архитектура

### AI пайплайн (Inngest)
```
ingest-item → extract-text → chunk → embed → claims → mark-done → run-detectors
```
- Детектор `repeated-problem`: ≥5 items → Groq кластеризует claims → пишет инсайт
- Dedup инсайтов через `patternHash` (DB unique index)
- Аудио: Supabase Storage → Groq Whisper → текст → общий пайплайн

### API структура
- `/api/v1/items` — POST (text/url) + GET (list)
- `/api/v1/upload` — файлы
- `/api/v1/audio` — async транскрипция
- `/api/v1/transcribe` — sync транскрипция (для редактора)
- `/api/v1/vault` — semantic search + CRUD
- `/api/v1/insights` — список инсайтов
- `/api/auth/extension` — Chrome extension auth

---

## Лог изменений

### 2026-08-18
- **SSRF (High) закрыт** — `lib/ingestion/extract-text.ts`: DNS-pinning через `undici.Agent`, hostname резолвится один раз, TCP соединение закреплено за проверенным IP
- **CLAUDE.md создан** — зафиксированы архитектурные решения, правила безопасности, контекст проекта

---

## Техдолг

- `middleware.ts` устарел для Next.js 16
- `pnpm lint` выдаёт ошибки в `AccountModal`, `SidebarUIContext`
- Groq получает до 200 claims без пагинации по времени — будет расти
- Нет автотестов

---

## Безопасность

### ОБЯЗАТЕЛЬНО: проверка ownerId в каждом роуте

**RLS в этом проекте не защищает бэкенд-запросы.**

Бэкенд подключается через service-role (`BYPASSRLS`) — RLS политики в базе есть, но к бэкенд-запросам не применяются. Единственная защита от IDOR — ручная проверка в каждом запросе.

**Правило:** каждый новый роут ОБЯЗАН содержать фильтр по владельцу:

```typescript
where(eq(table.ownerId, user.id))
```

**Чеклист для каждого нового роута:**
- [ ] `auth.getUser()` вызван и проверен на ошибку
- [ ] Фильтр по ownerId есть в каждом SELECT / UPDATE / DELETE
- [ ] Нет запросов без WHERE по владельцу

Забытый фильтр = любой авторизованный пользователь читает чужие данные. База не подстрахует.

### SSRF защита (закрыто 2026-08-18)

`fetchUrlText` в `lib/ingestion/extract-text.ts` использует DNS-pinning через `undici.Agent`. Не менять логику резолвинга без понимания этого — защита от DNS rebinding атак.

---

## Решения, которые уже приняты (не переспрашивать)

- **Монолит, не turborepo** — сознательный выбор для скорости на MVP
- **Voyage AI для эмбеддингов** — 1024d, cosine similarity, threshold 0.4
- **Inngest для фоновых задач** — не переходить на другой queue без причины
- **RLS через service-role** — сознательный выбор, компенсируется ручными ownerId-проверками
