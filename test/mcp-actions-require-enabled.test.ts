import {
  isMcpEnabled,
  getClientsStatus,
  getClientTools,
  getAvailableClientsCount,
  getAllTools,
  initializeMcpSystem,
  addMcpServer,
  pauseMcpServer,
  resumeMcpServer,
  removeMcpServer,
  restartAllClients,
  executeMcpAction,
  getMcpConfigFromFile,
} from "../app/mcp/actions";

// Regression coverage for the unauthenticated MCP server actions: every one of
// these functions is a Next.js Server Action, callable directly over HTTP with
// no session or auth check. addMcpServer in particular spawns a child process
// using a caller-supplied command, so leaving these ungated is remote code
// execution regardless of whether MCP was ever turned on (ENABLE_MCP unset,
// which is the default, is exactly the case exercised below).
describe("MCP server actions require MCP to be enabled", () => {
  const ORIGINAL_ENABLE_MCP = process.env.ENABLE_MCP;
  const ORIGINAL_CODE = process.env.CODE;

  afterEach(() => {
    if (ORIGINAL_ENABLE_MCP === undefined) {
      delete process.env.ENABLE_MCP;
    } else {
      process.env.ENABLE_MCP = ORIGINAL_ENABLE_MCP;
    }

    if (ORIGINAL_CODE === undefined) {
      delete process.env.CODE;
    } else {
      process.env.CODE = ORIGINAL_CODE;
    }
  });

  describe("when ENABLE_MCP is unset (the default)", () => {
    beforeEach(() => {
      delete process.env.ENABLE_MCP;
    });

    test.each<[string, () => Promise<unknown>]>([
      ["getClientsStatus", () => getClientsStatus("")],
      ["getClientTools", () => getClientTools("x", "")],
      ["getAvailableClientsCount", () => getAvailableClientsCount("")],
      ["getAllTools", () => getAllTools("")],
      ["initializeMcpSystem", () => initializeMcpSystem("")],
      [
        "addMcpServer",
        () =>
          addMcpServer(
            "attack",
            {
              command: "touch",
              args: ["/tmp/pwned"],
            } as any,
            "",
          ),
      ],
      ["pauseMcpServer", () => pauseMcpServer("x", "")],
      ["resumeMcpServer", () => resumeMcpServer("x", "")],
      ["removeMcpServer", () => removeMcpServer("x", "")],
      ["restartAllClients", () => restartAllClients("")],
      ["executeMcpAction", () => executeMcpAction("x", {} as any, "")],
      ["getMcpConfigFromFile", () => getMcpConfigFromFile("")],
    ])("%s rejects instead of running", async (_name, callAction) => {
      await expect(callAction()).rejects.toThrow("MCP is not enabled");
    });
  });

  describe("when ENABLE_MCP=true", () => {
    beforeEach(() => {
      process.env.ENABLE_MCP = "true";
      process.env.CODE = "test-code";
    });

    test("legacy ENABLE_MCP cannot enable processes in the serverless deployment", async () => {
      expect(await isMcpEnabled()).toBe(false);
    });

    test("even a valid code cannot read local MCP configuration", async () => {
      await expect(getMcpConfigFromFile("test-code")).rejects.toThrow(
        "MCP is not enabled",
      );
    });

    test("even a valid code cannot start a caller-provided command", async () => {
      await expect(
        addMcpServer(
          "disabled",
          { command: "unused", args: [] } as any,
          "test-code",
        ),
      ).rejects.toThrow("MCP is not enabled");
    });

    test("getMcpConfigFromFile rejects an invalid access code", async () => {
      await expect(getMcpConfigFromFile("wrong-code")).rejects.toThrow(
        "MCP is not enabled",
      );
    });

    test("MCP fails closed when CODE is not configured", async () => {
      delete process.env.CODE;
      await expect(getMcpConfigFromFile("")).rejects.toThrow(
        "MCP is not enabled",
      );
    });
  });
});
