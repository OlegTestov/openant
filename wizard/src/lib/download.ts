export async function downloadBlueprint(): Promise<void> {
  const token = localStorage.getItem('setup_token');
  const res = await fetch('/api/make-blueprint', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openant-pinterest.json';
  a.click();
  URL.revokeObjectURL(url);
}
