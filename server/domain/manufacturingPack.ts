import { ROLE_TITLE_SYNONYMS } from "./roleTitleSynonyms";

export interface CatalogEntry {
  canonical: string;
  aliases: string[];
  subtype?: string;
  roleFamily?: string;
  seniorityHint?: string;
}

export interface ManufacturingPack {
  key: string;
  displayName: string;
  titlesCatalog: CatalogEntry[];
  toolsCatalog: CatalogEntry[];
  methodsCatalog: CatalogEntry[];
  domainConcepts: CatalogEntry[];
  leadershipSignals: CatalogEntry[];
  educationCatalog: CatalogEntry[];
  languageCatalog: CatalogEntry[];
  requirementsWeighting: {
    role: number;
    domain: number;
    hardSkills: number;
    tools: number;
    leadership: number;
    mustHave: number;
    evidenceStrength: number;
    uncertaintyPenalty: number;
  };
  interviewQuestionTemplates: string[];
  riskPatterns: string[];
  falsePositiveGuards: string[];
}

export const manufacturingPack: ManufacturingPack = {
  key: "manufacturing_pack",
  displayName: "Industrial & Manufacturing",
  titlesCatalog: [
    ...ROLE_TITLE_SYNONYMS,
    { canonical: "Factory Engineer", aliases: ["factory engineer", "plant engineer", "מהנדס מפעל", "מהנדס/ת מפעל"], roleFamily: "plant_engineering" },
    { canonical: "Manufacturing Engineer", aliases: ["manufacturing engineer", "production engineer", "מהנדס ייצור", "מהנדס/ת ייצור"], roleFamily: "manufacturing_engineering" },
    { canonical: "Process Engineer", aliases: ["process engineer", "מהנדס תהליך", "מהנדס/ת תהליך"], roleFamily: "process_engineering" },
    { canonical: "Maintenance Manager", aliases: ["maintenance manager", "maintenance lead", "מנהל אחזקה", "מנהל/ת אחזקה"], roleFamily: "maintenance_leadership" },
    { canonical: "Engineering Manager", aliases: ["engineering manager", "head of engineering", "מנהל הנדסה", "סמנכ\"ל הנדסה", "סמנכל הנדסה"], roleFamily: "engineering_leadership", seniorityHint: "leadership" },
    { canonical: "Industrial Engineer", aliases: ["industrial engineer", "מהנדס תעשייה וניהול", "מהנדס/ת תעשייה וניהול"], roleFamily: "industrial_engineering" },
    { canonical: "Mechanical Engineer", aliases: ["mechanical engineer", "מהנדס מכונות", "מהנדס/ת מכונות"], roleFamily: "mechanical_engineering" },
    { canonical: "Operations Engineer", aliases: ["operations engineer", "operations lead", "מהנדס תפעול", "מוביל תפעול"], roleFamily: "operations_engineering" }
  ],
  toolsCatalog: [
    { canonical: "AutoCAD", aliases: ["autocad"] },
    { canonical: "SolidWorks", aliases: ["solidworks"] },
    { canonical: "CATIA", aliases: ["catia"] },
    { canonical: "ERP", aliases: ["erp", "sap", "priority"] },
    { canonical: "MES", aliases: ["mes", "manufacturing execution system"] },
    { canonical: "PLC/SCADA", aliases: ["plc", "scada", "plc/scada"] },
    { canonical: "CMMS", aliases: ["cmms", "maintenance software"] },
    { canonical: "Excel", aliases: ["excel", "advanced excel"] }
  ],
  methodsCatalog: [
    { canonical: "Continuous Improvement", aliases: ["continuous improvement", "process improvement", "שיפור רציף"] },
    { canonical: "Lean Manufacturing", aliases: ["lean manufacturing", "lean", "ייצור רזה"] },
    { canonical: "Kaizen", aliases: ["kaizen"] },
    { canonical: "Root Cause Analysis", aliases: ["root cause analysis", "rca", "חקירת שורש"] },
    { canonical: "NPI", aliases: ["npi", "new product introduction"] },
    { canonical: "Industrialization", aliases: ["industrialization", "העברה מפיתוח לייצור", "transfer from development to production"] },
    { canonical: "Safety Management", aliases: ["safety management", "בטיחות"] },
    { canonical: "Quality Management", aliases: ["quality management", "quality", "איכות"] },
    { canonical: "Reliability Engineering", aliases: ["reliability", "reliability engineering", "אמינות"] }
  ],
  domainConcepts: [
    { canonical: "Manufacturing", aliases: ["manufacturing", "industrial", "production", "manufacturing environment", "תעשייתי", "תעשייתית", "ייצור", "מפעל"] },
    { canonical: "Process Engineering", aliases: ["process engineering", "processes", "תהליכים", "תהליכי ייצור"] },
    { canonical: "Mechanical Systems", aliases: ["mechanical systems", "mechanical", "מכונות", "מערכות מכניות"] },
    { canonical: "Electrical Systems", aliases: ["electrical systems", "electrical", "חשמל", "מערכות חשמל"] },
    { canonical: "Maintenance", aliases: ["maintenance", "maintenance planning", "אחזקה", "תחזוקה"] },
    { canonical: "Operations", aliases: ["operations", "operations leadership", "תפעול"] },
    { canonical: "Equipment", aliases: ["equipment", "plant equipment", "ציוד"] }
  ],
  leadershipSignals: [
    { canonical: "Team Leadership", aliases: ["team leadership", "lead teams", "ניהול עובדים", "ניהול צוות", "הובלת צוות"] },
    { canonical: "Department Leadership", aliases: ["head of engineering", "engineering department", "מחלקת ההנדסה", "הובלה של מחלקת ההנדסה"] },
    { canonical: "Cross-Functional Leadership", aliases: ["cross-functional", "stakeholders", "multi-disciplinary", "מול ממשקים", "מולטידיסציפלינרי"] },
    { canonical: "Operational Ownership", aliases: ["ownership", "end-to-end", "full responsibility", "אחריות מלאה", "ownership של תהליכים"] }
  ],
  educationCatalog: [
    { canonical: "Mechanical Engineering", aliases: ["mechanical engineering", "הנדסת מכונות"], subtype: "degree" },
    { canonical: "Industrial Engineering", aliases: ["industrial engineering", "industry and management", "תעשייה וניהול", "הנדסת תעשייה וניהול"], subtype: "degree" },
    { canonical: "Electrical Engineering", aliases: ["electrical engineering", "הנדסת חשמל"], subtype: "degree" },
    { canonical: "Chemical Engineering", aliases: ["chemical engineering", "הנדסה כימית"], subtype: "degree" }
  ],
  languageCatalog: [
    { canonical: "English", aliases: ["english", "אנגלית"] },
    { canonical: "Hebrew", aliases: ["hebrew", "עברית"] }
  ],
  requirementsWeighting: {
    role: 0.16,
    domain: 0.18,
    hardSkills: 0.16,
    tools: 0.14,
    leadership: 0.14,
    mustHave: 0.14,
    evidenceStrength: 0.08,
    uncertaintyPenalty: 0.12
  },
  interviewQuestionTemplates: [
    "Describe a manufacturing process you improved and how you proved the impact.",
    "What engineering tools or systems did you use directly, and in what context?",
    "Tell me about a time you led operators, technicians, or engineers through a plant change.",
    "Which must-have requirements in this role can you prove with recent examples?"
  ],
  riskPatterns: [
    "generic leadership without manufacturing context",
    "strong project language with weak plant evidence",
    "title inflation without direct scope proof",
    "must-have degree or tool missing"
  ],
  falsePositiveGuards: [
    "ignore generic adverbs and hiring language",
    "do not count vague process words as skills",
    "do not treat leadership as manufacturing leadership without plant context",
    "do not treat company marketing text as requirement evidence"
  ]
};
