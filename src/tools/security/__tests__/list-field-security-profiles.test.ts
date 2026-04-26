import { describe, expect, it } from "vitest";
import { registerListFieldSecurityProfiles } from "../list-field-security-profiles.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_field_security_profiles", () => {
  it("lists profile grants and member counts for a secured column", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
          },
        ],
        fieldsecurityprofiles: [
          {
            fieldsecurityprofileid: "profile-1",
            name: "Finance",
            description: "Finance users",
            ismanaged: false,
            modifiedon: "2026-04-01T00:00:00Z",
            systemuserprofiles_association: [
              { systemuserid: "user-1", fullname: "Adele Vance", domainname: "adele" },
            ],
            teamprofiles_association: [{ teamid: "team-1", name: "Finance Team" }],
          },
          {
            fieldsecurityprofileid: "profile-2",
            name: "Sales",
            ismanaged: true,
            systemuserprofiles_association: [],
            teamprofiles_association: [],
          },
        ],
        fieldpermissions: [
          {
            fieldpermissionid: "permission-1",
            _fieldsecurityprofileid_value: "profile-1",
            entityname: "account",
            attributelogicalname: "creditlimit",
            canread: 4,
            cancreate: 0,
            canupdate: 4,
            ismanaged: false,
          },
          {
            fieldpermissionid: "permission-2",
            _fieldsecurityprofileid_value: "profile-2",
            entityname: "account",
            attributelogicalname: "name",
            canread: 4,
            cancreate: 4,
            canupdate: 4,
            ismanaged: true,
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "component-1",
            _solutionid_value: "solution-1",
            objectid: "profile-1",
            componenttype: 70,
          },
        ],
        solutions: [
          {
            solutionid: "solution-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
          },
        ],
      },
    });

    registerListFieldSecurityProfiles(server as never, config, client);
    const response = await server.getHandler("list_field_security_profiles")({
      environment: "dev",
      table: "account",
      column: "creditlimit",
      includeMembers: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Finance");
    expect(response.content[0]?.text).toContain("AllowedAlways");
    expect(response.content[0]?.text).toContain("Adele Vance");
    expect(response.content[0]?.text).not.toContain("Sales");
    expect(response.structuredContent?.data.count).toBeUndefined();
    expect(response.structuredContent?.data.totalCount).toBe(1);
    expect(response.structuredContent?.data.items).toEqual([
      expect.objectContaining({
        name: "Finance",
        memberCounts: { users: 1, teams: 1 },
        permissions: [
          expect.objectContaining({
            columnLogicalName: "creditlimit",
            canRead: "AllowedAlways",
            canCreate: "NotAllowed",
            canUpdate: "AllowedAlways",
          }),
        ],
        solutionMemberships: [
          {
            solutionid: "solution-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
          },
        ],
      }),
    ]);
  });

  it("keeps multiple grants and solution memberships for one profile", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        fieldsecurityprofiles: [
          {
            fieldsecurityprofileid: "profile-1",
            name: "Finance",
            systemuserprofiles_association: [],
            teamprofiles_association: [],
          },
        ],
        fieldpermissions: [
          {
            fieldpermissionid: "permission-1",
            _fieldsecurityprofileid_value: "profile-1",
            entityname: "account",
            attributelogicalname: "creditlimit",
            canread: 4,
            cancreate: 0,
            canupdate: 4,
          },
          {
            fieldpermissionid: "permission-2",
            _fieldsecurityprofileid_value: "profile-1",
            entityname: "account",
            attributelogicalname: "ssn",
            canread: 0,
            cancreate: 0,
            canupdate: 0,
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "component-1",
            _solutionid_value: "solution-1",
            objectid: "profile-1",
            componenttype: 70,
          },
          {
            solutioncomponentid: "component-2",
            _solutionid_value: "solution-2",
            objectid: "profile-1",
            componenttype: 70,
          },
        ],
        solutions: [
          {
            solutionid: "solution-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
          },
          {
            solutionid: "solution-2",
            friendlyname: "Contoso Security",
            uniquename: "Contoso_Security",
          },
        ],
      },
    });

    registerListFieldSecurityProfiles(server as never, config, client);
    const response = await server.getHandler("list_field_security_profiles")({
      environment: "dev",
      profileName: "Finance",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent?.data.items).toEqual([
      expect.objectContaining({
        permissions: [
          expect.objectContaining({ columnLogicalName: "creditlimit" }),
          expect.objectContaining({ columnLogicalName: "ssn" }),
        ],
        solutionMemberships: [
          expect.objectContaining({ uniquename: "Contoso_Core" }),
          expect.objectContaining({ uniquename: "Contoso_Security" }),
        ],
      }),
    ]);
  });
});
