import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { stageById, stageColorByName, errorMessage, NEUTRAL_STAGE_COLOR, type Stage } from "./stages";

const s = (id: string, namn: string, color: string, order: number) =>
  ({ _id: id, _creationTime: 0, orgId: "o", namn, color, order }) as unknown as Stage;
const stages = [s("a", "Lead", "#111111", 0), s("b", "Stängd", "#222222", 1)];

test("stageById finds by id and tolerates undefined", () => {
  expect(stageById(stages, "b" as Stage["_id"])?.namn).toBe("Stängd");
  expect(stageById(stages, undefined)).toBeUndefined();
});

test("stageColorByName falls back to neutral for unknown names", () => {
  expect(stageColorByName(stages, "Lead")).toBe("#111111");
  expect(stageColorByName(stages, "Borttaget")).toBe(NEUTRAL_STAGE_COLOR);
  expect(stageColorByName(stages, null)).toBe(NEUTRAL_STAGE_COLOR);
});

test("errorMessage surfaces ConvexError strings only", () => {
  expect(errorMessage(new ConvexError("Namnet får inte vara tomt"))).toBe("Namnet får inte vara tomt");
  expect(errorMessage(new Error("[CONVEX M(x)] boom"))).toBe("Något gick fel");
});
