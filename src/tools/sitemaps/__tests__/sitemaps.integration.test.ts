import { describe, expect, it } from "vitest";
import { registerGetSitemapDetails } from "../get-sitemap-details.js";
import { registerListSitemaps } from "../list-sitemaps.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const SALES_SITEMAP_XML = `
<SiteMap>
  <Area Id="Sales" Icon="/_imgs/sales_24x24.gif">
    <Titles>
      <Title LCID="1033" Title="Sales" />
    </Titles>
    <Group Id="Customers">
      <Titles>
        <Title LCID="1033" Title="Customers" />
      </Titles>
      <SubArea Id="nav_accounts" Entity="account" AvailableOffline="true">
        <Titles>
          <Title LCID="1033" Title="Accounts" />
        </Titles>
        <Privilege Entity="account" Privilege="Read" />
      </SubArea>
      <SubArea Id="nav_contacts" Entity="contact">
        <Titles>
          <Title LCID="1033" Title="Contacts" />
        </Titles>
      </SubArea>
    </Group>
    <Group Id="Tools">
      <SubArea Id="nav_report" Url="/main.aspx?pagetype=dashboard" Title="Reports" />
    </Group>
  </Area>
</SiteMap>`;

describe("sitemap tools", () => {
  it("lists sitemaps with navigation counts", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        sitemaps: [createSalesSitemap()],
      },
    });

    registerListSitemaps(server as never, config, client);

    const response = await server.getHandler("list_sitemaps")({
      nameFilter: "Sales",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Sales App Sitemap");
    expect(response.content[0].text).toContain("3");
    expect(response.structuredContent).toMatchObject({
      data: {
        count: 1,
        items: [
          {
            sitemapname: "Sales App Sitemap",
            summary: {
              areaCount: 1,
              groupCount: 2,
              subAreaCount: 3,
              tableNames: ["account", "contact"],
            },
          },
        ],
      },
    });
  });

  it("loads sitemap details through an app module", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        appmodules: [
          {
            appmoduleid: "app-1",
            appmoduleidunique: "app-unique-1",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
        appmodulecomponents: [
          {
            appmodulecomponentid: "component-1",
            _appmoduleidunique_value: "app-unique-1",
            componenttype: 62,
            objectid: "sitemap-1",
          },
        ],
        sitemaps: [createSalesSitemap()],
      },
    });

    registerGetSitemapDetails(server as never, config, client);

    const response = await server.getHandler("get_sitemap_details")({
      appName: "Sales Hub",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("App Module: Sales Hub");
    expect(response.content[0].text).toContain("Accounts");
    expect(response.content[0].text).toContain("contact");
    const data = response.structuredContent?.data as {
      sitemap: {
        appModule?: { name: string };
        sitemapname: string;
        summary: {
          areas: Array<{
            title: string;
            groups: Array<{
              title: string;
              subAreas: Array<{
                title: string;
                entity: string;
                privileges: Array<{ entity: string; privilege: string }>;
              }>;
            }>;
          }>;
        };
      };
    };
    expect(data.sitemap.sitemapname).toBe("Sales App Sitemap");
    expect(data.sitemap.appModule?.name).toBe("Sales Hub");
    expect(data.sitemap.summary.areas[0]?.title).toBe("Sales");
    expect(data.sitemap.summary.areas[0]?.groups[0]?.title).toBe("Customers");
    expect(data.sitemap.summary.areas[0]?.groups[0]?.subAreas[0]).toMatchObject({
      title: "Accounts",
      entity: "account",
      privileges: [{ entity: "account", privilege: "Read" }],
    });
    expect(calls.map((call) => call.entitySet)).toContain("appmodulecomponents");
  });

  it("returns structured retry options when the sitemap is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        sitemaps: [
          createSalesSitemap(),
          {
            ...createSalesSitemap(),
            sitemapid: "sitemap-2",
            sitemapnameunique: "contoso_SalesSitemap2",
          },
        ],
      },
    });

    registerGetSitemapDetails(server as never, config, client);

    const response = await server.getHandler("get_sitemap_details")({
      sitemapName: "Sales App Sitemap",
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      tool: "get_sitemap_details",
      ok: false,
      error: {
        code: "ambiguous_match",
        parameter: "sitemapName",
        options: [{ value: "contoso_SalesSitemap" }, { value: "contoso_SalesSitemap2" }],
      },
    });
  });
});

function createSalesSitemap() {
  return {
    sitemapid: "sitemap-1",
    sitemapidunique: "sitemap-unique-1",
    sitemapname: "Sales App Sitemap",
    sitemapnameunique: "contoso_SalesSitemap",
    sitemapxml: SALES_SITEMAP_XML,
    isappaware: true,
    ismanaged: false,
    modifiedon: "2025-03-04T00:00:00Z",
    componentstate: 0,
    showhome: true,
    showpinned: true,
    showrecents: true,
    enablecollapsiblegroups: true,
  };
}
