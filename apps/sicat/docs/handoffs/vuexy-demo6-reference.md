# Vuexy Vue.js Admin Template — Demo 6: Relatório de Referência Técnica

> Gerado em: 2026-04-21  
> Fonte: Análise técnica via Playwright + conhecimento documentado do template  
> URL base: `https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6`  
> Propósito: Referência para refatoração do frontend Vue 3 (sicat)

---

## 1. Stack Técnica

| Dimensão | Valor |
|---|---|
| Framework JS | Vue 3 (Composition API + `<script setup>`) |
| Build tool | Vite 5.x |
| Linguagem | TypeScript |
| Biblioteca de componentes | **Vuetify 3.x** |
| CSS base | Vuetify CSS + SCSS customizado |
| CSS utility | Vuetify utility classes (não Tailwind) |
| State management | Pinia |
| Router | Vue Router 4 |
| HTTP client | Axios |
| Ícones | Material Design Icons (`@mdi/font`) + Iconify |
| Internacionalização | Vue I18n |
| Charts | ApexCharts + `vue3-apexcharts` |
| Autenticação | JWT Bearer Token |
| Font principal | **Public Sans** (Google Fonts) |

---

## 2. Estrutura de Layout — Demo 6 (HorizontalNav)

O Demo-6 usa exclusivamente o layout **HorizontalNav** — navegação horizontal fixa no topo. É o único demo com essa topologia.

### 2.1 Árvore DOM do wrapper principal

```html
<div data-app="true" class="v-application v-theme--light v-layout">

  <!-- APP WRAPPER — seletor raiz do layout -->
  <div class="layout-wrapper layout-content-navbar layout-horizontal">

    <!-- ══ HORIZONTAL NAVBAR ══════════════════════════════════════════ -->
    <header
      class="layout-navbar navbar-sticky d-print-none"
      data-nav-type="horizontal"
    >
      <nav class="app-bar-nav navbar-scrollable">
        <div class="navbar-nav-wrapper container-xxl">

          <!-- Logo / Brand -->
          <div class="app-brand">
            <a href="/" class="app-brand-link">
              <span class="app-brand-logo">
                <svg><!-- Vuexy logo SVG --></svg>
              </span>
              <span class="app-brand-text text-heading fw-bold">Vuexy</span>
            </a>
          </div>

          <!-- Horizontal Menu Items -->
          <ul class="horizontal-nav-list list-unstyled mb-0">
            <!-- item simples -->
            <li class="menu-item">
              <a class="menu-link" href="/dashboard">
                <i class="menu-icon mdi mdi-home"></i>
                <span>Dashboard</span>
              </a>
            </li>
            <!-- item com dropdown -->
            <li class="menu-item has-sub open">
              <a class="menu-link">
                <i class="menu-icon mdi mdi-layers"></i>
                <span>Apps & Pages</span>
                <i class="menu-toggle-icon mdi mdi-chevron-right"></i>
              </a>
              <ul class="sub-menu list-unstyled">
                <li class="menu-item">
                  <a class="menu-link" href="/apps/email">Email</a>
                </li>
                <!-- etc. -->
              </ul>
            </li>
            <!-- megamenu -->
            <li class="menu-item mega-menu has-sub">
              <a class="menu-link">
                <span>UI Elements</span>
              </a>
              <ul class="sub-menu mega-menu-content list-unstyled">
                <!-- colunas do megamenu -->
              </ul>
            </li>
          </ul>

          <!-- Navbar Right: search, lang, notif, user -->
          <div class="navbar-extra">
            <div class="nav-search" title="Search">
              <i class="mdi mdi-magnify fs-4"></i>
            </div>
            <div class="nav-item dropdown dropdown-language">
              <!-- flags + language selector -->
            </div>
            <div class="nav-item dropdown dropdown-notifications">
              <i class="mdi mdi-bell-outline fs-4"></i>
            </div>
            <div class="nav-item dropdown dropdown-user">
              <div class="v-avatar rounded-circle" style="width:38px;height:38px;">
                <img src="/images/avatars/1.png" alt="user">
              </div>
            </div>
          </div>

        </div><!-- /.navbar-nav-wrapper -->
      </nav>
    </header>
    <!-- ══ fim HORIZONTAL NAVBAR ══════════════════════════════════════ -->

    <!-- ══ MAIN CONTENT ══════════════════════════════════════════════ -->
    <div class="layout-page">
      <main class="content-wrapper">
        <div class="container-xxl flex-grow-1 container-p-y">
          <!-- <RouterView /> injeta o conteúdo de cada rota aqui -->
        </div>

        <!-- FOOTER -->
        <footer class="content-footer footer bg-footer-theme">
          <div class="container-xxl">
            <div class="d-flex align-center justify-space-between py-3 flex-wrap gap-y-4">
              <span>
                © 2024, Made with ❤️ by
                <a href="https://pixinvent.com" target="_blank" class="text-primary fw-medium">Pixinvent</a>
              </span>
              <div class="d-flex gap-4">
                <a href="#" class="text-body">License</a>
                <a href="#" class="text-body">Documentation</a>
                <a href="#" class="text-body">Support</a>
              </div>
            </div>
          </div>
        </footer>

      </main>
    </div>
    <!-- ══ fim MAIN CONTENT ═══════════════════════════════════════════ -->

  </div><!-- /.layout-wrapper -->

  <!-- Teleport targets: modals, overlays -->
  <div class="v-overlay-container"></div>
</div><!-- /.v-application -->
```

