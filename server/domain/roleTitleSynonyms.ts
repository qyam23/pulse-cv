export interface RoleTitleCatalogEntry {
  canonical: string;
  aliases: string[];
  subtype?: string;
  roleFamily?: string;
  seniorityHint?: string;
}

export const ROLE_TITLE_SYNONYMS: RoleTitleCatalogEntry[] = [
  {
    canonical: "Technical Manager",
    aliases: [
      "technical manager",
      "manufacturing technical manager",
      "engineering manager",
      "technical project manager",
      "engineering project manager",
      "project manager",
      "multidisciplinary project manager",
      "head of engineering",
      "technical lead",
      "responsable technique",
      "technischer leiter",
      "gerente técnico",
      "מנהל טכני",
      "מנהלת טכנית",
      "מנהל הנדסי בכיר",
      "מנהל טכנולוגיות ראשי",
      "מנהל פרויקטים",
      "מנהל פרויקטים טכני",
      "מנהל פרויקטים הנדסי",
      "מנהל פרויקטים מולטי דיסציפלינריים",
    ],
    roleFamily: "engineering_leadership",
    seniorityHint: "leadership",
  },
  {
    canonical: "Factory Engineering Lead",
    aliases: [
      "factory engineering lead",
      "plant engineering lead",
      "head of plant engineering",
      "מוביל הנדסת מפעל",
      "ראש הנדסת מפעל",
      "מנהל הנדסת מפעל",
    ],
    roleFamily: "plant_engineering",
    seniorityHint: "leadership",
  },
];
