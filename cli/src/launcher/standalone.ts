import { createLogger } from "../logger-utils.js";
import { run } from "../index.js";
import { StandaloneConfig } from "../config.js";

// Suppress noisy wallet SDK / polkadot.js messages written directly to stderr.
const _stderr = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
  const s = typeof chunk === "string" ? chunk : String(chunk);
  if (
    s.includes("API-WS:") ||
    s.includes("Wallet.Sync") ||
    s.includes("RPC-CORE:")
  )
    return true;
  return (_stderr as (c: unknown, ...a: unknown[]) => boolean)(chunk, ...args);
}) as typeof process.stderr.write;

const config = new StandaloneConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