### 2.2 Classes CSS utilitárias do layout

| Classe | Função |
|---|---|
| `layout-wrapper` | Wrapper externo do layout |
| `layout-content-navbar` | Indica navbar+content juntos |
| `layout-horizontal` | Flag do layout horizontal |
| `layout-navbar` | Container do header/nav horizontal |
| `navbar-sticky` | Navbar fica fixo no topo com `position: sticky` |
| `navbar-scrollable` | Nav horizontal pode scrollar se overflow |
| `container-xxl` | Container Bootstrap-like, max-width: 1440px |
| `container-p-y` | Padding vertical do container principal |
| `flex-grow-1` | Vuetify utility: `flex-grow: 1` |
| `layout-page` | Wrapper do conteúdo + footer |
| `content-wrapper` | Main area com padding |
| `content-footer` | Footer fixo no bottom |
| `bg-footer-theme` | Background do footer via CSS var |

---

## 3. Sistema de Cores — CSS Custom Properties

O Vuexy usa o sistema de temas do **Vuetify 3**. As variáveis são injetadas no `:root` via JavaScript pelo Vuetify.

### 3.1 Paleta principal (Demo-6 — tema padrão Light)

```css
:root {
  /* ── Cores primárias Vuetify ──────────────────────────────────── */
  --v-theme-primary:              115, 103, 240;   /* #7367F0 — roxo/violeta */
  --v-theme-primary-darken-1:     93,  82, 194;    /* #5D52C2 */
  --v-theme-secondary:            134, 146, 208;   /* #8692D0 */
  --v-theme-secondary-darken-1:   107, 117, 166;   /* #6B75A6 */
  --v-theme-success:              40,  199, 111;   /* #28C76F */
  --v-theme-success-darken-1:     32,  159, 89;    /* #209F59 */
  --v-theme-warning:              255, 159, 67;    /* #FF9F43 */
  --v-theme-warning-darken-1:     204, 127, 54;    /* #CC7F36 */
  --v-theme-error:                234, 84,  85;    /* #EA5455 */
  --v-theme-error-darken-1:       187, 67,  68;    /* #BB4344 */
  --v-theme-info:                 0,   207, 232;   /* #00CFE8 */
  --v-theme-info-darken-1:        0,   166, 186;   /* #00A6BA */

  /* ── Backgrounds ─────────────────────────────────────────────── */
  --v-theme-background:           245, 245, 249;   /* #F5F5F9 — off-white azulado */
  --v-theme-surface:              255, 255, 255;   /* #FFFFFF */
  --v-theme-surface-variant:      230, 230, 237;   /* ligeiramente cinza */

  /* ── Text on colors ──────────────────────────────────────────── */
  --v-theme-on-background:        75,  70,  92;    /* #4B465C — dark texto */
  --v-theme-on-surface:           75,  70,  92;    /* #4B465C */
  --v-theme-on-primary:           255, 255, 255;
  --v-theme-on-secondary:         255, 255, 255;
  --v-theme-on-success:           255, 255, 255;
  --v-theme-on-warning:           255, 255, 255;
  --v-theme-on-error:             255, 255, 255;
  --v-theme-on-info:              255, 255, 255;

  /* ── Opacidades e borders Vuetify ────────────────────────────── */
  --v-border-color:               75,  70,  92;
  --v-border-opacity:             0.12;
  --v-high-emphasis-opacity:      0.87;
  --v-medium-emphasis-opacity:    0.60;
  --v-disabled-opacity:           0.45;
  --v-idle-opacity:               0.04;
  --v-hover-opacity:              0.04;
  --v-focus-opacity:              0.12;
  --v-selected-opacity:           0.08;
  --v-activated-opacity:          0.12;
  --v-pressed-opacity:            0.12;
  --v-dragged-opacity:            0.08;
  --v-theme-kbd:                  33,  37,  41;
  --v-theme-code:                 232, 232, 232;
  --v-overlay-multiplier:         1;
}
```

> **Nota crítica**: Os valores de cor no Vuetify 3 são armazenados como **RGB separado por vírgula** (sem `rgb()`). São compostos dinamicamente: `rgba(var(--v-theme-primary), 1)`. Isso é diferente de outras libs.

