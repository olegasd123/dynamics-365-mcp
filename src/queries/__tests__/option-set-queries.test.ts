import { describe, expect, it } from "vitest";
import {
  globalOptionSetDefinitionPath,
  globalOptionSetDefinitionsPath,
  listGlobalOptionSetsQuery,
} from "../option-set-queries.js";

describe("option set queries", () => {
  it("builds the global option set list query", () => {
    const query = listGlobalOptionSetsQuery();

    expect(query).toContain(
      "$select=MetadataId,Name,DisplayName,Description,OptionSetType,IsGlobal,IsManaged,IsCustomOptionSet",
    );
    expect(query).toContain("$orderby=Name asc");
  });

  it("builds global option set metadata paths", () => {
    expect(globalOptionSetDefinitionsPath()).toBe("GlobalOptionSetDefinitions");
    expect(globalOptionSetDefinitionPath("00000000-0000-0000-0000-000000000001")).toBe(
      "GlobalOptionSetDefinitions(00000000-0000-0000-0000-000000000001)",
    );
  });
});
