import { describe, expect, it } from "vitest";
import {
  getCustomApiByIdentityQuery,
  listCustomApiRequestParametersForApisQuery,
  listCustomApiRequestParametersQuery,
  listCustomApiResponsePropertiesForApisQuery,
  listCustomApiResponsePropertiesQuery,
  listCustomApisQuery,
} from "../custom-api-queries.js";

describe("custom api queries", () => {
  it("builds the custom api list query", () => {
    const query = listCustomApisQuery("Order");

    expect(query).toContain("contains(name,'Order')");
    expect(query).toContain("contains(uniquename,'Order')");
    expect(query).toContain("$orderby=name asc");
  });

  it("builds the custom api identity query", () => {
    const query = getCustomApiByIdentityQuery({ uniqueName: "contoso_DoThing" });

    expect(query).toContain("$filter=uniquename eq 'contoso_DoThing'");
    expect(query).toContain("allowedcustomprocessingsteptype");
  });

  it("builds child queries", () => {
    expect(listCustomApiRequestParametersQuery("api-1")).toContain(
      "$filter=_customapiid_value eq 'api-1'",
    );
    expect(listCustomApiResponsePropertiesQuery("api-1")).toContain(
      "$filter=_customapiid_value eq 'api-1'",
    );
    expect(listCustomApiRequestParametersForApisQuery(["api-1", "api-2"])).toContain(
      "_customapiid_value eq 'api-1' or _customapiid_value eq 'api-2'",
    );
    expect(listCustomApiResponsePropertiesForApisQuery(["api-1", "api-2"])).toContain(
      "_customapiid_value eq 'api-1' or _customapiid_value eq 'api-2'",
    );
  });
});