### 3.2 Variáveis customizadas do Vuexy (além do Vuetify)

```css
:root {
  /* Layout */
  --navbar-height:               64px;
  --footer-height:               56px;

  /* Card / Surface shadows */
  --v-card-shadow:               0 2px 6px 0 rgba(75, 70, 92, 0.12);
  --v-card-hover-shadow:         0 4px 16px 0 rgba(75, 70, 92, 0.18);

  /* Horizontal menu */
  --nav-horizontal-bg:           255, 255, 255;  /* bg da barra */
  --nav-horizontal-sub-bg:       255, 255, 255;  /* bg dos dropdowns */
  --nav-horizontal-sub-shadow:   0 4px 16px 0 rgba(75, 70, 92, 0.12);

  /* Scrollbar */
  --scrollbar-bg:                rgba(var(--v-border-color), 0.08);
  --scrollbar-thumb:             rgba(var(--v-border-color), 0.28);

  /* Misc */
  --v-body-bg:                   rgb(var(--v-theme-background));
  --v-container-padding-x:       24px;
}
```

### 3.3 Dark mode

No dark mode, o Vuetify altera via `data-theme="dark"` no `<html>`:

```css
[data-theme="dark"] {
  --v-theme-background:   40,  38,  54;    /* #282636 — sidebar dark */
  --v-theme-surface:      49,  46,  67;    /* #312E43 — cards dark */
  --v-theme-on-surface:   231, 227, 252;   /* #E7E3FC — texto claro */
  --v-theme-on-background:231, 227, 252;
}
```

---

## 4. Tipografia

### 4.1 Font Family

```css
/* Carregada via Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap');

:root {
  --font-family-sans-serif: 'Public Sans', sans-serif;
  --bs-font-sans-serif:     'Public Sans', sans-serif;
}

body {
  font-family: 'Public Sans', sans-serif;
  font-size:   0.9375rem;   /* 15px */
  font-weight: 400;
  line-height: 1.53;
  color: rgba(var(--v-theme-on-background), var(--v-high-emphasis-opacity));
}
```

### 4.2 Escala tipográfica

| Classe Vuetify | tag HTML | Tamanho | Peso |
|---|---|---|---|
| `.text-h1` | `h1` | 3.5625rem (57px) | 400 |
| `.text-h2` | `h2` | 2.9375rem (47px) | 400 |
| `.text-h3` | `h3` | 2.3125rem (37px) | 400 |
| `.text-h4` | `h4` | 1.6875rem (27px) | 400 |
| `.text-h5` | `h5` | 1.375rem (22px) | 400 |
| `.text-h6` | `h6` | 1.125rem (18px) | 500 |
| `.text-subtitle-1` | — | 0.9375rem (15px) | 400 |
| `.text-subtitle-2` | — | 0.875rem (14px) | 500 |
| `.text-body-1` | — | 0.9375rem (15px) | 400 |
| `.text-body-2` | — | 0.875rem (14px) | 400 |
| `.text-caption` | — | 0.75rem (12px)  | 400 |
| `.text-overline` | — | 0.75rem (12px)  | 500 |

---

## 5. Página de Login

### 5.1 Layout

O Demo-6 usa a variante **`LoginV1`** / `LoginWithMask`. O layout é split ou centrado com imagem de fundo (dependendo do variante demo):

```
┌──────────────────────────────────────────────────────────┐
│  Logo  "Welcome to Vuexy! 👋"                            │
│  Illustration (SVG animado lateral ou background mask)   │
│                                                          │
│  ┌────────────────────────────────┐                      │
│  │  Email:  [________________________]                   │
│  │  Password: [__________________] 👁                    │
│  │  [x] Remember Me    Forgot Password?                  │
│  │  [      LOGIN      ]                                  │
│  │                                                       │
│  │  ──── or ────                                        │
│  │  [FB] [Twitter] [GitHub] [Google]                    │
│  │                                                       │
│  │  New on our platform? Create an account              │
│  └────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────┘
```

### 5.2 HTML estrutural da página de login

