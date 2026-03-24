export async function readJsonResponse<T>(response: Response): Promise<T> {
  const rawBody = await response.text();

  if (!rawBody) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    const compactBody = rawBody.replace(/\s+/g, " ").trim();
    const preview = compactBody.slice(0, 180);
    throw new Error(`Request failed with status ${response.status}: ${preview}`);
  }
}
