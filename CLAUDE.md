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

AI integration (`src/config/ai.ts`) supports 4 providers: Doubao, DeepSeek, OpenAI-compatible, and Gemini. API routes under `src/app/api/` handle grammar checking and content polishing. AI config is stored in `useAIConfigStore.ts`.

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