```html
<div class="auth-wrapper d-flex align-center justify-center pa-4">
  <!-- Auth card -->
  <v-card
    class="auth-card pa-4 pt-7"
    max-width="448"
  >
    <!-- Logo -->
    <v-card-item class="justify-center">
      <router-link to="/" class="app-logo">
        <svg class="app-logo-svg"><!-- logo --></svg>
        <h1 class="font-weight-semibold app-logo-title ms-3">Vuexy</h1>
      </router-link>
    </v-card-item>

    <!-- Heading -->
    <v-card-text class="pt-2">
      <h4 class="text-h4 mb-1">Welcome to Vuexy! 👋</h4>
      <p class="mb-0">Please sign-in to your account and start the adventure</p>
    </v-card-text>

    <!-- Form -->
    <v-card-text>
      <VForm @submit.prevent="() => {}">
        <!-- Email -->
        <div class="mb-4">
          <v-text-field
            v-model="form.email"
            autofocus
            label="Email"
            type="email"
            placeholder="johndoe@email.com"
          />
        </div>

        <!-- Password -->
        <div class="mb-1">
          <v-row class="align-center mb-1">
            <v-col><label class="v-label">Password</label></v-col>
            <v-col class="text-end">
              <router-link class="text-primary ms-2 mb-1" to="/forgot-password">
                Forgot Password?
              </router-link>
            </v-col>
          </v-row>
          <v-text-field
            v-model="form.password"
            label="Password"
            :type="isPasswordVisible ? 'text' : 'password'"
            placeholder="············"
            :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            @click:append-inner="isPasswordVisible = !isPasswordVisible"
          />
        </div>

        <!-- Remember me -->
        <v-checkbox v-model="form.remember" label="Remember me" />

        <!-- Submit -->
        <v-btn
          block
          type="submit"
          color="primary"
          class="mt-2"
        >
          Login
        </v-btn>

        <!-- Divider -->
        <div class="d-flex align-center my-4">
          <v-divider />
          <span class="mx-4 text-medium-emphasis">or</span>
          <v-divider />
        </div>

        <!-- Social login -->
        <div class="d-flex justify-center gap-2">
          <v-btn icon variant="tonal" size="small"><v-icon>mdi-facebook</v-icon></v-btn>
          <v-btn icon variant="tonal" size="small"><v-icon>mdi-twitter</v-icon></v-btn>
          <v-btn icon variant="tonal" size="small"><v-icon>mdi-github</v-icon></v-btn>
          <v-btn icon variant="tonal" size="small"><v-icon>mdi-google</v-icon></v-btn>
        </div>
      </VForm>
    </v-card-text>

    <!-- Register link -->
    <v-card-text class="text-center text-base">
      <span>New on our platform? </span>
      <router-link class="text-primary" to="/register">Create an account</router-link>
    </v-card-text>
  </v-card>
</div>
```

### 5.3 Classes de auth background

```scss
// auth-wrapper ocupa 100vh e usa a imagem/mask de fundo
.auth-wrapper {
  min-block-size: 100dvh;
  background-color: rgb(var(--v-theme-background));

  // Mask decorativo — camadas SVG/PNG posicionadas
  .auth-bg-mask-top,
  .auth-bg-mask-bottom {
    position: absolute;
    pointer-events: none;
    inset-block-start: 0 / inset-block-end: 0;
  }
}
```

### 5.4 Credenciais demo

| Campo | Valor |
|---|---|
| Email | `admin@demo.com` |
| Password | `admin` |

---

## 6. Dashboard — Estrutura

### 6.1 Página inicial (`/dashboard` ou `/`)

O dashboard padrão do Vuexy Demo-6 é composto por:

```
┌── container-xxl ──────────────────────────────────────────────────┐
│                                                                    │
│  ┌─── ROW 1: Stats Cards (4 colunas) ──────────────────────────┐  │
│  │  [🎉 Congratulations]  [Orders]  [Profit]  [Payments]       │  │
│  │  Card welcome + img    Número+   Número+    Número+          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── ROW 2 ────────────────────────────────────────────────────┐  │
│  │  ┌── Weekly Overview (Bar chart) ─────┐  ┌── Total Revenue ─┐│  │
│  │  │  ApexCharts bar                    │  │  ApexCharts line ││  │
│  │  └────────────────────────────────────┘  └──────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── ROW 3 ────────────────────────────────────────────────────┐  │
│  │  ┌── Statistics ──────────────┐  ┌── Deposit / Withdraw ────┐│  │
│  │  │  4 mini-cards com ícones   │  │  Donut chart             ││  │
│  │  └────────────────────────────┘  └──────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─── ROW 4: Tabela + Activity ─────────────────────────────────┐  │
│  │  ┌── Latest Transactions (tabela) ──────────────────────────┐│  │
│  │  │  v-table com avatar, status badges, valores, datas       ││  │
│  │  └──────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 Componentes de card usados

```vue
<!-- Card de estatística simples -->
<v-card>
  <v-card-text>
    <div class="d-flex justify-space-between">
      <div>
        <p class="text-sm mb-1">Orders</p>
        <h4 class="text-h4 font-weight-medium">$4,550</h4>
        <span class="text-success text-sm">+22.5%</span>
      </div>
      <div>
        <v-avatar color="primary" rounded size="42" variant="tonal">
          <v-icon size="26">mdi-trending-up</v-icon>
        </v-avatar>
      </div>
    </div>
  </v-card-text>
</v-card>

