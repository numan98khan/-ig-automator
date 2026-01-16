export const requireEnv = (name: string): string => {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};
