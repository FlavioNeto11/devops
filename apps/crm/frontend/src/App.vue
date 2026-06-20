<template>
  <nav>
    <RouterLink to="/">Painel</RouterLink>
    <RouterLink to="/negocios">Negócios</RouterLink>
    <RouterLink to="/empresas">Empresas</RouterLink>
    <RouterLink to="/contatos">Contatos</RouterLink>
  </nav>
  <main>
    <RouterView />
  </main>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Inter", system-ui, sans-serif; background: rgb(var(--p-bg)); color: rgb(var(--p-fg)); }
h1, h2 { font-family: "Sora", "Inter", sans-serif; }
nav { background: #1e293b; padding: .75rem 1.5rem; display: flex; gap: 1.5rem; }
nav a { color: #c7d2fe; text-decoration: none; font-weight: 500; font-size: .95rem; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
nav a:hover, nav a.router-link-active { color: #fff; }
main { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }

/* Foco visível acessível (anel indigo) */
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, .tab:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>
