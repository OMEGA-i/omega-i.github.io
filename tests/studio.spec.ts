import {test,expect} from "@playwright/test";
test("the public studio opens the shared patrol and preserves its route across bodies",async({page})=>{
  await page.goto("/en/studio/?mode=live#scene");
  const editor=page.locator("[data-editor]");
  await editor.getByRole("button",{name:"Inventory"}).click();
  await page.locator("[data-model-choice]").getByRole("radio",{name:"A3"}).check();
  await expect(editor.locator("[data-order]")).toContainText("Inventory");
});
