/**
 * Test fixture: runs one agent server in its own process with its own
 * ARTIFACT_DIR (isolated projects registry).
 *
 * Usage: bun agent-fixture.ts <home> <port> <remoteId> <token>
 * Prints `READY <port>` on stdout once bound; SIGTERM stops cleanly.
 */
const [home, portRaw, remoteId, token] = process.argv.slice(2);
if (!home || !portRaw || !remoteId || !token) {
  console.error("usage: agent-fixture.ts <home> <port> <remoteId> <token>");
  process.exit(2);
}
process.env.ARTIFACT_DIR = home;

const { createArtifactServer } = await import("../../../server/index.js");
const handle = await createArtifactServer({
  port: parseInt(portRaw, 10),
  host: "127.0.0.1",
  role: "agent",
  remoteId,
  remoteToken: token,
  serveDashboard: false,
});
console.log(`READY ${handle.port}`);

const shutdown = () => {
  handle.stop().then(() => process.exit(0)).catch(() => process.exit(1));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
await new Promise(() => {});
