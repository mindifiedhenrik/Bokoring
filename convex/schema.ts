import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// One log-entry shape covers leads (from/to) and tasks (also project moves, archive, restore).
export const logEntry = v.object({
  ts: v.string(),
  from: v.optional(v.union(v.string(), v.null())),
  to: v.optional(v.string()),
  fromProject: v.optional(v.string()),
  toProject: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  restored: v.optional(v.boolean()),
});

export default defineSchema({
  ...authTables,
  contacts: defineTable({
    namn: v.string(),
    foretag: v.string(),
    epost: v.string(),
    telefon: v.string(),
  }),
  leads: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    contactId: v.optional(v.id("contacts")),
    sannolikhet: v.number(),
    agareId: v.optional(v.id("users")),
    datum: v.string(),
    steg: v.string(),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_contact", ["contactId"])
    .index("by_agare", ["agareId"]),
  projects: defineTable({
    namn: v.string(),
    beskrivning: v.string(),
    color: v.string(),
    order: v.optional(v.number()),
  }),
  tasks: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    projectId: v.id("projects"),
    status: v.string(),
    agareId: v.optional(v.id("users")),
    prioritet: v.string(),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.string(), v.null())),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_agare", ["agareId"]),
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
  }).index("by_user", ["userId"]),
  settings: defineTable({
    archiveDays: v.number(),
    pileThreshold: v.number(),
  }),
});
