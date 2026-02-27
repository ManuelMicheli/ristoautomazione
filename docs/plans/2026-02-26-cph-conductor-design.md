# Central Procurement Hub — Conductor Orchestration Design

## Scope

**Fase 1 (MVP Core)** + **Fase 2 (Controllo)** del Central Procurement Hub.

- Fase 1: Anagrafica fornitori, catalogo prodotti/listini, ordini di acquisto, dashboard spesa
- Fase 2: Ricezione merce con non conformita, riconciliazione fatture con OCR, scoring fornitore

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS + Framer Motion + Recharts |
| Backend | Node.js + Fastify + Zod |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Auth | JWT + RBAC (6 ruoli) |
| Email | Resend / SMTP |
| OCR | Tesseract locale + Cloud OCR (adapter pattern) |
| PDF | Puppeteer / react-pdf |
| Deploy | Docker Compose |

## Struttura Monorepo

```
central-procurement-hub/
├── docker-compose.yml
├── package.json              (pnpm workspace)
├── packages/
│   ├── db/                   (Drizzle schema, migrations, seed)
│   ├── shared/               (tipi TS condivisi, enums)
│   ├── api/                  (Fastify backend)
│   └── web/                  (React frontend)
├── e2e/                      (test E2E Playwright)
└── docs/
```

## Agenti Conductor (4)

| ID | Ruolo | Scope | maxTurns |
|---|---|---|---|
| architect | Infrastructure & DB Architect | Root config, packages/db/**, packages/shared/** | 50 |
| backend | Backend API Engineer | packages/api/** | 50 |
| frontend | Frontend UI Engineer | packages/web/** | 50 |
| qa | QA & Integration | e2e/**, docs/** | 30 |

## Wave di Esecuzione (6)

### Wave 1 — Foundation
- **scaffold-monorepo** (architect): pnpm workspace, Docker Compose, config
- **design-db-schema** (architect): 20+ tabelle Drizzle con relazioni e indici
- **scaffold-frontend** (frontend): Vite + React + Tailwind + routing

### Wave 2 — Core Infrastructure
- **shared-types** (architect): Tipi TS condivisi, enums, API types
- **setup-fastify** (backend): Server con JWT, RBAC, Zod, Drizzle, BullMQ
- **design-system** (frontend): 20+ componenti UI, dark mode, palette professionale

### Wave 3 — Fornitori & Prodotti
- **suppliers-api** (backend): CRUD fornitori, contatti, documenti, categorie
- **products-api** (backend): CRUD prodotti, pricing multi-fornitore, import CSV, comparatore
- **suppliers-pages** (frontend): Lista, dettaglio a tab, form, upload documenti
- **products-pages** (frontend): Catalogo, confronto prezzi, grafico storico, wizard import

### Wave 4 — Ordini & Dashboard
- **orders-api** (backend): Workflow 7 stati, approvazione, PDF, email
- **dashboard-api** (backend): Analytics spesa, trend, breakdown per categoria/fornitore
- **orders-pages** (frontend): Wizard creazione, lista, timeline, approvazioni
- **dashboard-page** (frontend): Overview, grafici Recharts, alert, azioni pendenti

### Wave 5 — Ricezione & Fatture
- **receiving-api** (backend): Ricezione vs ordine, non conformita, temperature, firma
- **invoices-api** (backend): Upload, OCR pipeline, matching 3 vie, scadenzario
- **receiving-pages** (frontend): UI tablet-friendly, checklist, foto, firma
- **invoices-pages** (frontend): Upload, review OCR, matching 3 vie, calendario pagamenti

### Wave 6 — Scoring & QA
- **supplier-scoring** (backend): Algoritmo scoring 4 dimensioni, ranking
- **notification-system** (backend): In-app + email + Web Push
- **scoring-ui** (frontend): Scorecard, radar chart, notification center
- **e2e-tests** (qa): Test E2E flussi critici con Playwright

## Design System

- **Base**: slate-900 (#0f172a), slate-800 cards
- **Accent green**: #10b981 (soldi, successo, conformita)
- **Accent amber**: #f59e0b (warning, attenzione)
- **Accent red**: #ef4444 (errori, non conformita critiche)
- **Dark mode first**, light mode supportato
- **Tablet-friendly** per modulo ricezione (touch target min 48px)
- **Localizzazione italiana**: DD/MM/YYYY, 1.234,56 EUR

## Totale

4 agenti, 22 task, 6 wave.
