# Assignment & Deadline Tracker

The main TypeScript/NestJS project for the SIWES portfolio — the backend for a
tool that gives students one place to track everything due across their courses.
Users create or join courses, add deadlines (assignments, exams, milestones)
with a checklist and priority, and get reminders before each one is due. A
dashboard rolls up what is upcoming and overdue.

It is a REST API built on NestJS 11 and Prisma 7 over PostgreSQL, with
email/password and Google OAuth authentication, JWT access/refresh tokens,
request throttling, and a scheduled job that dispatches reminders.

## Stack

- **NestJS 11** — modules, controllers, providers, guards, interceptors, filters
- **Prisma 7** over **PostgreSQL** — schema split across `prisma/`, migrations in `prisma/migrations/`
- **Passport** — JWT strategy (access + refresh) and Google OAuth 2.0
- **@nestjs/schedule** — cron job for reminder dispatch
- **@nestjs/throttler** — global rate limiting (20 requests / 60s)
- **Joi** — startup validation of environment variables
- **Jest** + **supertest** — unit and end-to-end tests
- **pnpm** — package manager

## Configuration

There is no `.env.example`; create `.env` in the project root with:

| variable | meaning |
| --- | --- |
| `PORT` | HTTP port (default `8000`) |
| `NODE_ENV` | `development`, `production`, or `test` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_ACCESS_EXPIRES_IN` | access-token signing key and lifetime (e.g. `15m`) |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` | refresh-token signing key and lifetime (e.g. `7d`) |
| `FRONTEND_URL` | base URL of the web client (used in OAuth redirects) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth credentials |
| `CORS_ORIGINS` | JSON array of allowed origins, e.g. `["http://localhost:3000"]` |

The app validates these on boot and refuses to start if any are missing or
malformed. For the e2e tests, add a `.env.test` with the same keys pointing at a
separate throwaway database.

## Setup

```bash
pnpm install
pnpm prisma format            # tidy the schema files
pnpm prisma validate          # check the schema is valid
pnpm prisma migrate dev       # apply prisma/migrations to the database
pnpm prisma generate          # (re)build the Prisma client
```

`migrate dev` already runs `generate` at the end, so that last step is
belt-and-suspenders here — but keeping it means the same routine still works with
`migrate deploy` (production), which does not generate the client.

## Running

```bash
pnpm run start:dev            # watch mode
pnpm run start                # one-off
pnpm run start:prod           # run the compiled build (after pnpm run build)
```

The API listens on `http://localhost:8000` by default.

## Tests

```bash
pnpm run test                 # unit tests (*.spec.ts under src/)
pnpm run test:cov             # unit tests with coverage
NODE_ENV=test pnpm run test:e2e   # end-to-end tests (test/*.e2e-spec.ts)
```

The e2e suite boots the real application with the same pipes, filters, and
interceptors as `main.ts` and runs against the `.env.test` database. Each spec
file wipes all tables before it runs, so point it at a database you do not mind
losing. Setting `NODE_ENV=test` is what makes the app load `.env.test` instead
of `.env`.

## Project structure

```
deadline-tracker/
├── prisma/
│   ├── schema.prisma          # datasource + generator
│   ├── enums.prisma           # shared enums
│   ├── models/                # one file per model (user, course, deadline, …)
│   └── migrations/            # migration history
└── src/
    ├── main.ts                # bootstrap: helmet, CORS, global pipe/filter/interceptors
    ├── app.module.ts          # config, throttler, schedule, feature modules
    ├── config/                # env loading (configuration.ts) + Joi validation
    ├── common/                # response envelope, exception filter, throttler guard, pagination
    ├── prisma/                # PrismaModule + PrismaService
    ├── auth/                  # signup, OTP verify, login, password reset, Google OAuth, JWT
    ├── users/                 # profile, password change, reminder-channel preferences, logout
    ├── courses/               # create/join courses, membership, roles (owner/member)
    ├── deadlines/             # deadlines CRUD + checklist items
    ├── dashboard/             # upcoming / overdue rollup
    └── reminders/             # notifications endpoints + cron-driven reminder dispatch
```

## API surface

All responses are wrapped in a consistent envelope:

```json
{ "status": "success", "message": "Request successful.", "data": {}, "error": null }
```

Errors use the same shape with `status: "error"` and an `error` object
(`{ code, detail }`). Validation failures return `code: "VALIDATION_ERROR"` with
a per-field breakdown.

| area | routes |
| --- | --- |
| `auth` | `POST /auth/signup`, `/verify-otp`, `/resend-otp`, `/forgot-password`, `/reset-password`, `/login`, `/refresh-token`; `GET /auth/google/login`, `/auth/google/callback` |
| `users` | `GET /users/get-profile`; `PATCH /users/update-profile`, `/reminder-preferences`; `POST /users/change-password`, `/logout` |
| `courses` | `POST /courses`, `/courses/join`; `GET /courses`, `/courses/:id`, `/courses/:id/members`; `PATCH /courses/:id`; `DELETE /courses/:id` |
| `deadlines` | `POST /deadlines`, `/deadlines/:id/checklist`; `GET /deadlines`, `/deadlines/:id`; `PATCH /deadlines/:id`; `DELETE /deadlines/:id` |
| `checklist` | `PATCH /checklist/:id`; `DELETE /checklist/:id` |
| `dashboard` | `GET /dashboard` |
| `notifications` | `GET /notifications`; `PATCH /notifications/read-all`, `/notifications/:id` |

## Data model

- **User** — email/password or Google account, profile fields, refresh-token hash, default reminder channels
- **Course** — name, code, term, colour, unique join code, an owner and `CourseMember`s (`OWNER` / `MEMBER`)
- **Deadline** — belongs to a course; type (`ASSIGNMENT` / `EXAM` / `MILESTONE`), `dueAt`, priority, optional `completedAt`
- **ChecklistItem** — ordered sub-tasks under a deadline
- **Reminder** — per user, per deadline, at an offset before `dueAt`, on a channel (`IN_APP` / `EMAIL`); a cron job runs every 5 minutes, marks due ones `sentAt`, and (for `EMAIL`) logs a stub email to the console
- **VerificationToken** — one-time codes for email verification and password reset
