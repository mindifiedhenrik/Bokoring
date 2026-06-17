import { internalMutation } from "./_generated/server";
import { PROJECT_COLORS } from "./helpers";

const tAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

// Run once on an empty deployment:  npx convex run seed:run
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("leads").first();
    if (existing) return "already seeded";

    const c = [];
    for (const data of [
      { namn: "Anna Lindqvist", foretag: "Nordkvist Bygg AB", epost: "anna@nordkvist.se", telefon: "070-123 45 67" },
      { namn: "Johan Berg", foretag: "Bergström Logistik", epost: "johan.berg@blog.se", telefon: "073-987 65 43" },
      { namn: "Sofia Holm", foretag: "Holm Design Studio", epost: "sofia@holmstudio.se", telefon: "076-555 22 11" },
      { namn: "Erik Sandell", foretag: "TechVind AB", epost: "erik@techvind.se", telefon: "070-444 88 99" },
    ]) c.push(await ctx.db.insert("contacts", data));

    const leadSeed = [
      { titel: "Webbplattform & integration", beskrivning: "Behöver ny kundportal med ERP-koppling. Budget bekräftad.", contactId: c[0], sannolikhet: 30, agare: "Maria Ek", datum: tAgo(2).slice(0, 10), steg: "Lead" },
      { titel: "Lageroptimering Q3", beskrivning: "Utvärderar system för lagerstyrning inför expansion.", contactId: c[1], sannolikhet: 55, agare: "David Ström", datum: tAgo(5).slice(0, 10), steg: "Kvalificerat" },
      { titel: "Varumärkesidentitet", beskrivning: "Rebranding inklusive ny visuell profil och webb.", contactId: c[2], sannolikhet: 70, agare: "Maria Ek", datum: tAgo(9).slice(0, 10), steg: "Förslag" },
      { titel: "Vindkraft – serviceavtal", beskrivning: "Femårigt serviceavtal för turbinpark. Offert skickad.", contactId: c[3], sannolikhet: 85, agare: "David Ström", datum: tAgo(14).slice(0, 10), steg: "Offererat" },
    ];
    for (const l of leadSeed) {
      await ctx.db.insert("leads", { ...l, log: [{ ts: new Date().toISOString(), from: null, to: l.steg }] });
    }

    const p = [];
    for (const [i, data] of [
      { namn: "Kundportal 2.0", beskrivning: "Ny självbetjäningsportal med ERP-koppling." },
      { namn: "Rebranding", beskrivning: "Visuell identitet och ny webbplats." },
    ].entries()) {
      p.push(await ctx.db.insert("projects", { ...data, color: PROJECT_COLORS[i % PROJECT_COLORS.length] }));
    }

    const taskSeed = [
      { titel: "Kravinsamling & workshops", projectId: p[0], status: "Done", agare: "Maria Ek", prioritet: "Hög", daysAgo: 2 },
      { titel: "Wireframes för portalen", projectId: p[0], status: "In Review", agare: "Sofia Holm", prioritet: "Normal", daysAgo: 1 },
      { titel: "API-integration mot ERP", projectId: p[0], status: "In Progress", agare: "David Ström", prioritet: "Hög", daysAgo: 0 },
      { titel: "Inloggningsflöde (SSO)", projectId: p[0], status: "Todo", agare: "David Ström", prioritet: "Normal", daysAgo: 3 },
      { titel: "Felhantering & loggning", projectId: p[0], status: "Todo", agare: "David Ström", prioritet: "Normal", daysAgo: 2 },
      { titel: "E-postnotiser", projectId: p[0], status: "Todo", agare: "Maria Ek", prioritet: "Låg", daysAgo: 1 },
      { titel: "Användardokumentation", projectId: p[0], status: "Todo", agare: "", prioritet: "Låg", daysAgo: 0 },
      { titel: "Prestandatester", projectId: p[0], status: "Backlog", agare: "", prioritet: "Låg", daysAgo: 5 },
      { titel: "Moodboard & research", projectId: p[1], status: "Done", agare: "Sofia Holm", prioritet: "Normal", daysAgo: 2 },
      { titel: "Logotypförslag", projectId: p[1], status: "In Progress", agare: "Sofia Holm", prioritet: "Hög", daysAgo: 1 },
      { titel: "Färgpalett & typografi", projectId: p[1], status: "Todo", agare: "Maria Ek", prioritet: "Normal", daysAgo: 4 },
    ];
    for (const { daysAgo, ...rest } of taskSeed) {
      await ctx.db.insert("tasks", {
        ...rest, beskrivning: "", archived: false,
        log: [{ ts: tAgo(daysAgo), from: null, to: rest.status }],
      });
    }
    return "seeded";
  },
});
