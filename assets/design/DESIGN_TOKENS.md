# GitGrove — Design Assets

## Logo System
→ `GitGrove Logo.html` 브라우저에서 열어서 확인

### Icon Mark (SVG 핵심 구조)
```svg
<!-- 200×200 viewBox, rounded square container -->
<rect width="200" height="200" rx="38" fill="#0d1220"/>

<!-- Trunk (main branch) -->
<rect x="97" y="38" width="6" height="128" fill="#e6a536"/>

<!-- Left branch: horizontal → vertical -->
<rect x="60" y="108" width="37" height="6" fill="#e6a536"/>
<rect x="60" y="60" width="6" height="54" fill="#e6a536"/>

<!-- Right branch -->
<rect x="103" y="108" width="37" height="6" fill="#e6a536"/>
<rect x="134" y="60" width="6" height="54" fill="#e6a536"/>

<!-- Commit nodes (16×16, rx=3) -->
<rect x="92" y="152" width="16" height="16" rx="3" fill="#e6a536"/>  <!-- root -->
<rect x="92" y="102" width="16" height="16" rx="3" fill="#e6a536"/>  <!-- fork -->
<rect x="92" y="30"  width="16" height="16" rx="3" fill="#ffd770"/>  <!-- HEAD (brighter) -->
<rect x="52" y="52"  width="16" height="16" rx="3" fill="#e6a536"/>  <!-- left tip -->
<rect x="132" y="52" width="16" height="16" rx="3" fill="#e6a536"/>  <!-- right tip -->

<!-- Leaf pixel clusters (9×9, green = "Grove") -->
<!-- Left cluster -->
<rect x="40" y="32" width="9" height="9" fill="#6fcf7c"/>
<rect x="51" y="26" width="9" height="9" fill="#6fcf7c"/>
<rect x="62" y="22" width="9" height="9" fill="#6fcf7c"/>
<rect x="44" y="42" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
<rect x="55" y="36" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
<!-- Right cluster (mirror) -->
<rect x="142" y="32" width="9" height="9" fill="#6fcf7c"/>
<rect x="131" y="26" width="9" height="9" fill="#6fcf7c"/>
<rect x="120" y="22" width="9" height="9" fill="#6fcf7c"/>
<rect x="138" y="42" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
<rect x="127" y="36" width="9" height="9" fill="#6fcf7c" opacity=".75"/>
<!-- Top canopy -->
<rect x="84"  y="12" width="9" height="9" fill="#6fcf7c"/>
<rect x="95"  y="7"  width="9" height="9" fill="#6fcf7c"/>
<rect x="106" y="12" width="9" height="9" fill="#6fcf7c"/>
<rect x="89"  y="21" width="9" height="9" fill="#6fcf7c" opacity=".8"/>
<rect x="101" y="21" width="9" height="9" fill="#6fcf7c" opacity=".8"/>
```

### Wordmark
- Font: **Pixelify Sans 700**
- Text: `GitGrove`
- Color (dark bg): `#f4ecd2`
- Color (gold variant): `#ffd770`
- Icon + text gap: icon height × 0.4

### Favicon 32×32 / 16×16
→ `GitGrove Logo.html` 안에 SVG 소스 포함됨

---

## Design Tokens (CSS)

```css
/* ── Backgrounds ── */
--c-bg-deep:      #0d1220;   /* window / page */
--c-bg-surface:   #161d30;   /* panels, sidebar */
--c-bg-elevated:  #1f273e;   /* cards, dropdowns */
--c-bg-inset:     #0a0f1c;   /* inputs, action bar */

/* ── Borders ── */
--c-border:       #2d3551;
--c-border-strong:#45506e;
--c-divider:      #232a44;

/* ── Text ── */
--c-text:         #b8c0d8;
--c-text-strong:  #f4ecd2;
--c-text-muted:   #6d7798;
--c-text-faint:   #4a5273;
--c-text-on-gold: #1a1206;

/* ── Gold accent (primary) ── */
--c-gold-200:     #ffd770;
--c-gold-300:     #f5b94a;
--c-gold-400:     #e6a536;   /* ← main CTA / highlight */
--c-gold-500:     #c98a22;
--c-gold-bg:      rgba(230,165,54,.14);
--c-gold-bg-soft: rgba(230,165,54,.07);
--c-gold-border:  rgba(230,165,54,.45);

/* ── Semantic ── */
--c-success:      #6fcf7c;   /* added lines, online */
--c-info:         #5fb8e6;   /* info states */
--c-danger:       #ff6b6b;   /* deleted lines, errors */
--c-warning:      #ffce5a;   /* dirty indicator */

/* ── Radii ── */
--r1: 2px;  --r2: 4px;  --r3: 6px;  --rpill: 999px;

/* ── Shadows ── */
/* Panel:  */ box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 32px 80px rgba(0,0,0,.75);
/* Button: */ box-shadow: inset 0 1px 0 rgba(255,235,170,.25), 0 1px 0 rgba(0,0,0,.4);
/* Focus:  */ box-shadow: 0 0 0 2px rgba(230,165,54,.18);
```

## Typography

```
Display / UI:  'Pixelify Sans', 'DotGothic16', monospace
Body:          'Noto Sans KR', system-ui, sans-serif
Mono / code:   'IBM Plex Mono', ui-monospace, monospace
```

## Branch Graph Colors

```
lane 0 — main:              #e6a536  (gold)
lane 1 — feature/auth:      #5fb8e6  (blue)
lane 2 — hotfix/*:          #ff6b6b  (red)
lane 3 — feature/ui-*:      #c39ad9  (purple)
```
