import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { buildRetrieveEntityRibbonPath } from "../../../queries/ribbon-queries.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchTableRibbonMetadata, resolveRibbonButton } from "../ribbon-metadata.js";

const env: EnvironmentConfig = {
  name: "dev",
  url: "https://dev.crm.dynamics.com",
  tenantId: "tenant",
  clientId: "client",
  clientSecret: "secret",
};

const ribbonXml = `
<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="sample.account.Homepage.Action" Location="Mscrm.HomepageGrid.account.MainTab.Actions.Controls._children" Sequence="10">
      <CommandUIDefinition>
        <Button
          Id="sample.account.Homepage.Open"
          Command="sample.account.Command.Open"
          LabelText="$LocLabels:sample.account.Open.Label"
          ToolTipTitle="$LocLabels:sample.account.Open.Label"
          ToolTipDescription="$LocLabels:sample.account.Open.Description"
          Sequence="10"
          Image16by16="/_imgs/open16.png"
          Image32by32="/_imgs/open32.png"
        />
      </CommandUIDefinition>
    </CustomAction>
    <CustomAction Id="sample.account.Form.Action" Location="Mscrm.Form.account.MainTab.Actions.Controls._children" Sequence="20">
      <CommandUIDefinition>
        <Button
          Id="sample.account.Form.Run"
          Command="sample.account.Command.Run"
          LabelText="Run Validation"
          ToolTipDescription="Runs account validation"
          Sequence="20"
          ModernImage="CheckMark"
        />
      </CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <CommandDefinitions>
    <CommandDefinition Id="sample.account.Command.Open">
      <EnableRules>
        <EnableRule Id="sample.account.Enable.CanOpen" />
      </EnableRules>
      <DisplayRules>
        <DisplayRule Id="sample.account.Display.ShowOpen" />
      </DisplayRules>
      <Actions>
        <JavaScriptFunction Library="$webresource:new_/account.js" FunctionName="openAccount" />
      </Actions>
    </CommandDefinition>
    <CommandDefinition Id="sample.account.Command.Run">
      <EnableRules>
        <EnableRule Id="sample.account.Enable.CanRun" />
      </EnableRules>
      <Actions>
        <JavaScriptFunction Library="$webresource:new_/account.js" FunctionName="runValidation" />
      </Actions>
    </CommandDefinition>
  </CommandDefinitions>
  <RuleDefinitions>
    <DisplayRules>
      <DisplayRule Id="sample.account.Display.ShowOpen">
        <CommandClientTypeRule Type="Refresh" />
      </DisplayRule>
    </DisplayRules>
    <EnableRules>
      <EnableRule Id="sample.account.Enable.CanOpen">
        <SelectionCountRule Minimum="1" Maximum="1" />
      </EnableRule>
      <EnableRule Id="sample.account.Enable.CanRun">
        <CrmClientTypeRule Type="Web" />
      </EnableRule>
    </EnableRules>
  </RuleDefinitions>
  <LocLabels>
    <LocLabel Id="sample.account.Open.Label">
      <Titles>
        <Title languagecode="1033" description="Open Account" />
      </Titles>
    </LocLabel>
    <LocLabel Id="sample.account.Open.Description">
      <Titles>
        <Title languagecode="1033" description="Open the selected account." />
      </Titles>
    </LocLabel>
  </LocLabels>
</RibbonDiffXml>
`.trim();

describe("ribbon metadata", () => {
  it("loads table ribbons and resolves ribbon button details", async () => {
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            ObjectTypeCode: 1,
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
          },
        ],
        [buildRetrieveEntityRibbonPath("account", "all")]: {
          CompressedEntityXml: createStoredZip("RibbonXml.xml", ribbonXml).toString("base64"),
        },
      },
    });

    const metadata = await fetchTableRibbonMetadata(env, client, "account");
    const button = resolveRibbonButton(metadata, "Open Account");

    expect(metadata.table.logicalName).toBe("account");
    expect(metadata.ribbons).toHaveLength(2);
    expect(metadata.buttons).toHaveLength(2);
    expect(metadata.ribbons.map((ribbon) => ribbon.id)).toEqual([
      "Mscrm.Form.account.MainTab",
      "Mscrm.HomepageGrid.account.MainTab",
    ]);
    expect(
      metadata.buttons.find((item) => item.id === "sample.account.Homepage.Open"),
    ).toMatchObject({
      label: "Open Account",
      ribbonType: "homepageGrid",
      command: "sample.account.Command.Open",
    });
    expect(button.commandDefinition).toMatchObject({
      id: "sample.account.Command.Open",
      displayRuleIds: ["sample.account.Display.ShowOpen"],
      enableRuleIds: ["sample.account.Enable.CanOpen"],
    });
    expect(button.displayRules).toHaveLength(1);
    expect(button.enableRules).toHaveLength(1);
    expect(button.commandDefinition?.actions).toEqual([
      {
        type: "JavaScriptFunction",
        attributes: {
          Library: "$webresource:new_/account.js",
          library: "$webresource:new_/account.js",
          FunctionName: "openAccount",
          functionname: "openAccount",
        },
      },
    ]);
  });

  it("filters ribbon buttons by location", async () => {
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            ObjectTypeCode: 1,
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
          },
        ],
        [buildRetrieveEntityRibbonPath("account", "homepageGrid")]: {
          CompressedEntityXml: createStoredZip("RibbonXml.xml", ribbonXml).toString("base64"),
        },
      },
    });

    const metadata = await fetchTableRibbonMetadata(env, client, "account", {
      location: "homepageGrid",
    });

    expect(metadata.ribbons).toHaveLength(1);
    expect(metadata.buttons).toHaveLength(1);
    expect(metadata.buttons[0]?.ribbonType).toBe("homepageGrid");
  });
});

function createStoredZip(fileName: string, contents: string): Buffer {
  const fileNameBuffer = Buffer.from(fileName, "utf8");
  const contentsBuffer = Buffer.from(contents, "utf8");
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(contentsBuffer.length, 18);
  header.writeUInt32LE(contentsBuffer.length, 22);
  header.writeUInt16LE(fileNameBuffer.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, fileNameBuffer, contentsBuffer]);
}
