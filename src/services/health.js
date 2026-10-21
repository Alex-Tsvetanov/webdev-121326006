// Answers whether the app can serve requests now. The HTTP route turns the answer into a status code.
export function createHealthService({ repo }) {
  return {
    async check() {
      try {
        await repo.ping();
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };
}
