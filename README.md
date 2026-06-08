# MF Red Flag Detector

A full‑stack web application that detects accounting-quality red flags in Indian mutual fund schemes using a 16-flag heuristic inspired by Howard Schilit's Financial Shenanigans.

Live deployment: https://mfredflagdetector.vercel.app/

---

## Overview

This repository contains the data pipeline, API, and frontend used to ingest company financials and mutual fund holdings, compute weighted red-flag scores for schemes, and present results via a React single-page app. The project is intended for research and screening; it surfaces signals that warrant further fundamental investigation rather than investment advice.

## Architecture

```
mf-redflag/
├── schema.sql              ← Supabase PostgreSQL schema
├── scripts/                ← ingestion & data preparation
├── backend/                ← FastAPI service (API + scoring)
├── frontend/               ← React + Vite SPA
└── vercel.json             ← Vercel deployment config
```

## Data & Storage

- Database: Supabase / PostgreSQL (schema defined in `schema.sql`).
- Core datasets: companies, company financials, computed red-flag results, mutual fund schemes, scheme holdings, and scheme scores.

## API

The backend exposes REST endpoints to list schemes, fetch scheme details (scores, per-stock flags, metrics), and request natural-language explanations. See the `backend` package for the full OpenAPI/route definitions.

## Frontend

The frontend is a React SPA built with Vite. It provides searchable, sortable scheme lists, per-scheme score cards, holdings tables with flag breakdowns, and AI-generated explanations.

## Features

- Scheme list with filters and sort
- Weighted red-flag scoring and visual score cards
- Per-stock 16-flag breakdown and tooltips
- AI-powered narrative explanations (optional)


---
