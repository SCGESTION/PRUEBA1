import { useCallback, useEffect, useState } from "react";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    let message = "No se pudo completar la solicitud.";
    try {
      const body = await response.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail.map((e: { msg: string }) => e.msg).join(" · ")
            : message;
    } catch {
      /* The API may return a proxy error. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      setData(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (mounted) setData(value);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [path, version]);
  return { data, loading, error, refresh };
}
export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const run = async <T>(
    fn: () => Promise<T>,
    message = "Cambios guardados.",
    after?: (value: T) => void,
  ) => {
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const value = await fn();
      setSuccess(message);
      after?.(value);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ha ocurrido un error.");
      return null;
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    error,
    success,
    run,
    clear: () => {
      setError("");
      setSuccess("");
    },
  };
}
