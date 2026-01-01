async function requestJson(url, options, methodLabel) {
  const resp = await fetch(url, options);
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `${methodLabel} ${url} failed`);
  return json;
}

export async function apiGet(url) {
  const resp = await fetch(url);
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(json?.error || `GET ${url} failed`);
  return json;
}

export async function apiPut(url, body) {
  return requestJson(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, "PUT");
}

export async function apiPost(url, body) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, "POST");
}

export async function apiDelete(url) {
  return requestJson(url, { method: "DELETE" }, "DELETE");
}
