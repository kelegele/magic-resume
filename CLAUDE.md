# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Magic Resume is an online resume editor built with **TanStack Start** (full-stack React framework on Vite). It supports real-time preview, 8 resume templates, AI-assisted writing, PDF export, and auto-one-page scaling. All data is persisted client-side via Zustand + localStorage, with optional file-system sync.

## Commands

```bash
pnpm dev              # Start dev server on http://localhost:3000
pnpm build            # Production build (outputs to dist/)
pnpm start            # Run production server (node server.mjs)
pnpm release          # Bump version via bumpp
docker compose up -d  # Docker deployment
```

No test framework is configured.

## Architecture

### Routing (TanStack Start)

The app uses file-based routing under `src/app/`. Key routes:
- `(public)/[locale]/page.tsx` — Landing page with i18n
- `app/dashboard/` — Resume dashboard (list, create, import, settings, templates)
- `app/workbench/[id]/page.tsx` — Three-panel resume editor (side panel + edit panel + preview)

### State Management (Zustand)

`src/store/useResumeStore.ts` — Single persisted store (`resume-storage` in localStorage). Holds all resumes as `Record<string, ResumeData>` with `activeResumeId`. Every mutation updates `updatedAt` and triggers debounced file-system sync (1.5s).

Key data model: `ResumeData` (`src/types/resume.ts`) contains `basic`, `education[]`, `experience[]`, `projects[]`, `certificates[]`, `customData` (dynamic sections), `skillContent`, `selfEvaluationContent`, `menuSections[]` (section visibility/order), and `globalSettings` (theme, typography, spacing).

### Template System

Templates are registered in `src/components/templates/registry.ts`. Each template is a directory with:
- `config.ts` — `ResumeTemplate` config (id, name, color scheme, spacing, layout)
- `index.tsx` — Main template component
- `sections/` — Section components (BaseInfo, EducationSection, etc.)

The 8 templates: classic, modern, left-right, timeline, minimalist, elegant, creative, editorial.

**To add a new template**: create directory under `src/components/templates/`, add `config.ts` + `index.tsx` + section components, then add one line to `TEMPLATE_REGISTRY` in `registry.ts`.

`TemplateContext` provides `templateId` and `menuSections` to all section components.

### Editor Panels

The workbench (`app/workbench/[id]/page.tsx`) uses `react-resizable-panels` for a three-panel layout:
- **SidePanel** (`src/components/editor/SidePanel.tsx`) — Settings: template, theme color, typography, spacing, section layout/reordering
- **EditPanel** (`src/components/editor/EditPanel.tsx`) — Content editing for active section, delegates to section-specific panels (BasicPanel, EducationPanel, etc.)
- **PreviewPanel** (`src/components/preview/index.tsx`) — A4-scaled live preview with page break indicators and auto-one-page scaling via `useAutoOnePage` hook

### AI Features

AI integration (`src/config/ai.ts`) supports 5 providers: Doubao, DeepSeek, OpenAI-compatible, Gemini, and GLM (智谱AI). API routes under `src/routes/api/` handle grammar checking, content polishing, and PDF resume import. AI config is stored in `useAIConfigStore.ts`.

**Adding a new AI provider** involves:
1. Register in `AI_MODEL_CONFIGS` (`src/config/ai.ts`) with URL, headers, and validate function
2. Add state fields + setters in `src/store/useAIConfigStore.ts`
3. Add config UI card in `src/app/app/dashboard/ai/page.tsx`
4. Add provider branches in `AIPolishDialog.tsx`, `useGrammarStore.ts`, and `ResumeWorkbench.tsx`
5. If the provider supports vision, add PDF import branch in `src/routes/api/resume-import.ts`
6. Add i18n keys in both `src/i18n/locales/zh.json` and `en.json`

### i18n

Two locales: `zh` (default) and `en`. Translation files at `src/i18n/locales/`. Compatibility layer at `src/i18n/compat/client.tsx` provides `useTranslations` hook.

### PDF Export

`src/utils/export.ts` handles PDF generation. Uses Puppeteer on the server side and `html2pdf.js` on the client side. The preview container (`#resume-preview`) is the DOM source for export.

### Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json` and `vite-tsconfig-paths`).

## Key Conventions

- **UI components**: Shadcn/ui (new-york style) in `src/components/ui/`, HeroUI for some widgets
- **Styling**: Tailwind CSS with CSS variables for theming, `cn()` utility for class merging
- **Animations**: Framer Motion throughout
- **Rich text**: Tiptap editor (`src/components/shared/rich-editor/RichEditor.tsx`) with custom extensions
- **Rich text content** in resume sections is stored as HTML strings (Tiptap output)
- **Icons**: Lucide React for UI icons, Remix Icon for some components
- **Font handling**: Custom fonts served from `public/fonts/` with server-side font config in `fonts/`
- **ESLint config** extends `next/core-web-vitals` (legacy config, not using flat config)

## Vercel Deployment

TanStack Start 1.160 does **not** have a built-in Vercel adapter (no `target: "vercel"` option). Deployment requires a custom serverless function bridge:

- **`vercel.json`** — build config, static output directory (`dist/client`), rewrite rules, `includeFiles`
- **`api/index.ts`** — catch-all serverless function that loads `dist/server/server.js` at runtime and delegates requests to `server.fetch()`

Key pitfalls to avoid:
- **Do NOT** add `target: "vercel"` to `tanstackStart()` in `vite.config.ts` — this option does not exist in v1.160
- **Use runtime path** (`resolve(process.cwd(), ...)`) to import the built server — static imports cause esbuild to fail during Vercel's function bundling
- **Set `includeFiles: "dist/**"`** in `vercel.json` functions config — Vercel won't include build output in serverless functions by default
- **Set `bodyParser: false`** — read raw body from `req` stream instead of relying on Vercel's auto-parsing
- **Watch for TypeScript strict errors** — `RequestInit` doesn't have `duplex`, `forEach` callbacks need explicit types

## Future: Desktop App

项目可以封装为可安装的桌面应用，推荐方案是 **Tauri**（Rust webview，包体 ~5-10MB）。项目本质接近纯前端（数据存 localStorage，AI 调用是前端传 key），适配成本较低。主要改动是把服务端 API 路由（grammar、polish、resume-import）的逻辑移到前端直接调用外部 AI API，去掉对自建服务端的依赖。
