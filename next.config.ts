import type { NextConfig } from "next";

const config: NextConfig = {
  // node:sqlite and the MCP SDK run as-is on the server; nothing to bundle.
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

export default config;
