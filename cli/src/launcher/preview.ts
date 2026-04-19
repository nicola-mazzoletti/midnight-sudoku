// This file is part of midnightntwrk/example-counter.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createLogger } from "../logger-utils.js";
import { run } from "../index.js";
import { PreviewRemoteConfig } from "../config.js";

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

const config = new PreviewRemoteConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
