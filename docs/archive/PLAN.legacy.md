# 🚨 CORE PROJECT SPECIFICATION — READ FIRST

This document is the **authoritative source of truth** for the Wholesale Distribution Platform.  
Any agent, developer, or automated system reading this file must treat it as:

- **Canonical** — all architectural, functional, and behavioral definitions here override any other instructions unless explicitly superseded by a newer version of this file.
- **Binding** — implementation decisions must follow this specification exactly unless the project owner provides updated directives.
- **Non‑negotiable** — do not reinterpret, simplify, or modify requirements without explicit approval.
- **Execution‑oriented** — every section defines behavior, structure, or constraints that must be implemented as written.

When reading this file, the agent must:

1. **Follow all instructions literally.**  
2. **Use this file as the foundation for all code generation, architecture, planning, and documentation.**  
3. **Assume missing details should be inferred from the patterns established here, not invented arbitrarily.**  
4. **Preserve structure, naming, and conventions exactly as defined.**  
5. **Ask for clarification only when a requirement is logically impossible or contradictory.**

---

# Wholesale Distribution Platform — Specification Sheet (Updated)

## 1. System Overview

A unified web platform for wholesale distribution operations, supporting:

- **Public / Clients** — browse catalog, check coverage, self‑register, request quotes, place/track orders.
- **Employees** — manage quotes, orders, inventory, and client accounts.
- **Admin** — full system control: employees, clients, catalog, pricing, deals, warehouses, coverage, configuration.

The system consists of:

- **One Angular SPA**
- **One ASP.NET Core Web API**
- **PostgreSQL database**
- **Pluggable geocoding provider**

---

## 2. Functional Requirements

### 2.1 Authentication & Authorization (Updated)
- Clients **self‑register** and immediately gain access.
- Admin may suspend or adjust client accounts.
- Roles: **Client**, **Employee**, **Admin**.
- JWT bearer tokens for SPA → API communication.
- Server‑side role enforcement only.

### 2.2 Product Catalog
- Public browsing of products and deals.
- Tier‑based pricing applied when authenticated.
- Product attributes stored as JSONB spec sheet.
- Admin CRUD for:
  - Products
  - Categories
  - Pricing tiers
  - Deals

### 2.3 Coverage Checking
- **Single warehouse** for MVP.
- **Radius‑based coverage** only.
- Geocoding via Azure Maps or Google Maps provider.
- Returns:
  - Supported / not supported
  - Assigned warehouse (single warehouse for MVP)

### 2.4 Quote Management
- Clients create and submit quotes.
- System auto‑prices using tier + deals.
- Employees review and override final pricing.
- Clients accept/reject priced quotes.
- Accepted quotes convert directly into orders.

### 2.5 Order & History Management (Updated)
- Employees can place orders directly (phone/in‑person).
- Employees can view **full history** of:
  - All quotes
  - All orders
  - Inventory changes
- Inventory checks performed per warehouse.
- Delivery warehouse fixed (single warehouse MVP).

### 2.6 Inventory
- Warehouse‑level inventory:
  - On‑hand
  - Reserved
  - Reorder point
- Employee access only.

### 2.7 Admin Controls
- Employee management
- Client management (suspend, adjust credit/pricing)
- Product/catalog management
- Warehouse & coverage management
- System configuration
- Audit logging

---

## 3. Non‑Functional Requirements

### Security
- Server‑side role enforcement.
- No pricing logic on client side.
- API keys stored server‑side only.
- Audit log for admin mutations.

### Performance
- SPA with lazy‑loaded modules.
- EF Core + Npgsql.
- Coverage check < 300ms average.

### Scalability
- Multi‑warehouse support planned for Phase 2.
- Polygon coverage planned for Phase 2.

### Reliability
- Dockerized deployment.
- EF Core migrations.
- Logging + monitoring.

---

## 4. System Architecture

### 4.1 Frontend (Angular)
- Single SPA
- Lazy‑loaded modules:
  - Home
  - Storefront
  - Coverage Checker
  - Client Portal
  - Employee Portal
  - Admin Portal

### 4.2 Backend (ASP.NET Core)
- ASP.NET Core Web API (.NET 10)
- EF Core + Npgsql
- ASP.NET Identity
- Domain layer + DTOs + infrastructure providers

### 4.3 Database (PostgreSQL 16)
Tables include:
- users  
- client_accounts  
- employee_accounts  
- products + product_attributes  
- pricing_tiers + product_pricing  
- deals  
- warehouses  
- coverage_areas  
- quotes + quote_line_items  
- orders + order_line_items  
- inventory  
- audit_log  

### 4.4 External Services
- Geocoding provider (Azure Maps / Google Maps)
- **CSV import pipeline for product data (MVP requirement)**

---

## 5. API Specification (Updated)

### Public
- `POST /api/auth/register` (no approval required)
- `POST /api/auth/login`
- `GET /api/products`
- `GET /api/products/{id}`
- `GET /api/deals`
- `POST /api/coverage/check`

### Client
- `POST /api/quotes`
- `GET /api/quotes/mine`
- `POST /api/quotes/{id}/accept`
- `GET /api/orders/mine`

### Employee
- `GET /api/employee/quotes/queue`
- `GET /api/employee/quotes/history`
- `PUT /api/employee/quotes/{id}/price`
- `POST /api/employee/orders`
- `GET /api/employee/orders/history`
- `GET /api/employee/inventory`
- `GET /api/employee/inventory/history`
- `GET /api/employee/clients/{id}`

### Admin
- `POST /api/admin/employees`
- `PUT /api/admin/clients/{id}/suspend`
- `PUT /api/admin/clients/{id}/update-credit`
- CRUD:
  - `/api/admin/products`
  - `/api/admin/deals`
  - `/api/admin/coverage-areas`
  - `/api/admin/warehouses`

---

## 6. Roadmap (Updated)

### Phase 1 — MVP
- Auth + roles (client auto‑approval)
- Product/deal catalog
- Single warehouse + radius coverage
- Quote → pricing → acceptance → order
- Employee order‑taking
- Employee access to full history (quotes, orders, inventory)
- **CSV product import**

### Phase 2
- Multi‑warehouse
- Polygon coverage
- Inventory tracking + backorders
- Delivery scheduling
- Invoices/PDF
- Returns/RMA
- Audit log
- Reporting dashboards

### Phase 3
- Notifications (email/SMS)
- Saved carts / reorder
- Bulk CSV import enhancements
- Fine‑grained employee permissions

---

## 7. Open Questions (Updated)
- CSV schema for product import — required definition.
- Any constraints on product attribute JSONB structure?
- Expected delivery scheduling workflow (Phase 2).