<!-- Card de boas-vindas -->
<v-card color="primary" class="congratulations-card">
  <v-card-text>
    <h5 class="text-h5 font-weight-semibold">Congratulations John! 🎉</h5>
    <p class="text-sm">Best seller of the month</p>
    <p class="text-h4 text-primary font-weight-medium">$48.9k</p>
    <v-btn size="small" variant="elevated" color="white">View Sales</v-btn>
  </v-card-text>
  <img src="..." class="congratulations-john" alt="John" />
</v-card>
```

---

## 7. Menu Horizontal — Estrutura Detalhada

### 7.1 Topologia do menu

O Demo-6 usa `HorizontalNav` com **4 níveis máximos**:

```
Nível 0 (barra): [Dashboard] [Apps & Pages ▾] [UI Elements ▾] [Components ▾] [Others ▾]
                                    │
Nível 1 (dropdown):         ┌──────┴──────┐
                             Email        eCommerce
                             Chat         Project Management
                             Calendar     ...
                                    │
Nível 2 (sub-dropdown):      ┌─────┴──────┐
                              Product List Product Add ...
```

### 7.2 Itens de menu do Demo-6

```
📊 Dashboard
   ├── CRM
   ├── Analytics
   └── eCommerce

📱 Apps & Pages
   ├── Email
   ├── Chat
   ├── Calendar
   ├── Kanban
   ├── eCommerce
   │   ├── Dashboard
   │   ├── Product List
   │   ├── Add Product
   │   ├── Category List
   │   ├── Order List
   │   ├── Order Details
   │   ├── Customer List
   │   ├── Manage Reviews
   │   ├── Referrals
   │   └── Settings
   ├── Academy
   ├── Logistics
   ├── Invoice
   ├── User
   ├── Roles & Permissions
   └── Pages
       ├── Account Settings
       ├── Pricing
       ├── FAQ
       ├── Help Center
       ├── Auth Pages
       └── Wizard Examples

🎨 UI Elements  [MEGAMENU]
   ├── Typography
   ├── Icons
   ├── Cards
   ├── Tables
   │   ├── Simple Table
   │   └── Data Table
   ├── Form Elements
   │   ├── Text Field
   │   ├── Textarea
   │   ├── Select
   │   ├── Checkbox & Radio
   │   ├── Custom Inputs
   │   ├── Autocomplete
   │   ├── Date/Time Picker
   │   ├── File Input
   │   ├── Editors
   │   ├── Slider & Range
   │   └── Form Layout
   └── Form Wizard

🧩 Components
   ├── Alert
   ├── Avatar
   ├── Badge
   ├── Button
   ├── Chip
   ├── Dialogs
   ├── Expansion Panel
   ├── List
   ├── Menu
   ├── Pagination
   ├── Progress
   ├── Skeleton
   ├── Snackbar
   ├── Stepper
   ├── Tabs
   ├── Tooltip
   ├── Timeline
   └── ...

📋 Others
   ├── Charts
   │   ├── ApexCharts
   │   └── Chartjs
   ├── Access Control
   ├── Third Party
   ├── Extensions
   ├── Front Pages
   └── Misc
```

### 7.3 Comportamento do menu horizontal

- **Hover**: Abre dropdown/submenus com `mouseenter`
- **Megamenu**: Para grupos grandes (UI Elements) usa layout em colunas
- **Active state**: Item ativo recebe classe `active` + borda-bottom `primary`
- **Overflow**: Em viewports menores, converte para menu mobile (hamburguer)
- **Breakpoint mobile**: `<960px` — nav ocultado, hamburguer ativa drawer lateral

---

## 8. Componentes Vuetify 3 Mais Usados

### 8.1 Botões

```vue
<!-- Variantes principais -->
<v-btn color="primary">Primary</v-btn>
<v-btn color="primary" variant="tonal">Tonal</v-btn>
<v-btn color="primary" variant="outlined">Outlined</v-btn>
<v-btn color="primary" variant="text">Text</v-btn>
<v-btn color="primary" variant="plain">Plain</v-btn>
<v-btn color="primary" variant="elevated">Elevated</v-btn>

<!-- Com ícone -->
<v-btn color="primary" prepend-icon="mdi-plus">Add</v-btn>
<v-btn icon color="primary"><v-icon>mdi-pencil</v-icon></v-btn>

<!-- Tamanhos -->
<v-btn size="x-small" /><v-btn size="small" /><v-btn /><v-btn size="large" /><v-btn size="x-large" />
```

### 8.2 Badges e Chips

```vue
<!-- Badges de status -->
<v-chip color="success" size="small">Active</v-chip>
<v-chip color="warning" size="small">Pending</v-chip>
<v-chip color="error" size="small">Inactive</v-chip>
<v-chip color="info" size="small">Draft</v-chip>

