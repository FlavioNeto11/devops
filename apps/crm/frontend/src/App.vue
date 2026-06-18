<template>
  <nav>
    <RouterLink to="/empresas">Empresas</RouterLink>
  </nav>
  <main>
    <RouterView />
  </main>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
nav { background: #1e293b; padding: .75rem 1.5rem; display: flex; gap: 1.5rem; }
nav a { color: #7dd3fc; text-decoration: none; font-weight: 500; font-size: .95rem; }
nav a:hover, nav a.router-link-active { color: #fff; }
main { max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
</style>
