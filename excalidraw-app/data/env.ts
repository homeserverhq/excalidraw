// Unsubstituted `${VAR}` placeholders must not shadow the build-time env.
const PLACEHOLDER_RE = /^\$\{[^}]+\}$/;

const sanitizeEnv = (raw: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(raw).filter(
      ([, value]) =>
        typeof value === "string" && !PLACEHOLDER_RE.test(value.trim()),
    ),
  ) as Record<string, string>;

export const loadRuntimeEnv = async (): Promise<Record<string, string>> => {
  try {
    const res = await fetch("/env.json");
    if (!res.ok) {
      return {};
    }
    return sanitizeEnv(await res.json());
  } catch {
    return {};
  }
};

let runtimeEnvPromise: Promise<Record<string, string>> | null = null;

export const getRuntimeEnv = async (): Promise<Record<string, string>> => {
  if (!runtimeEnvPromise) {
    runtimeEnvPromise = loadRuntimeEnv();
  }
  return runtimeEnvPromise;
};