<!-- Dot badges -->
<v-badge color="success" dot inline>Online</v-badge>
```

### 8.3 Alertas

```vue
<v-alert type="success" variant="tonal" title="Well done!">
  You successfully read this important alert message.
</v-alert>
<v-alert type="error" variant="tonal" closable>Error message</v-alert>
<v-alert type="warning" variant="outlined">Warning</v-alert>
<v-alert type="info" variant="flat">Info</v-alert>
```

### 8.4 Formulários

```vue
<!-- Text field com label floating -->
<v-text-field
  v-model="value"
  label="Full Name"
  placeholder="John Doe"
  variant="outlined"   <!-- variante padrão no Vuexy -->
/>

<!-- Select -->
<v-select
  v-model="selected"
  :items="items"
  label="Country"
  variant="outlined"
/>

<!-- Autocomplete -->
<v-autocomplete
  v-model="val"
  :items="list"
  label="Search"
  prepend-inner-icon="mdi-magnify"
  variant="outlined"
/>

<!-- Textarea -->
<v-textarea
  v-model="text"
  label="Message"
  rows="3"
  variant="outlined"
/>
```

### 8.5 Tabelas (v-data-table)

```vue
<v-data-table
  :headers="headers"
  :items="desserts"
  item-value="name"
>
  <template #item.status="{ item }">
    <v-chip :color="statusColor(item.status)" size="small" variant="tonal">
      {{ item.status }}
    </v-chip>
  </template>
  <template #item.actions="{ item }">
    <v-btn icon size="x-small" variant="text" color="primary">
      <v-icon>mdi-pencil-outline</v-icon>
    </v-btn>
    <v-btn icon size="x-small" variant="text" color="error">
      <v-icon>mdi-delete-outline</v-icon>
    </v-btn>
  </template>
</v-data-table>
```

### 8.6 Cards

```vue
<v-card>
  <v-card-item>
    <v-card-title>Card Title</v-card-title>
    <v-card-subtitle>Subtitle</v-card-subtitle>
    <template #append>
      <v-btn icon variant="text" size="x-small">
        <v-icon>mdi-dots-vertical</v-icon>
      </v-btn>
    </template>
  </v-card-item>
  <v-card-text>
    Content here
  </v-card-text>
  <v-card-actions>
    <v-btn>Action</v-btn>
  </v-card-actions>
</v-card>
```

---

## 9. Sistema de Ícones

### 9.1 Material Design Icons (MDI)

```html
<!-- Via @mdi/font — classes CSS -->
<i class="mdi mdi-home"></i>
<i class="mdi mdi-account-outline"></i>

<!-- Via v-icon (Vuetify — usa MDI por padrão) -->
<v-icon>mdi-home</v-icon>
<v-icon icon="mdi-account-outline" />
```

### 9.2 Ícones Iconify (alternativa/complemento)

```vue
<!-- Usando <Icon /> component do iconify/vue -->
<Icon icon="tabler:home" />
<Icon icon="mdi:account" />
<Icon icon="logos:vue" />
```

### 9.3 Ícones de alerta/status mais comuns

```
mdi-home               → Dashboard / Home
mdi-account-outline    → User / Profile
mdi-cog-outline        → Settings
mdi-bell-outline       → Notifications
mdi-magnify            → Search  
mdi-plus               → Add
mdi-pencil-outline     → Edit
mdi-delete-outline     → Delete / Trash
mdi-eye-outline        → View / Password show
mdi-eye-off-outline    → Password hide
mdi-chevron-right      → Arrow / Expand
mdi-chevron-down       → Dropdown arrow
mdi-dots-vertical      → More options (kebab menu)
mdi-trending-up        → Up trend / Stats
mdi-trending-down      → Down trend
mdi-check-circle       → Sucesso
mdi-close-circle       → Erro
mdi-alert-circle       → Warning
mdi-information        → Info
mdi-export-variant     → Export
mdi-import             → Import
mdi-filter-outline     → Filtros
mdi-calendar-outline   → Data
mdi-email-outline      → Email
mdi-phone-outline      → Telefone
mdi-map-marker-outline → Localização
mdi-briefcase-outline  → Empresa / CNPJ
mdi-clipboard-outline  → Protocolo / MTR
```

---

## 10. Grid System e Responsividade

O Vuexy usa o **grid do Vuetify 3** (baseado em CSS Grid/Flexbox, 12 colunas):

```vue
<v-row>
  <v-col cols="12" sm="6" md="3">
    <!-- 4 cards por linha em desktop, 2 em tablet, 1 em mobile -->
  </v-col>
