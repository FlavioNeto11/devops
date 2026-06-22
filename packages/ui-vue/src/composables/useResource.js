// useResource.js — camada de dados p/ listas (server-mode): paginação/ordenação/filtro + estados.
// const r = useResource(api.products);  // api.products = { list, get, create, update, remove }
// r.items, r.item, r.loading, r.error, r.page, r.pageSize, r.total, r.sort, r.filters, r.load(), r.get(id) ...
import { ref, reactive } from 'vue';

export function useResource(resource, opts = {}) {
  const items = ref([]);
  const item = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const page = ref(1);
  const pageSize = ref(opts.pageSize || 25);
  const total = ref(0);
  const sort = ref(opts.sort || null); // { key, dir }
  const filters = reactive({ ...(opts.filters || {}) });

  async function load() {
    loading.value = true; error.value = null;
    try {
      const params = { page: page.value, pageSize: pageSize.value, ...filters };
      if (sort.value) { params.sort = sort.value.key; params.dir = sort.value.dir; }
      const res = await resource.list(params);
      if (Array.isArray(res)) { items.value = res; total.value = res.length; }
      else { items.value = res.data || res.items || []; total.value = res.total ?? items.value.length; }
    } catch (e) { error.value = e; items.value = []; }
    finally { loading.value = false; }
  }
  async function get(id) {
    loading.value = true; error.value = null;
    try { item.value = await resource.get(id); return item.value; }
    catch (e) { error.value = e; throw e; }
    finally { loading.value = false; }
  }
  const create = (body) => resource.create(body);
  const update = (id, body) => resource.update(id, body);
  const remove = (id) => resource.remove(id);
  function setSort(s) { sort.value = s; page.value = 1; load(); }
  function setPage(p) { page.value = p; load(); }
  function setFilters(f) { Object.assign(filters, f); page.value = 1; load(); }
  const refresh = load;

  return { items, item, loading, error, page, pageSize, total, sort, filters, load, get, create, update, remove, setSort, setPage, setFilters, refresh };
}
