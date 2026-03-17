import { test, expect } from "@playwright/test";

const mockListing = {
  id: 101,
  address: "서울시 성동구 테스트로 101",
  latitude: 37.5665,
  longitude: 126.978,
  deposit: 100000000,
  monthlyRent: 500000,
  roomType: "ONE_ROOM",
  loanProducts: ["HF_YOUTH"],
  viewCount: 12,
  recentlyRegistered: true,
  hotProperty: true
};

const mockDetail = {
  ...mockListing,
  description: "테스트용 상세 데이터",
  imagePaths: [],
  currentViewerCount: 0
};

function installMockNaverMaps() {
  window.naver = {
    maps: {
      Map: class {
        constructor(element, options) {
          this.element = element;
          this.options = options;
        }
        panTo() {}
      },
      Marker: class {
        constructor({ map, icon }) {
          this.map = map;
          this.icon = icon;
          this.element = document.createElement("button");
          this.element.type = "button";
          this.element.className = "mock-naver-marker";
          this.element.innerHTML = icon?.content ?? "";
          this.element.style.position = "absolute";
          this.element.style.left = "120px";
          this.element.style.top = "160px";
          this.element.style.background = "transparent";
          this.element.style.border = "none";
          this.element.style.padding = "0";
          this.element.style.cursor = "pointer";
          map.element.appendChild(this.element);
        }
        setMap(nextMap) {
          if (!nextMap && this.element?.parentNode) {
            this.element.parentNode.removeChild(this.element);
          }
        }
        setIcon({ content }) {
          this.icon = { content };
          this.element.innerHTML = content ?? "";
        }
      },
      InfoWindow: class {
        constructor() {
          this.element = null;
        }
        setContent(content) {
          this.content = content;
        }
        open(map) {
          this.close();
          this.element = this.content;
          this.element.style.position = "absolute";
          this.element.style.left = "160px";
          this.element.style.top = "210px";
          this.element.style.zIndex = "30";
          map.element.appendChild(this.element);
        }
        close() {
          if (this.element?.parentNode) {
            this.element.parentNode.removeChild(this.element);
          }
          this.element = null;
        }
      },
      LatLng: class {
        constructor(latitude, longitude) {
          this.latitude = latitude;
          this.longitude = longitude;
        }
      },
      Point: class {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
      Event: {
        addListener(target, eventName, callback) {
          if (eventName === "click" && target.element) {
            target.element.addEventListener("click", callback);
          }
        }
      }
    }
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockNaverMaps);

  await page.route("**/api/v1/listings/unsold", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([mockListing])
    });
  });

  await page.route("**/api/v1/listings/101/viewer-presence", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ listingId: 101, viewerCount: 1 })
      });
      return;
    }

    if (route.request().method() === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ listingId: 101, viewerCount: 0 })
      });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/v1/listings/101/viewer-count**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ listingId: 101, viewerCount: 3 })
    });
  });

  await page.route("**/api/v1/listings/101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDetail)
    });
  });
});

test.describe("listingViewerSessionId", () => {
  test("opens listing detail and shows polling viewer badge", async ({ page }) => {
    await page.goto("/");

    await page.locator(".mock-naver-marker").click();
    await expect(page.getByRole("button", { name: /서울시 성동구 테스트로 101/ })).toBeVisible();
    await page.getByRole("button", { name: /서울시 성동구 테스트로 101/ }).click();

    await expect(page.getByText("지금 3명 보는 중")).toBeVisible();
  });
});