</v-row>
```

### Breakpoints do Vuetify 3

| Nome | Largura mínima | Uso |
|---|---|---|
| `xs` | < 600px | Mobile |
| `sm` | ≥ 600px | Mobile landscape / tablet |
| `md` | ≥ 960px | Tablet landscape / laptop |
| `lg` | ≥ 1280px | Desktop |
| `xl` | ≥ 1920px | Large desktop |
| `xxl` | ≥ 2560px | Ultra-wide |

---

## 11. Dependências NPM Identificadas

### 11.1 `package.json` principal (aproximado)

```json
{
  "dependencies": {
    "vue":                          "^3.3.x",
    "vuetify":                      "^3.3.x",
    "vue-router":                   "^4.2.x",
    "pinia":                        "^2.1.x",
    "axios":                        "^1.4.x",
    "@mdi/font":                    "^7.2.x",
    "apexcharts":                   "^3.41.x",
    "vue3-apexcharts":              "^1.4.x",
    "@vueuse/core":                 "^10.3.x",
    "vue-i18n":                     "^9.x.x",
    "@casl/vue":                    "^2.x.x",
    "@casl/ability":                "^6.x.x",
    "perfect-scrollbar":            "^1.5.x",
    "swiper":                       "^10.x.x"
  },
  "devDependencies": {
    "vite":                         "^4.x.x / ^5.x.x",
    "@vitejs/plugin-vue":           "^4.x.x",
    "typescript":                   "^5.x.x",
    "sass":                         "^1.65.x",
    "unplugin-vue-components":      "^0.25.x",
    "unplugin-auto-import":         "^0.16.x",
    "@iconify/vue":                 "^4.1.x"
  }
}
```

### 11.2 Plugins Vite relevantes

```javascript
// vite.config.ts
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [
    vue(),
    Vuetify({ autoImport: true }),
    Components(),
    AutoImport({ imports: ['vue', 'vue-router', 'pinia'] }),
  ],
})
```

---

## 12. Estrutura de Arquivos do Template

```
src/
├── @core/                          # Core do template (não tocar)
│   ├── components/
│   │   ├── AppBarSearch.vue
│   │   ├── AppLoadingIndicator.vue
│   │   ├── ThemeSwitcher.vue
│   │   └── ...
│   ├── composables/
│   │   ├── useLayoutConfigStore.ts
│   │   └── ...
│   └── scss/
│       ├── _utilities.scss
│       ├── variables/
│       └── ...
├── @layouts/                       # Layouts (HorizontalNav, VerticalNav)
│   ├── components/
│   │   ├── HorizontalNav.vue
│   │   ├── HorizontalNavItems.vue
│   │   ├── DefaultLayoutWithHorizontalNav.vue
│   │   └── ...
│   └── ...
├── assets/                         # Imagens, SVGs
├── components/                     # Componentes da aplicação
│   ├── cards/
│   ├── dialogs/
│   └── ...
├── layouts/                        # Entry point dos layouts Vue Router
│   └── default.vue
├── pages/                          # Rotas file-based (vite-plugin-pages)
│   ├── [..all].vue                 # 404
│   ├── index.vue                   # Dashboard
│   ├── login.vue
│   ├── apps/
│   │   ├── email/
│   │   ├── chat/
│   │   └── ...
│   ├── components/
│   └── ...
├── plugins/                        # Registros de plugins
│   ├── vuetify/
│   │   ├── index.ts
│   │   └── theme.ts                # Definição das cores
│   ├── router/
│   ├── pinia.ts
│   └── ...
├── stores/                         # Pinia stores
│   └── ...
├── utils/                          # Utilitários
└── App.vue
```

---

## 13. Configuração de Tema Vuetify (como replicar)

```typescript
// src/plugins/vuetify/theme.ts
export const themes = {
  light: {
    dark: false,
    colors: {
      'primary':          '#7367F0',
      'secondary':        '#8392AB',
      'success':          '#28C76F',
      'info':             '#00CFE8',
      'warning':          '#FF9F43',
      'error':            '#EA5455',
      'on-primary':       '#FFFFFF',
      'on-secondary':     '#FFFFFF',
      'on-success':       '#FFFFFF',
      'background':       '#F5F5F9',
      'surface':          '#FFFFFF',
      'on-background':    '#4B465C',
      'on-surface':       '#4B465C',
    },
    variables: {
      'border-color':         '#4B465C',
      'medium-emphasis-opacity': 0.60,
      'high-emphasis-opacity': 0.87,
    },
  },
  dark: {
    dark: true,
    colors: {
      'primary':          '#7367F0',
      'secondary':        '#8392AB',
      'background':       '#282636',
      'surface':          '#312E43',
      'on-background':    '#E7E3FC',
      'on-surface':       '#E7E3FC',
      // resto igual ao light
    },
  },
}

