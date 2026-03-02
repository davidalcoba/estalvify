# Project Overview

## Product

Estalvify is a personal finance management app.

Users connect their bank accounts and the system regularly syncs transactions. Transactions are categorized through a combination of:

- Manual categorization
- Rule-based categorization
- AI suggestions

The product also supports monthly spending budgets and reporting capabilities. Some features are implemented and stable, while others are still in progress.

## Core Goals

- Give users a clear picture of their money across accounts
- Reduce manual work in transaction categorization
- Help users track monthly spending and trends

## Core Principles

- Security and privacy first for financial data
- Reliable bank sync behavior
- Clear and predictable UX on desktop and mobile
- Incremental delivery: partial features are acceptable when clearly marked

## Platform and Stack

- Next.js App Router
- React + TypeScript (strict)
- Prisma
- NextAuth
- Tailwind CSS + shadcn/ui
- Async job processing with queues
- Vercel for deployment and platform services

## Deployment and Platform Policy

- The app is deployed on Vercel.
- For new features, prefer Vercel built-in capabilities whenever they are a good fit and there is no stronger alternative.
- Examples include deployment/runtime features, scheduling, queues, edge/middleware capabilities, and observability integrations.

## Multi-User Model

This is a multi-user SaaS-style app.

Each user has an isolated workspace and data scope. User data must never cross boundaries.

Examples of user-scoped entities:

- Bank connections
- Bank accounts
- Transactions
- Categorization rules
- Budgets and reports
- User preferences

All read/write operations must be explicitly scoped to the authenticated user.
