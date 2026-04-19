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

import path from "node:path";
import fs from "node:fs";
import { type EnvironmentConfiguration } from "@midnight-ntwrk/testkit-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

export interface Config {
  readonly privateStateStoreName: string;
  readonly logDir: string;
  readonly zkConfigPath: string;
  getEnvironmentConfiguration(): EnvironmentConfiguration;
  readonly requestFaucetTokens: boolean;
  readonly generateDust: boolean;
  readonly walletSeed: string | undefined;
}

export const currentDir = path.resolve(new URL(import.meta.url).pathname, "..");

const loadEnvSeed = (networkId: string): string | undefined => {
  const envFile = path.resolve(currentDir, "..", `.env.${networkId}`);
  if (!fs.existsSync(envFile)) return undefined;
  const match = fs.readFileSync(envFile, "utf8").match(/^WALLET_SEED=(.+)$/m);
  return match?.[1]?.trim() || undefined;
};

const loadProofServerUrl = (): string =>
  process.env.PROOF_SERVER_URL ?? "http://localhost:6300";

export class StandaloneConfig implements Config {
  getEnvironmentConfiguration(): EnvironmentConfiguration {
    setNetworkId("undeployed");
    return {
      walletNetworkId: "undeployed",
      networkId: "undeployed",
      indexer: "http://127.0.0.1:8088/api/v4/graphql",
      indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
      node: "http://127.0.0.1:9944",
      nodeWS: "ws://127.0.0.1:9944",
      proofServer: "http://127.0.0.1:6300",
      faucet: undefined,
    };
  }
  readonly walletSeed = loadEnvSeed("standalone");
  privateStateStoreName = "sudoku-private-state";
  logDir = path.resolve(
    currentDir,
    "..",
    "logs",
    "standalone",
    `${new Date().toISOString()}.log`,
  );
  zkConfigPath = path.resolve(
    currentDir,
    "..",
    "..",
    "contract",
    "src",
    "managed",
    "sudoku",
  );
  requestFaucetTokens = false;
  generateDust = true;
}

export class PreviewRemoteConfig implements Config {
  getEnvironmentConfiguration(): EnvironmentConfiguration {
    setNetworkId("preview");
    return {
      walletNetworkId: "preview",
      networkId: "preview",
      indexer: "https://indexer.preview.midnight.network/api/v3/graphql",
      indexerWS: "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
      node: "https://rpc.preview.midnight.network",
      nodeWS: "wss://rpc.preview.midnight.network",
      faucet: "https://faucet.preview.midnight.network/api/request-tokens",
      proofServer: loadProofServerUrl(),
    };
  }
  readonly walletSeed = loadEnvSeed("preview");
  privateStateStoreName = "sudoku-private-state";
  logDir = path.resolve(
    currentDir,
    "..",
    "logs",
    "preview-remote",
    `${new Date().toISOString()}.log`,
  );
  zkConfigPath = path.resolve(
    currentDir,
    "..",
    "..",
    "contract",
    "src",
    "managed",
    "sudoku",
  );
  requestFaucetTokens = false;
  generateDust = true;
}

export class PreprodRemoteConfig implements Config {
  getEnvironmentConfiguration(): EnvironmentConfiguration {
    setNetworkId("preprod");
    return {
      walletNetworkId: "preprod",
      networkId: "preprod",
      indexer: "https://indexer.preprod.midnight.network/api/v3/graphql",
      indexerWS: "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
      node: "https://rpc.preprod.midnight.network",
      nodeWS: "wss://rpc.preprod.midnight.network",
      faucet: "https://faucet.preprod.midnight.network/api/request-tokens",
      proofServer: loadProofServerUrl(),
    };
  }
  readonly walletSeed = loadEnvSeed("preprod");
  privateStateStoreName = "sudoku-private-state";
  logDir = path.resolve(
    currentDir,
    "..",
    "logs",
    "preprod-remote",
    `${new Date().toISOString()}.log`,
  );
  zkConfigPath = path.resolve(
    currentDir,
    "..",
    "..",
    "contract",
    "src",
    "managed",
    "sudoku",
  );
  requestFaucetTokens = false;
  generateDust = true;
}