// src/plugins/vuetify/index.ts
import { createVuetify } from 'vuetify'
import { themes } from './theme'

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes,
  },
  defaults: {
    VBtn: {
      style: 'text-transform: capitalize; letter-spacing: 0.3px;',
    },
    VCard: {
      class: 'rounded-lg',
    },
    VTextField: {
      variant: 'outlined',
      density: 'compact',
    },
    VSelect: {
      variant: 'outlined',
      density: 'compact',
    },
    VAutocomplete: {
      variant: 'outlined',
      density: 'compact',
    },
  },
})
```

---

## 14. Classes CSS globais de utilidade

Além das classes Vuetify, o Vuexy define utilidades customizadas:

```scss
// Weights
.font-weight-thin       { font-weight: 100; }
.font-weight-light      { font-weight: 300; }
.font-weight-regular    { font-weight: 400; }
.font-weight-medium     { font-weight: 500; }
.font-weight-semibold   { font-weight: 600; }
.font-weight-bold       { font-weight: 700; }
.font-weight-black      { font-weight: 900; }

// Text colors (baseadas em CSS vars)
.text-primary     { color: rgb(var(--v-theme-primary)) !important; }
.text-secondary   { color: rgb(var(--v-theme-secondary)) !important; }
.text-success     { color: rgb(var(--v-theme-success)) !important; }
.text-warning     { color: rgb(var(--v-theme-warning)) !important; }
.text-error       { color: rgb(var(--v-theme-error)) !important; }
.text-info        { color: rgb(var(--v-theme-info)) !important; }
.text-heading     { color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity)); }
.text-body        { color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)); }
.text-sm          { font-size: 0.875rem !important; }   // 14px
.text-xs          { font-size: 0.75rem !important; }    // 12px

// bg tonal (usada em cards coloridos)
.bg-primary       { background-color: rgb(var(--v-theme-primary)) !important; }
.bg-light-primary { background-color: rgba(var(--v-theme-primary), 0.1) !important; }

// Cursor
.cursor-pointer { cursor: pointer; }
```

---

## 15. Responsividade — Demo-6 Horizontal Nav em Mobile

Em viewport `<md` (< 960px):
1. O menu horizontal sumede (CSS `display: none`)
2. Aparece botão hamburguer no canto esquerdo do header
3. O menu vira um `v-navigation-drawer` lateral temporário
4. Os itens de menu são renderizados em lista vertical dentro do drawer

---

## 16. Guia de Implementação para Refatoração

### 16.1 Setup mínimo (sicat frontend → Vuexy-like)

```bash
npm install vuetify @mdi/font
npm install pinia @vueuse/core
npm install apexcharts vue3-apexcharts
npm install -D sass vite-plugin-vuetify
npm install -D unplugin-auto-import unplugin-vue-components
```

### 16.2 Estrutura de pastas recomendada

```
frontend/src/
├── components/
│   ├── layout/
│   │   ├── AppNavbarHorizontal.vue   # barra horizontal principal
│   │   ├── AppNavItem.vue            # item de menu com dropdown
│   │   ├── AppFooter.vue
│   │   └── AppUserMenu.vue
│   ├── common/
│   │   ├── StatsCard.vue
│   │   ├── StatusBadge.vue
│   │   └── DataTableCard.vue
│   └── ...
├── layouts/
│   └── DefaultLayout.vue             # wrapper principal
├── pages/ (ou views/)
│   ├── LoginPage.vue
│   ├── DashboardPage.vue
│   └── ...
├── plugins/
│   ├── vuetify.ts
│   └── router.ts
└── App.vue
```

### 16.3 Checklist de fidelidade visual

- [ ] Font "Public Sans" via `<link>` no index.html
- [ ] Vuetify com tema configurado (paleta de cores acima)
- [ ] MDI icons instalados (`@mdi/font/css/materialdesignicons.min.css`)
- [ ] `v-btn` com `text-transform: capitalize` no default
- [ ] `v-text-field` / `v-select` com `variant="outlined"` no default
- [ ] `v-card` com `rounded-lg` no default
- [ ] Background da página: `#F5F5F9` (não branco puro)
- [ ] Navbar sticky com `position: sticky; top: 0; z-index: 1100;`
- [ ] `container-xxl` na navbar com `max-width: 1440px; margin: 0 auto;`
- [ ] Padding do content: `24px` vertical, `24px` horizontal

---

## Script de Execução

Para rodar o script Playwright de coleta de dados ao vivo:

```powershell
# A partir da raiz do sicat
cd frontend

# 1. Instalar browsers (apenas uma vez)
npx playwright install chromium

# 2. Executar o script de mapeamento
node ../scripts/map-vuexy-demo6.mjs

# Resultados em: storage/temp/vuexy-demo6/
# - report.json       (dados JSON completos)
# - 01-login.png      (screenshot da página de login)
# - 03-dashboard.png  (screenshot do dashboard)
```

---

*Relatório gerado por análise técnica aprofundada do Vuexy Vue.js Admin Template.*  
*Demo-6 URL: https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6*
