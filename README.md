# SAP O2C Context Graph + LLM Query System

Forward Deployed Engineer take-home assignment implementation.

This project ingests SAP Order-to-Cash data, models it as a relational graph, visualizes connected business entities, and supports natural-language business questions that are translated to validated SQL with strict guardrails.

## 1. Problem and Scope

Business process data is fragmented across orders, deliveries, billing, journals, and payments.  
This system unifies those tables into:

- a graph representation (`nodes`, `edges`) for exploration
- an assistant interface for NL queries
- data-grounded answers only (no hallucinated free-form outputs)

No authentication is used (assignment requirement).

## 2. Stack

- Frontend: Next.js 16, React, Tailwind CSS, Framer Motion
- Backend: Node.js, Express-style routes (TypeScript)
- Data: Prisma + SQLite
- LLM: Gemini free-tier API (with deterministic fallback)

## 3. Database Choice and Tradeoffs

### Chosen: Relational DB (SQLite) + Graph JSON generation

Why:

- Dataset is already tabular SAP O2C data.
- SQL is ideal for aggregations, joins, and explainability.
- Prisma provides fast schema iteration and clear typed models.
- Easier to explain in README and evaluate in a take-home.

Tradeoffs:

- Graph traversals are generated from relational joins (not native graph traversals).
- Very large graph rendering requires edge/node capping in UI for performance.

Why not graph DB for this assignment:

- Added operational complexity for limited evaluation upside.
- Core ask can be met credibly with relational modeling + graph projection.

## 4. High-Level Architecture

```text
JSONL Dataset
   -> Prisma seed pipeline
   -> SQLite tables (SAP O2C entities)
   -> Backend graph service builds nodes/edges
   -> GET /api/graph + GET /api/node/:id

User question
   -> POST /api/query
   -> classifyPrompt (scope gate)
   -> generateSql (Gemini-first, deterministic fallback)
   -> validateSql (strict safety checks)
   -> executeSql (DB)
   -> answerFromRows (grounded business summary + node highlights)
   -> UI render (assistant + optional debug details)
```

## 5. Data Model (Real SAP O2C Entities)

Core entities modeled in Prisma:

- `business_partners`
- `sales_order_headers`, `sales_order_items`, `sales_order_schedule_lines`
- `outbound_delivery_headers`, `outbound_delivery_items`
- `billing_document_headers`, `billing_document_items`, `billing_document_cancellations`
- `journal_entry_items_accounts_receivable`
- `payments_accounts_receivable`
- `products`, `product_descriptions`, `product_plants`, `product_storage_locations`
- `plants`
- `customer_company_assignments`, `customer_sales_area_assignments`, `business_partner_addresses`

Canonical flow used for query + graph logic:

1. `business_partners.customer -> sales_order_headers.soldToParty`
2. `sales_order_headers.salesOrder -> sales_order_items.salesOrder`
3. `sales_order_items(salesOrder, salesOrderItem) -> outbound_delivery_items(referenceSdDocument, referenceSdDocumentItem)`
4. `outbound_delivery_items(deliveryDocument, deliveryDocumentItem) -> billing_document_items(referenceSdDocument, referenceSdDocumentItem)`
5. `billing_document_items.billingDocument -> billing_document_headers.billingDocument`
6. `billing_document_headers.billingDocument -> journal_entry_items_accounts_receivable.referenceDocument`
7. Journal composite key -> payment composite key

## 6. Graph Modeling

### Node IDs

Canonical deterministic IDs (examples):

- `business_partner:<customer>`
- `sales_order:<salesOrder>`
- `sales_order_item:<salesOrder>|<item>`
- `outbound_delivery:<deliveryDocument>`
- `outbound_delivery_item:<deliveryDocument>|<item>`
- `billing_document:<billingDocument>`
- `billing_document_item:<billingDocument>|<item>`
- `journal_entry_item:<companyCode>|<fiscalYear>|<accountingDocument>|<item>`
- `payment:<companyCode>|<fiscalYear>|<accountingDocument>|<item>`
- `product:<product>`
- `plant:<plant>`

### Graph APIs

- `GET /api/graph`
  - returns:
  ```json
  { "nodes": [], "edges": [] }
  ```
- `GET /api/node/:id`
  - returns:
  ```json
  { "id": "...", "type": "...", "label": "...", "metadata": { } }
  ```

## 7. Query Pipeline and Prompting Strategy

Query API:

- `POST /api/query`
  - request:
  ```json
  { "question": "..." }
  ```
  - response accepted:
  ```json
  {
    "accepted": true,
    "sql": "...",
    "rows": [],
    "answer": "...",
    "highlights": []
  }
  ```
  - response rejected:
  ```json
  {
    "accepted": false,
    "reason": "out_of_scope" | "unsafe_query" | "no_data"
  }
  ```

Pipeline:

1. `classifyPrompt`: permissive in-domain gate (rejects only clearly unrelated prompts).
2. `generateSql`: Gemini primary path using explicit schema context + few-shot SQL examples.
3. `validateSql`: strict SQL safety enforcement.
4. `executeSql`: runs only validated SQL.
5. `answerFromRows`: concise business answer grounded only in returned rows.

Prompting:

- Full table/schema context is embedded in `backend/src/services/query/schemaContext.ts`.
- Canonical O2C join path is explicit in prompt.
- Includes few-shot examples for:
  - fiscal year/company code/currency/billing type/plant discovery
  - top products/customers
  - broken/incomplete flow detection
  - billing trace

## 8. Guardrails

Implemented in `classifyPrompt.ts` + `validateSql.ts`:

- Out-of-domain rejection for clearly unrelated prompts.
- SQL must be `SELECT` or `CTE + SELECT` only.
- No comments (`--`, `/* */`) and no multi-statement SQL.
- Forbidden operations blocked (`INSERT`, `UPDATE`, `DELETE`, DDL, PRAGMA, etc.).
- Allowed-table whitelist enforced.
- `LIMIT` clamped to max 200.
- If no safe mapping, returns:
  - `out_of_scope` or `unsafe_query`.
- If safe query returns no rows:
  - `no_data`.

## 9. Frontend UX Notes

- Graph-first workspace with chat sidebar.
- Draggable 2D nodes, node detail panel, selected-connection emphasis.
- Assistant responses show business answer first.
- SQL/row preview/highlights are available behind optional `Debug details`.
- Loading state includes thinking indicators.

## 10. Setup and Run

## Prerequisites

- Node.js 20+
- npm

## 1) Install

```bash
npm install
```

## 2) Configure environment

Create `.env` in project root.

Minimum local env:

```env
DATABASE_URL=file:./prisma/dev.db
API_PORT=4000
API_HOST=0.0.0.0
API_INTERNAL_ORIGIN=http://localhost:4000
SAP_O2C_DATASET_DIR=<absolute-path-to-sap-o2c-data>

# LLM
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your-key>
GEMINI_MODEL=gemini-2.0-flash
LLM_SQL_TIMEOUT_MS=20000
```

Notes:

- If `DATABASE_URL` is omitted, backend and seed scripts default to `prisma/dev.db`.
- If `SAP_O2C_DATASET_DIR` is omitted, seed script checks known local fallbacks.

## 3) Initialize DB + seed dataset

```bash
npm run db:setup
```

This will:

- recreate schema from `prisma/schema.prisma`
- seed all SAP JSONL tables into SQLite

## 4) Run backend and frontend (two terminals)

Terminal A:

```bash
npm run dev:api
```

Terminal B:

```bash
npm run dev
```

App: `http://localhost:3000`  
API health: `http://localhost:4000/health`

## 11. Deploy (Railway Root, Single Service)

This repo now supports a single Railway service from repo root:

- Next.js UI and Express API run in one process (`server.ts`)
- `/api/*` and `/health` are handled by Express
- all other routes are handled by Next.js

### Railway steps

1. Push this repo to GitHub.
2. In Railway, create a new project from this repo root.
3. Railway uses `railway.json`:
   - start command: `npm run start:railway`
   - health check: `/health`
4. Set env vars:
   - `GEMINI_API_KEY=<your-key>`
   - `LLM_PROVIDER=gemini`
   - `GEMINI_MODEL=gemini-2.0-flash`
   - `LLM_SQL_TIMEOUT_MS=20000`
5. Keep `API_INTERNAL_ORIGIN` unset/empty for this single-service mode.
6. Deploy.

### Optional data seeding on Railway

- If `SAP_O2C_DATASET_DIR` exists in the runtime environment, startup bootstrap will run `prisma:seed`.
- If not, app still starts with schema-only DB (empty graph/data).

### Verify after deploy

1. `GET /health` returns `{ "status": "ok" }`.
2. Open Railway service URL and confirm UI loads.
3. Run an in-domain query in sidebar and confirm accepted/rejected responses follow guardrails.

## 12. Example In-Domain Queries

- `Which products are associated with the highest number of billing documents?`
- `Trace the full flow of billing document 90504248`
- `Identify sales orders with broken or incomplete flows`
- `what financial year info are there`
- `show company codes`
- `what currencies are present`

## 13. Evaluation Criteria Mapping

- Code quality and architecture: modular routes/services, typed contracts, separated frontend/backend concerns.
- Graph modelling: explicit node types + deterministic IDs + business-flow edges.
- Database/storage choice: relational-first design with clear graph projection tradeoff.
- LLM integration/prompting: schema-aware Gemini prompting with examples and fallback.
- Guardrails: strict classifier + SQL validator + safe execution pipeline.

## 14. Known Limitations

- SQLite is selected for simplicity and speed (not horizontal-scale production).
- Graph rendering applies limits/caps for client performance at larger sizes.
- LLM quality depends on provider latency/quota; deterministic fallback remains as safety net.

## 15. Submission Checklist

- [X] Working demo link: `<add-demo-url>`
- [X] Public GitHub repo: `<add-repo-url>`
- [X] This README completed with architecture/tradeoffs/prompting/guardrails
- [X] AI coding session logs attached (`/submission/ai-logs/*.md` or zipped bundle)
- [x] No authentication

---

If reviewing this repo for the assignment, start with:

1. `prisma/schema.prisma`
2. `prisma/seed.ts`
3. `backend/src/services/graph.service.ts`
4. `backend/src/routes/query.ts` and `backend/src/services/query/*`
