import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllPrompts, EXPECTED_PROMPT_NAMES } from "../prompts/index.js";
import {
  ENVIRONMENT_STARTER_TEMPLATE_URI,
  STATIC_RESOURCE_URIS,
  registerAllResources,
} from "../resources/index.js";
import { createTestConfig } from "../tools/__tests__/tool-test-helpers.js";

async function createConnectedClient(environmentNames: string[]) {
  const server = new McpServer({
    name: "prompt-resource-test-server",
    version: "1.0.0",
  });
  const config = createTestConfig(environmentNames);

  registerAllPrompts(server, config);
  registerAllResources(server, config);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "prompt-resource-test-client",
    version: "1.0.0",
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  async function close(): Promise<void> {
    await Promise.allSettled([client.close(), server.close()]);
  }

  return { client, close };
}

describe("MCP prompts and resources", () => {
  it("publishes the expected prompt list and environment completion", async () => {
    const harness = await createConnectedClient(["dev", "test", "prod"]);

    try {
      const prompts = await harness.client.listPrompts();
      const names = prompts.prompts
        .map((prompt) => prompt.name)
        .sort((left, right) => left.localeCompare(right));

      expect(names).toEqual([...EXPECTED_PROMPT_NAMES]);

      const discoverMetadata = prompts.prompts.find(
        (prompt) => prompt.name === "discover_metadata",
      );
      expect(discoverMetadata?.arguments?.map((argument) => argument.name)).toEqual([
        "environment",
        "query",
        "componentType",
      ]);
      expect(
        prompts.prompts
          .find((prompt) => prompt.name === "release_gate_check")
          ?.arguments?.map((argument) => argument.name),
      ).toEqual(["environment", "solution", "compareWith"]);
      expect(
        prompts.prompts
          .find((prompt) => prompt.name === "analyze_environment_drift")
          ?.arguments?.map((argument) => argument.name),
      ).toEqual(["baselineEnvironment", "targetEnvironments", "componentType"]);

      const completion = await harness.client.complete({
        ref: {
          type: "ref/prompt",
          name: "discover_metadata",
        },
        argument: {
          name: "environment",
          value: "d",
        },
      });

      expect(completion.completion.values).toEqual(["dev"]);
    } finally {
      await harness.close();
    }
  });

  it("returns stable prompt messages for common tasks", async () => {
    const harness = await createConnectedClient(["dev", "prod"]);

    try {
      const prompt = await harness.client.getPrompt({
        name: "review_solution",
        arguments: {
          environment: "dev",
          solution: "ContosoCore",
          focus: "dependencies",
        },
      });

      expect(prompt.description).toContain("ContosoCore");
      expect(prompt.messages).toHaveLength(1);
      expect(prompt.messages[0]).toMatchObject({
        role: "user",
        content: {
          type: "text",
        },
      });
      if (prompt.messages[0]?.content.type !== "text") {
        throw new Error("Expected a text content block");
      }
      expect(prompt.messages[0].content.text).toContain("get_solution_details");
      expect(prompt.messages[0].content.text).toContain("dependencies");

      const releasePrompt = await harness.client.getPrompt({
        name: "release_gate_check",
        arguments: {
          environment: "prod",
          solution: "ContosoCore",
          compareWith: "test",
        },
      });
      if (releasePrompt.messages[0]?.content.type !== "text") {
        throw new Error("Expected a text content block");
      }
      expect(releasePrompt.messages[0].content.text).toContain("environment_health_report");
      expect(releasePrompt.messages[0].content.text).toContain("compare_solutions");

      const pluginPrompt = await harness.client.getPrompt({
        name: "investigate_plugin_failure",
        arguments: {
          environment: "dev",
          pluginName: "Contoso.Plugins.AccountPlugin",
          assemblyName: "Contoso.Plugins",
          symptom: "step does not fire on update",
        },
      });
      if (pluginPrompt.messages[0]?.content.type !== "text") {
        throw new Error("Expected a text content block");
      }
      expect(pluginPrompt.messages[0].content.text).toContain("get_plugin_details");
      expect(pluginPrompt.messages[0].content.text).toContain("list_plugin_steps");

      const driftPrompt = await harness.client.getPrompt({
        name: "analyze_environment_drift",
        arguments: {
          baselineEnvironment: "prod",
          targetEnvironments: "dev, test",
          componentType: "plugins",
        },
      });
      if (driftPrompt.messages[0]?.content.type !== "text") {
        throw new Error("Expected a text content block");
      }
      expect(driftPrompt.messages[0].content.text).toContain("compare_environment_matrix");
      expect(driftPrompt.messages[0].content.text).toContain("compare_plugin_assemblies");
    } finally {
      await harness.close();
    }
  });

  it("publishes fixed resources, environment starter resources, and template completion", async () => {
    const harness = await createConnectedClient(["dev", "test"]);

    try {
      const resources = await harness.client.listResources();
      const resourceUris = resources.resources
        .map((resource) => resource.uri)
        .sort((left, right) => left.localeCompare(right));

      expect(resourceUris).toEqual(
        [
          ...STATIC_RESOURCE_URIS,
          "d365://environments/dev/starter",
          "d365://environments/test/starter",
        ].sort((left, right) => left.localeCompare(right)),
      );

      const templates = await harness.client.listResourceTemplates();
      expect(templates.resourceTemplates).toHaveLength(1);
      expect(templates.resourceTemplates[0]).toMatchObject({
        name: "environment-starter",
        uriTemplate: ENVIRONMENT_STARTER_TEMPLATE_URI,
      });

      const completion = await harness.client.complete({
        ref: {
          type: "ref/resource",
          uri: ENVIRONMENT_STARTER_TEMPLATE_URI,
        },
        argument: {
          name: "environment",
          value: "te",
        },
      });

      expect(completion.completion.values).toEqual(["test"]);
    } finally {
      await harness.close();
    }
  });

  it("reads fixed and dynamic markdown resources", async () => {
    const harness = await createConnectedClient(["dev", "prod"]);

    try {
      const gettingStarted = await harness.client.readResource({
        uri: "d365://guides/getting-started",
      });
      expect(gettingStarted.contents[0]).toMatchObject({
        uri: "d365://guides/getting-started",
        mimeType: "text/markdown",
      });
      if (!("text" in gettingStarted.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(gettingStarted.contents[0].text).toContain("Dynamics 365 MCP Starter");
      expect(gettingStarted.contents[0].text).toContain("discover_metadata");
      expect(gettingStarted.contents[0].text).toContain("release_gate_check");
      expect(gettingStarted.contents[0].text).toContain("## By Role");

      const toolGroups = await harness.client.readResource({
        uri: "d365://reference/tool-groups",
      });
      if (!("text" in toolGroups.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(toolGroups.contents[0].text).toContain("## Solutions And ALM");
      expect(toolGroups.contents[0].text).toContain("`list_environment_variables`");
      expect(toolGroups.contents[0].text).toContain("`compare_environment_matrix`");

      const promptReference = await harness.client.readResource({
        uri: "d365://reference/prompts",
      });
      if (!("text" in promptReference.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(promptReference.contents[0].text).toContain("`investigate_plugin_failure`");
      expect(promptReference.contents[0].text).toContain("`trace_flow_dependency`");

      const taskRouting = await harness.client.readResource({
        uri: "d365://reference/task-routing",
      });
      if (!("text" in taskRouting.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(taskRouting.contents[0].text).toContain("## Common Tasks");
      expect(taskRouting.contents[0].text).toContain("`release_gate_check`");
      expect(taskRouting.contents[0].text).toContain("`review_security_role`");

      const releaseChecklist = await harness.client.readResource({
        uri: "d365://reference/release-checklist",
      });
      if (!("text" in releaseChecklist.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(releaseChecklist.contents[0].text).toContain("# Release Checklist");
      expect(releaseChecklist.contents[0].text).toContain("`environment_health_report`");

      const pluginTroubleshooting = await harness.client.readResource({
        uri: "d365://reference/plugin-troubleshooting",
      });
      if (!("text" in pluginTroubleshooting.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(pluginTroubleshooting.contents[0].text).toContain("# Plugin Troubleshooting");
      expect(pluginTroubleshooting.contents[0].text).toContain("`get_plugin_assembly_details`");

      const environmentStarter = await harness.client.readResource({
        uri: "d365://environments/dev/starter",
      });
      if (!("text" in environmentStarter.contents[0])) {
        throw new Error("Expected text resource content");
      }
      expect(environmentStarter.contents[0].text).toContain("Starter For dev");
      expect(environmentStarter.contents[0].text).toContain("release_gate_check");
      expect(environmentStarter.contents[0].text).toContain("## Quick Paths By Task");
      expect(environmentStarter.contents[0].text).toContain(
        "Compare solution ContosoCore between dev and prod.",
      );
    } finally {
      await harness.close();
    }
  });
});
