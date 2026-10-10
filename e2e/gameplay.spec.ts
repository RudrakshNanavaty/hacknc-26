import { test, expect, type Page } from "@playwright/test";

async function checkVisibleBounds(page: Page, names: string[]) {
  for (const name of names) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const r = await button.boundingBox();
    const v = page.viewportSize()!;
    expect(r, name).not.toBeNull();
    expect(r!.x, name).toBeGreaterThanOrEqual(0);
    expect(r!.y, name).toBeGreaterThanOrEqual(0);
    expect(r!.x+r!.width, name).toBeLessThanOrEqual(v.width+1);
    expect(r!.y+r!.height, name).toBeLessThanOrEqual(v.height+1);
  }
}

test("first-time build, actual worker, matched outcome, replay, library, undo, budget and responsive controls", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Baby corals need a place", {exact:false})).toBeVisible();
  await expect(page.getByRole("heading", {name:"First Settlement", exact:true})).toBeVisible();
  await checkVisibleBounds(page,["Run experiment","Presets","Reset","Place"]);
  await page.screenshot({path:"docs/screenshots/build-1366.png"});
  // A first experiment can be built directly on the authoritative canvas.
  const canvas = page.getByRole("img",{name:/Cross-section/});
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x+box.width/4,box.y+box.height*0.8);
  await expect(page.getByTestId("material")).toHaveText("39.0 / 54 mm");
  await page.getByRole("button",{name:"Undo",exact:true}).click();
  await expect(page.getByTestId("material")).toHaveText("34.0 / 54 mm");
  await page.getByRole("button",{name:"Redo",exact:true}).click();
  await expect(page.getByTestId("material")).toHaveText("39.0 / 54 mm");
  await page.getByRole("button",{name:"Run experiment",exact:true}).click();
  await expect(page.getByRole("button",{name:"Cancel experiment"})).toBeVisible();
  await page.getByRole("switch",{name:"Flow vectors"}).click();
  await page.getByRole("combobox",{name:"Animation speed"}).selectOption("0.5");
  await expect(page.getByRole("combobox",{name:"Animation speed"})).toHaveValue("0.5");
  await page.getByRole("combobox",{name:"Animation speed"}).selectOption("2");
  await page.screenshot({path:"docs/screenshots/simulate-1366.png"});
  await expect(page.getByText("Mission complete",{exact:true})).toBeVisible({timeout:120000});
  const score = await page.getByTestId("settlement-score").innerText();
  console.log("Real worker Mission 1 settlement:",score);
  await checkVisibleBounds(page,["Improve design","Save experiment","Repeat mission run"]);
  await page.screenshot({path:"docs/screenshots/results-1366.png"});
  await page.getByRole("button",{name:"Save experiment",exact:true}).click();
  await expect(page.getByText("Experiment saved",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Library",exact:true}).click();
  await page.getByRole("button",{name:"Load",exact:true}).click();
  await expect(page.getByTestId("settlement-score")).toHaveText(score);
  await page.getByRole("button",{name:"Research",exact:true}).click();
  await page.getByRole("button",{name:"Re-run from this record",exact:true}).first().click();
  await expect(page.getByTestId("settlement-score")).toHaveText(score,{timeout:120000});
  await page.getByRole("button",{name:"Improve design",exact:true}).click();
  await page.getByRole("button",{name:"Presets",exact:true}).click();
  await page.getByRole("button",{name:"Ridge (calibration)",exact:true}).click();
  await expect(page.getByTestId("material")).toHaveText("54.0 / 54 mm");
  await page.getByRole("spinbutton",{name:"Placement position in mm"}).fill("8.5");
  await page.getByRole("button",{name:"Place",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Needs"})).toBeVisible();
  await expect(page.getByTestId("material")).toHaveText("54.0 / 54 mm");
  await page.getByRole("button",{name:"Reset",exact:true}).click();
  await expect(page.getByText(/Needs 59\.0/)).toHaveCount(0);
  for (const [width,height] of [[1440,900],[1920,1080],[1366,768]]) {
    await page.setViewportSize({width:width!,height:height!});
    await checkVisibleBounds(page,["Run experiment","Presets","Reset","Place"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`docs/screenshots/build-${width}.png`});
  }
  expect(errors).toEqual([]);
});

test("Current Clash computes both currents and restores paired saved records", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Missions",exact:true}).click();
  await page.getByRole("button",{name:"Choose Current Clash",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Current Clash",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Place",exact:true}).click();
  await page.getByRole("button",{name:"Run experiment",exact:true}).click();
  await expect(page.getByText("Mission complete",{exact:true})).toBeVisible({timeout:150000});
  await checkVisibleBounds(page,["Improve design","Save experiment","Repeat mission run"]);
  const reference = await page.getByTestId("settlement-score").innerText();
  await page.getByRole("button",{name:/3 cm\/s/}).click();
  const gentle = await page.getByTestId("settlement-score").innerText();
  expect(gentle).not.toEqual(reference);
  const suggestion = await page.getByText("Shorten one feature. Can both currents still gain at least 1 point?",{exact:true}).boundingBox();
  expect(suggestion!.y + suggestion!.height).toBeLessThan(704);
  await page.screenshot({path:"docs/screenshots/current-clash.png"});
  await page.getByRole("button",{name:"Save experiment",exact:true}).click();
  await expect(page.getByText("Experiment saved",{exact:false})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Library",exact:true}).click();
  await page.getByRole("button",{name:"Load",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Current Clash",exact:true})).toBeVisible();
  await expect(page.getByTestId("settlement-score")).toHaveText(gentle);
  await expect(page.getByText("Mission complete",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Research",exact:true}).click();
  await expect(page.getByRole("listitem").filter({hasText:/Oscillatory wave-driven flow, 3 cm\/s/})).toBeVisible();
  await page.getByRole("button",{name:/Benchmark: FAIL/}).click();
  await expect(page.getByRole("dialog",{name:"Pre-registered benchmark"})).toBeVisible();
});

test("mobile presets run and results, cancellation keeps controls usable",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button",{name:"Presets",exact:true}).click();
  await page.getByRole("button",{name:"Ridge (calibration)",exact:true}).click();
  await page.getByRole("button",{name:"Run experiment",exact:true}).click();
  await page.getByRole("button",{name:"Cancel experiment",exact:true}).click();
  await expect(page.getByRole("button",{name:"Run experiment",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Run experiment",exact:true}).click();
  await expect(page.getByText("Mission complete",{exact:true})).toBeVisible({timeout:120000});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:"docs/screenshots/results-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Improve design",exact:true}).click();
  await page.screenshot({path:"docs/screenshots/build-mobile.png",fullPage:true});
});
