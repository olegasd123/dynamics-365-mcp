import { describe, expect, it } from "vitest";
import { listPublishersQuery } from "../publisher-queries.js";

describe("publisher queries", () => {
  it("builds the publishers query", () => {
    const query = listPublishersQuery("Contoso", "cts");

    expect(query).toContain(
      "$select=publisherid,friendlyname,uniquename,customizationprefix,customizationoptionvalueprefix,description,emailaddress,supportingwebsiteurl,isreadonly,modifiedon,versionnumber",
    );
    expect(query).toContain(
      "$filter=(contains(friendlyname,'Contoso') or contains(uniquename,'Contoso')) and contains(customizationprefix,'cts')",
    );
    expect(query).toContain("$orderby=friendlyname asc");
  });
});
