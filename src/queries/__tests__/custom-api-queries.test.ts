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
  const apiId1 = "11111111-1111-1111-1111-111111111111";
  const apiId2 = "22222222-2222-2222-2222-222222222222";

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
    expect(listCustomApiRequestParametersQuery(apiId1)).toContain(
      `$filter=_customapiid_value eq ${apiId1}`,
    );
    expect(listCustomApiResponsePropertiesQuery(apiId1)).toContain(
      `$filter=_customapiid_value eq ${apiId1}`,
    );
    expect(listCustomApiRequestParametersForApisQuery([apiId1, apiId2])).toContain(
      `_customapiid_value eq ${apiId1} or _customapiid_value eq ${apiId2}`,
    );
    expect(listCustomApiResponsePropertiesForApisQuery([apiId1, apiId2])).toContain(
      `_customapiid_value eq ${apiId1} or _customapiid_value eq ${apiId2}`,
    );
  });
});
