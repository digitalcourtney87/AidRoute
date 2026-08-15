// Client helper: never call res.json() on an empty or non-JSON body.
// Unhandled route 500s come back with no payload, and the browser then
// throws "Unexpected end of JSON input" — which is what operators saw
// on /ask and /checklist while the store was down.
export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : "Something went wrong — try again.";
    throw new Error(message);
  }
  if (body === null || typeof body !== "object") {
    throw new Error("Something went wrong — try again.");
  }
  return body as T;
}
