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
  // Override the auth `users` table to add the active-org pointer. Keep the
  // original auth fields + indexes (email, phone).
  users: defineTable({
    ...authTables.users.validator.fields,
    activeOrgId: v.optional(v.id("organizations")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  organizations: defineTable({
    namn: v.string(),
    joinCode: v.string(),
  }).index("by_joinCode", ["joinCode"]),
  memberships: defineTable({
    userId: v.id("users"),
    orgId: v.id("organizations"),
  })
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"])
    .index("by_user_org", ["userId", "orgId"]),
  // Reminder: ansvarig (user), datum (ISO date), kort text — alla valfria.
  contacts: defineTable({
    orgId: v.id("organizations"),
    namn: v.string(),
    foretag: v.string(),
    epost: v.string(),
    telefon: v.string(),
    reminderAgareId: v.optional(v.id("users")),
    reminderDatum: v.optional(v.string()),
    reminderText: v.optional(v.string()),
  }).index("by_org", ["orgId"]),
  leads: defineTable({
    orgId: v.id("organizations"),
    titel: v.string(),
    beskrivning: v.string(),
    contactId: v.optional(v.id("contacts")),
    sannolikhet: v.number(),
    agareId: v.optional(v.id("users")),
    // Legacy free-text owner. Unused by the app (replaced by agareId); kept as an
    // optional field so existing production documents validate without a migration.
    agare: v.optional(v.string()),
    datum: v.string(),
    steg: v.string(),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_contact", ["contactId"])
    .index("by_agare", ["agareId"])
    .index("by_org", ["orgId"]),
  projects: defineTable({
    orgId: v.id("organizations"),
    namn: v.string(),
    beskrivning: v.string(),
    color: v.string(),
    order: v.optional(v.number()),
  }).index("by_org", ["orgId"]),
  tasks: defineTable({
    orgId: v.id("organizations"),
    titel: v.string(),
    beskrivning: v.string(),
    projectId: v.id("projects"),
    status: v.string(),
    agareId: v.optional(v.id("users")),
    // Legacy free-text owner; see note on leads.agare.
    agare: v.optional(v.string()),
    prioritet: v.string(),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.string(), v.null())),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_agare", ["agareId"])
    .index("by_org", ["orgId"]),
  milestones: defineTable({
    orgId: v.id("organizations"),
    titel: v.string(),
    beskrivning: v.string(),
    datum: v.string(),
    color: v.string(),
    taskIds: v.array(v.id("tasks")),
    // Persistent vertical row on the timeline (0 = nearest the axis). Optional so
    // pre-existing documents validate; the UI falls back to a staggered default.
    lane: v.optional(v.number()),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  }).index("by_org", ["orgId"]),
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
  }).index("by_user", ["userId"]),
  // Short notes attached to a contact. Creation time + author come from
  // `_creationTime` and `authorId`.
  notes: defineTable({
    orgId: v.id("organizations"),
    contactId: v.id("contacts"),
    text: v.string(),
    authorId: v.optional(v.id("users")),
  })
    .index("by_contact", ["contactId"])
    .index("by_org", ["orgId"]),
  // Per-user read marker for a contact's notes (for the unread dot).
  contactReads: defineTable({
    userId: v.id("users"),
    contactId: v.id("contacts"),
    lastReadAt: v.number(),
  }).index("by_user_contact", ["userId", "contactId"]),
  settings: defineTable({
    orgId: v.id("organizations"),
    archiveDays: v.number(),
    pileThreshold: v.number(),
  }).index("by_org", ["orgId"]),
  boards: defineTable({
    orgId: v.id("organizations"),
    namn: v.string(),
    order: v.number(),
  }).index("by_org", ["orgId"]),
  boardElements: defineTable({
    orgId: v.id("organizations"),
    boardId: v.id("boards"),
    kind: v.union(
      v.literal("note"),
      v.literal("text"),
      v.literal("line"),
      v.literal("rect"),
      v.literal("circle"),
    ),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    text: v.optional(v.string()),
    color: v.string(),
    order: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_org", ["orgId"]),
  boardPresence: defineTable({
    orgId: v.id("organizations"),
    boardId: v.id("boards"),
    userId: v.id("users"),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_user_board", ["userId", "boardId"]),
});
