import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("users.list returns only members of the active org with displayName", async () => {
  const t = convexTest(schema, modules);
  const { orgId, userId, as } = await setupOrg(t, { joinCode: "USRA1111", email: "anna@firma.se" });
  const other = await t.run(async (ctx) => {
    const b = await ctx.db.insert("users", { email: "bo@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: b, orgId });
    await ctx.db.insert("userProfiles", { userId: b, displayName: "Bo B" });
    const otherOrg = await ctx.db.insert("organizations", { namn: "Other", joinCode: "ELSE1111" });
    const c = await ctx.db.insert("users", { email: "carl@other.se", activeOrgId: otherOrg });
    await ctx.db.insert("memberships", { userId: c, orgId: otherOrg });
    return { b, c };
  });
  const list = await as.query(api.users.list, {});
  const emails = list.map((u) => u.email).sort();
  expect(emails).toEqual(["anna@firma.se", "bo@firma.se"]);
  expect(list.find((u) => u.email === "bo@firma.se")!.displayName).toBe("Bo B");
  expect(list.find((u) => u._id === userId)!.isSelf).toBe(true);
  void other;
});

test("users.viewer returns the email", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t, { joinCode: "USRV1111", email: "v@firma.se" });
  expect(await as.query(api.users.viewer, {})).toMatchObject({ email: "v@firma.se" });
});

test("removeMember detaches a member and nulls their ownership in the org", async () => {
  const t = convexTest(schema, modules);
  const { orgId, as } = await setupOrg(t, { joinCode: "USRR1111", email: "me@firma.se" });
  const victim = await t.run(async (ctx) => {
    const v = await ctx.db.insert("users", { email: "v@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: v, orgId });
    return v;
  });
  const projectId = await as.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const leadId = await as.mutation(api.leads.create, {
    titel: "L", beskrivning: "", sannolikhet: 10, agareId: victim, datum: "2026-06-17", steg: "Lead",
  });
  const taskId = await as.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agareId: victim, prioritet: "Normal",
  });

  await as.mutation(api.users.removeMember, { userId: victim });

  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === leadId)!;
  const task = (await as.query(api.tasks.list, {})).find((x) => x._id === taskId)!;
  expect(lead.agareId).toBeUndefined();
  expect(task.agareId).toBeUndefined();
  const stillMember = await t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", victim).eq("orgId", orgId))
      .first(),
  );
  expect(stillMember).toBeNull();
});

test("removeMember refuses removing yourself", async () => {
  const t = convexTest(schema, modules);
  const { userId, as } = await setupOrg(t, { joinCode: "USRS1111", email: "me@firma.se" });
  await expect(as.mutation(api.users.removeMember, { userId })).rejects.toThrow();
});
