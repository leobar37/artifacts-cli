/**
 * Seed preview data for the remote-broker manual scenario.
 *
 *   bun run mock:broker
 *   ARTIFACT_BROKER_TOKEN=test-only-token ARTIFACT_DIR=/tmp/artifact-broker-mock/broker-home artifact broker start --port 7000
 *   ARTIFACT_BROKER_TOKEN=test-only-token ARTIFACT_DIR=/tmp/artifact-broker-mock/agent-a-home artifact agent start --broker http://127.0.0.1:7000 --name ubuntu-dev --host 127.0.0.1 -p 7001
 *   ARTIFACT_BROKER_TOKEN=test-only-token ARTIFACT_DIR=/tmp/artifact-broker-mock/agent-b-home artifact agent start --broker http://127.0.0.1:7000 --name local-dev --host 127.0.0.1 -p 7002
 *
 * Then open only the broker root (http://localhost:7000/). Both remote names
 * are visible; each artifact loads its own HTML under /r/<remoteId>/p/...;
 * editing one source reloads only its viewer. ARTIFACT_DIR keeps ~/.artifact
 * untouched. Stop agents/broker, then rm -rf /tmp/artifact-broker-mock.
 */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { registerProject } from "../src/utils/projects.js";

const ROOT = "/tmp/artifact-broker-mock";
const TOKEN = "test-only-token";

function html(title: string, body: string): string {
  return `<html><head><title>${title}</title><meta name="artifact-type" content="study"></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

function seedAgent(homeName: string, projName: string, title: string, body: string): void {
  process.env.ARTIFACT_DIR = path.join(ROOT, homeName);
  const dir = path.join(ROOT, projName);
  mkdirSync(path.join(dir, "docs", "artifacts", "demo"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "artifacts", "demo", "index.html"), html(title, body));
  const entry = registerProject(dir);
  console.log(`  ${homeName}: ${entry.name} (${entry.projectId}) -> ${dir}`);
}

rmSync(ROOT, { recursive: true, force: true });

console.log("Mock agent projects seeded under /tmp/artifact-broker-mock:");
seedAgent("agent-a-home", "proj-shop-a", "Shop A", "served by agent A");
seedAgent("agent-b-home", "proj-shop-b", "Shop B", servedByB());
console.log("");
console.log("Run (three terminals, same token):");
console.log(`  ARTIFACT_BROKER_TOKEN=${TOKEN} ARTIFACT_DIR=${ROOT}/broker-home artifact broker start --port 7000`);
console.log(`  ARTIFACT_BROKER_TOKEN=${TOKEN} ARTIFACT_DIR=${ROOT}/agent-a-home artifact agent start --broker http://127.0.0.1:7000 --name ubuntu-dev --host 127.0.0.1 -p 7001`);
console.log(`  ARTIFACT_BROKER_TOKEN=${TOKEN} ARTIFACT_DIR=${ROOT}/agent-b-home artifact agent start --broker http://127.0.0.1:7000 --name local-dev --host 127.0.0.1 -p 7002`);
console.log("");
console.log("Then open only the broker root: http://localhost:7000/");
console.log("(stop everything, then rm -rf /tmp/artifact-broker-mock to clean up).");

function servedByB(): string {
  return "served by agent B";
}
