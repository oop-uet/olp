# UI/UX Design Standards: OOP Learning Platform (UET OASIS Parity)

This document establishes the UI/UX design standards and visual components for the OOP Learning Platform. All developers and AI assistants must follow these standards strictly when designing, creating, or modifying user interfaces to ensure consistency, professionalism, and visual excellence.

---

## 1. Core Visual Identity

The design language of the OOP Learning Platform combines **academic rigor** (modeled after the dense, data-driven structure of UET OASIS) with a **premium, clean, modern tech aesthetic**.

### 1.1 Color Palette
We use a curated, professional color palette based on UET-VNU brand colors. Avoid random hex codes; use only the Tailwind classes or CSS variables mapped below:

| Color Type | Token | Hex | Tailwind Utility | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | UET Navy | `#003366` | `bg-primary`, `text-primary` | Main headers, key navigation, primary buttons |
| **Secondary** | UET Orange | `#f37021` | `bg-secondary`, `text-secondary` | Callouts, notifications, active indicators, accents |
| **Accent Blue**| Soft Blue | `#002b56` | `bg-primary-700` | Hover states for dark headers, header panels |
| **Success** | Emerald | `#10b981` | `bg-success-500`, `text-success-700` | Completed submissions, passed test cases |
| **Warning** | Amber | `#f59e0b` | `bg-warning-500`, `text-warning-700` | Approaching deadlines, quota warning states |
| **Danger** | Rose | `#ef4444` | `bg-danger-500`, `text-danger-700` | Failed compilation, warning threshold reached |
| **Background**| Muted White | `#f8fafc` | `bg-slate-50` | Default page background |
| **Surface** | Pure White | `#ffffff` | `bg-white` | Cards, tables, forms |
| **Border** | Slate | `#e2e8f0` | `border-slate-200` | Grid lines, inputs, panel separators |

### 1.2 Typography & Hierarchy
We use **Inter** for clean readability and **JetBrains Mono** for all code blocks, compile errors, and test logs.

```
H1: 24px (1.5rem), Bold, Slate-900, Tracking-tight
H2: 18px (1.125rem), Semibold, Slate-800
H3: 14px (0.875rem), Semibold, Slate-700
Body: 13px (0.8125rem), Regular, Slate-600, Line-height: 1.5
Captions / Tables: 12px (0.75rem), Medium, Slate-500
Mono Code: 12px (0.75rem), Regular, JetBrains Mono
```

---

## 2. Component Design Specifications

### 2.1 Buttons (`.btn`)
Buttons must feature interactive feedback (subtle scale-down on active, transition durations) and clear color mapping.

*   **Primary Button:**
    ```html
    <button class="px-4 py-2.5 text-xs font-bold bg-primary text-white hover:bg-primary-700 active:scale-[0.98] transition-all rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20">
      Thực hiện
    </button>
    ```
*   **Secondary Button:**
    ```html
    <button class="px-4 py-2.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all rounded-lg">
      Hủy bỏ
    </button>
    ```
*   **Destructive Button:**
    ```html
    <button class="px-4 py-2.5 text-xs font-bold bg-danger-500 text-white hover:bg-danger-600 active:scale-[0.98] transition-all rounded-lg shadow-sm">
      Xóa bỏ
    </button>
    ```
*   **Size Modifiers:**
    *   **Small (`.btn-sm`):** `px-2.5 py-1 text-[11px] rounded-md` (Used for actions inside table cells).
    *   **Normal:** `px-4 py-2.5 text-xs rounded-lg`.
    *   **Large (`.btn-lg`):** `px-5 py-3 text-sm rounded-xl`.

### 2.2 Form Inputs (`.input`)
Forms must be modern and responsive, avoiding heavy outlines. Input fields should feel clean and have consistent focus states.

```html
<div class="space-y-1.5">
  <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600">
    Mã sinh viên <span class="text-rose-500">*</span>
  </label>
  <input 
    type="text" 
    class="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 hover:border-slate-300"
    placeholder="Nhập mã sinh viên..."
  />
</div>
```

### 2.3 Dense Tables & Grids
To match the structured administrative feeling of UET OASIS, tables should be dense, clean, and highly readable.
*   **Header cell (`.table-th`):** Dark slate text, light slate background, `uppercase tracking-wider text-xs font-bold px-4 py-3`.
*   **Data cell (`.table-td`):** Slate text, `text-xs px-4 py-2.5 border-b border-slate-50`.
*   **Row Hover:** Row elements must have `hover:bg-slate-50/70 transition-colors`.

### 2.4 Status Badges
Status indicators must use soft background colors with contrasting text and a thin matching ring wrapper:

```html
<!-- Passed / Correct -->
<span class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-700/10">
  CORRECT
</span>

<!-- Compilation Error / Failed -->
<span class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-rose-700/10">
  COMPILE ERROR
</span>

<!-- Late / Overdue -->
<span class="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-500/10">
  LATE
</span>
```

---

## 3. Page Layouts & Workspace Patterns

### 3.1 Page Header Panel (`.panel-header`)
Each section page should feature a clean header with navigation breadcrumbs and key controls.
```html
<div class="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
  <div class="space-y-1">
    <div class="flex items-center gap-2 text-xs font-medium text-slate-400">
      <a href="#/dashboard" class="hover:text-primary">Trang chủ</a>
      <span>/</span>
      <span class="text-slate-600">Chi tiết môn học</span>
    </div>
    <h1 class="text-xl font-bold text-slate-900">Môn học OOP Lớp INT2204 8</h1>
  </div>
  <div class="flex items-center gap-2">
    <!-- Action buttons -->
  </div>
</div>
```

### 3.2 Student Coding Workspace Layout
The exercise workspace splits the screen into functional components to replicate the dense judging UI:
1.  **Header:** Meta information (Exercise title, current attempt quota, deadline timer, and the UET logo).
2.  **Split Pane:**
    *   **Left (Problem details & Test Cases):** Markdown renderer with a beautiful custom blockquote system, and tabs to view inputs and outputs.
    *   **Right (Monaco Code Editor):** Configured with the `vs-dark` theme, JetBrains Mono font, and strict code folding.
3.  **Footer Terminal:** Execution logs, console stdout/stderr, compilation stack traces. Renders errors with red alerts, and compiler success with green messages.

---

## 4. Design Guidelines to Avoid "AI-Generated" Style

To ensure the UI feels human-crafted, logical, and robust, adhere to these guidelines:
1.  **No Arbitrary Margins/Paddings:** Always use standardized values (`p-4`, `p-6`, `space-y-4`). Do not mix `py-3 px-5` unless specifically required for dense sizing.
2.  **No Overlay Shadows on Everything:** Only cards and popovers should have shadows. Use `shadow-sm` or `shadow-md` for interactive states. Do not add heavy drop-shadows to tables, labels, or static sidebars.
3.  **Strict Color Palette:** Never use raw hex overrides in code (`bg-[#3b82f6]`). Refer entirely to Tailwind config colors (`bg-primary`, `bg-secondary`, `bg-success-500`).
4.  **No Empty States without Context:** If a grid is empty, show a dedicated, beautifully centered blank state with a helpful illustration/icon and a clear action button.
5.  **Interactive Elements Must Scale:** Buttons, tabs, and list links should scale slightly (`active:scale-[0.98]`) or change opacity on hover, offering immediate haptic feedback.
6.  **Clean Code Structure:** Avoid deeply nested divs. Rely on grid (`grid-cols-*`) and flexbox layouts with consistent spacing.
