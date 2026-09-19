# Building Management System API

NestJS backend for construction project, workforce, attendance, payroll, inventory, chat, and activity management.

## Overview

The API supports three roles:

- `ADMIN`: global administration, invitations, projects, audit feed, and payment reversal.
- `SITE_MANAGER`: manages assigned projects and their workforce operations.
- `WORKER`: accesses personal workforce data and the currently assigned project.

There is no public signup. New users are created through an Admin invitation and token-based acceptance flow.

## Tech Stack

- NestJS 11
- TypeScript
- Prisma ORM 6
- MongoDB
- JWT and Bcrypt authentication
- Swagger/OpenAPI
- Class Validator and global validation pipes
- Helmet, CSRF protection, CORS, and throttling
- REST chat endpoints with Socket.io available for future real-time integration

## Project Structure

```text
prisma/
  schema.prisma              # MongoDB Prisma schema
src/
  app/                       # Root module and health controller
  common/                    # Guards, decorators, filters, pipes, and utilities
  config/                    # Environment-backed configuration
  core/services/
    activity/                # ActivityLog and project system-message writer
    email/                   # Email delivery integrations
    prisma/                  # PrismaService and seeders
    stripe/                  # Stripe integration foundation
  modules/
    auth/                    # Login, invite acceptance, password and OTP flows
    invite/                  # Admin invitation management
    profile/                 # Current user profile
    project/                 # Projects, rates, budget summary, activity feed
    worker/                  # Worker profiles, assignment, withdrawals, earnings
    attendance/              # Manager attendance, bulk marking, self-check-in
    task/                    # Tasks, assignments, comments, Kanban listing
    daily-report/            # Daily project reports
    expense/                 # Expenses and approval flow
    material/                # Inventory, requests, purchases, and usage
    payment/                 # Internal worker payment records
    leave/                   # Leave requests and approval
    chat/                    # REST direct and project group chat
```

## Requirements

- Node.js 20 or newer recommended
- npm
- MongoDB database
- Environment variables configured in `.env`

## Installation

```bash
npm install
npx prisma generate
```

Set at least the database and authentication values in `.env`:

```env
DATABASE_URL="mongodb://localhost:27017/building-management-system"
JWT_SECRET="replace-me"
JWT_SECRET_EXPIRES_IN="1d"
REFRESH_TOKEN_SECRET="replace-me-too"
REFRESH_TOKEN_EXPIRES_IN="7d"
PORT=5000
NODE_ENV=development
```

Use the names and additional provider settings defined by `src/config/index.ts` for email, storage, Stripe, and frontend integrations.

## Running

```bash
# Development with watch mode
npm run dev

# Production build and start
npm run build
npm run start:prod
```

The API uses the global prefix `/api/v1`.

- Health check: `GET /`
- Swagger UI in non-production: `http://localhost:5000/api/v1`
- API base URL: `http://localhost:5000/api/v1`

## Database and Seeders

The Prisma schema is at `prisma/schema.prisma` and uses MongoDB.

```bash
npx prisma generate
npm run db:seed
```

The database contains users, invitations, projects, worker profiles, rates, attendance, leave requests, tasks, reports, expenses, materials, payments, withdrawals, chat rooms/messages, and activity logs.

## API Modules

All protected routes require a JWT bearer token unless otherwise noted.

### Authentication and Invitations

- `POST /auth/login`
- `POST /auth/accept-invite`
- Password reset, OTP, refresh-token, and password-management routes
- `POST /invites` and invite management routes for Admins

### Projects and Rates

- `GET|POST /projects`
- `GET|PATCH|DELETE /projects/:id`
- `GET /projects/:id/budget-summary`
- `GET /projects/:id/activity`
- `GET|POST /projects/:projectId/rates`

Project activity and budget access are scoped by role.

### Workers, Attendance, and Leave

- `GET|PATCH /workers/:id`
- `POST /workers/:id/assign`
- `POST /workers/:id/unassign`
- `POST|GET /workers/:id/withdraws`
- `PATCH /workers/:id/withdraws/:withdrawId/review`
- `GET /workers/:id/earnings?from=&to=`
- `POST /attendances/mark`
- `POST /attendances/bulk`
- `POST /attendances/self-checkin`
- `PATCH /attendances/:id/verify`
- `POST /leaves`
- `GET /leaves` and `GET /leaves/:id`
- `PATCH /leaves/:id/review`

Approved leave requests create or update attendance records with status `Leave`, so leave dates are excluded from payable attendance earnings.

### Tasks and Reports

- `GET|POST /tasks`
- `GET|PATCH|DELETE /tasks/:id`
- `GET /tasks?kanban=true`
- `POST|DELETE /tasks/:id/assign`
- `POST|GET /tasks/:id/comments`
- `GET|POST /daily-reports`
- `GET|PATCH|DELETE /daily-reports/:id`

### Expenses and Materials

- `GET|POST /expenses`
- `GET|PATCH|DELETE /expenses/:id`
- `PATCH /expenses/:id/review`
- `GET|POST|PATCH /materials`
- `POST /materials/:id/purchases`
- `POST /materials/:id/usages`
- `POST|GET /materials/requests`
- `PATCH /materials/requests/:id/review`

Material purchases increment stock, material usage decrements stock, and material request approval only changes request status.

### Payments and Chat

- `POST|GET /payments`
- `GET /payments/:id`
- `DELETE /payments/:id` (Admin reversal)
- `GET|POST /chat/rooms`
- `GET|POST /chat/rooms/:roomId/messages`
- `GET|POST /chat/project-rooms/:projectId/messages`
- `GET /activity` (Admin global audit feed)

Chat is REST-only. Real-time WebSocket behavior is intentionally not enabled until frontend alignment is complete.

## Enforced Business Rules

- Site Managers can only access projects where `Project.managerId` equals their user ID.
- Workers can only access their own profile and their currently assigned project.
- Workers cannot be assigned or removed while `outstandingAmount > 0`.
- Project rates are historical: active rows are deactivated and new rows are inserted; existing rate rows are never updated.
- Worker assignment snapshots the active daily rate into `WorkerProfile.dailyRate`.
- Attendance uses an upsert on `(workerId, projectId, date)`.
- Half-day attendance requires notes.
- Manager attendance is authoritative over worker self-check-in data.
- Payment balance changes and payment creation occur in one Prisma transaction.
- Withdrawal approval decrements `currentEarnings` transactionally.
- Material usage cannot exceed current stock, including concurrent requests.
- Meaningful project changes write `ActivityLog` entries.
- Worker assignment changes and task creation write human-readable system messages to project chat.

## Validation and Documentation Scripts

```bash
npx tsc --noEmit
npm run build
npm run lint
npm run generate:swagger
npm run generate:postman
```

`npm run generate:swagger` builds the application and updates `swagger-spec.json`. `npm run generate:postman` converts the Swagger document into `postman-collection.json`.

## Configuration Notes

- Uploads are served from `/uploads`.
- CORS currently allows `http://localhost:3000`; update `src/main.ts` for other frontend origins.
- Swagger is disabled when `NODE_ENV=production`.
- Notification persistence is not currently implemented; activity logs are the source for audit feeds and project system messages.
