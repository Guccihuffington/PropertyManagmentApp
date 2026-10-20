let token = window.localStorage.getItem("propflow-token");
export const getToken = () => token;
export const setToken = (t) => {
  token = t;
  t ? window.localStorage.setItem("propflow-token", t) : window.localStorage.removeItem("propflow-token");
};

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Read a File into a data: URL so it can be sent as JSON.
export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(file);
  });

// Download a protected document with the user's session.
export async function downloadDoc(doc) {
  const res = await fetch(`/api/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return window.alert("Could not download that document.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.name;
  a.click();
  URL.revokeObjectURL(url);
}
