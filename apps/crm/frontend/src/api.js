const BASE = '/crm/api'

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro na requisição')
  return data
}

export const api = {
  companies: {
    list: (q) => request('GET', '/companies' + (q ? '?q=' + encodeURIComponent(q) : '')),
    get: (id) => request('GET', '/companies/' + id),
    create: (data) => request('POST', '/companies', data),
    update: (id, data) => request('PUT', '/companies/' + id, data),
    remove: (id) => request('DELETE', '/companies/' + id),
  },
  contacts: {
    list: (q) => request('GET', '/contacts' + (q ? '?q=' + encodeURIComponent(q) : '')),
    get: (id) => request('GET', '/contacts/' + id),
    create: (data) => request('POST', '/contacts', data),
    update: (id, data) => request('PUT', '/contacts/' + id, data),
    remove: (id) => request('DELETE', '/contacts/' + id),
  },
}
