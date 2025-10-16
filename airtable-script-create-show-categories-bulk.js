/***** Create ShowCategories from ShowTemplates for ALL eligible Shows
 * Finds all Shows with a linked ShowTemplate but no ShowCategories yet,
 * then creates ShowCategories for each of them.
 ******************************************************************************/

// === Tables
const TABLES = {
  SHOWS: "Shows",
  SHOW_CATEGORIES: "ShowCategories",
  SHOW_TEMPLATES: "ShowTemplates",
};

// === Field names
const SHOWS_FIELDS = {
  TEMPLATE: "ShowTemplate", // linked record to ShowTemplates
};

const SC_FIELDS = {
  SHOW: "Show",                   // link to Shows
  ROUND: "Round",                 // number
  CATEGORY_ORDER: "Category order", // number
  EXPECTED_COUNT: "Expected count", // number
  QUESTION_TYPE: "Question type", // single select: Visual | Spoken | Audio
};

const ST_FIELDS = {
  NUM_ROUNDS: "# of rounds",

  V1: "# of visual categories in round 1",
  S1: "# of spoken categories in round 1",
  A1: "# of audio categories in round 1",

  V2: "# of visual categories in round 2",
  S2: "# of spoken categories in round 2",
  A2: "# of audio categories in round 2",

  Q_PER_VISUAL: "# of questions per visual category",
  Q_PER_SPOKEN: "# of questions per spoken category",
  Q_PER_AUDIO:  "# of questions per audio category",
};

function nz(n) { return (typeof n === "number" && !isNaN(n)) ? n : 0; }

function buildRoundRecords(showId, roundNumber, counts, perTypeQuestionCounts) {
  const result = [];
  let order = 1;

  // Visual first, then Spoken, then Audio
  const sequence = [
    { type: "Visual", count: nz(counts.visual), per: nz(perTypeQuestionCounts.visual) },
    { type: "Spoken", count: nz(counts.spoken), per: nz(perTypeQuestionCounts.spoken) },
    { type: "Audio",  count: nz(counts.audio),  per: nz(perTypeQuestionCounts.audio)  },
  ];

  for (const { type, count, per } of sequence) {
    for (let i = 0; i < count; i++) {
      result.push({
        fields: {
          [SC_FIELDS.SHOW]: [{ id: showId }],
          [SC_FIELDS.ROUND]: roundNumber,
          [SC_FIELDS.QUESTION_TYPE]: { name: type },
          [SC_FIELDS.CATEGORY_ORDER]: order++,
          [SC_FIELDS.EXPECTED_COUNT]: per,
        },
      });
    }
  }
  return result;
}

// === Main
const showsTable     = base.getTable(TABLES.SHOWS);
const showCategories = base.getTable(TABLES.SHOW_CATEGORIES);
const showTemplates  = base.getTable(TABLES.SHOW_TEMPLATES);

// Load all Shows with their templates
output.markdown("🔍 Searching for Shows that need ShowCategories...");

const allShows = await showsTable.selectRecordsAsync({
  fields: [SHOWS_FIELDS.TEMPLATE]
});

// Load all existing ShowCategories to see which Shows already have them
const allShowCategories = await showCategories.selectRecordsAsync({
  fields: [SC_FIELDS.SHOW]
});

// Build a Set of Show IDs that already have ShowCategories
const showsWithCategories = new Set();
for (const sc of allShowCategories.records) {
  const showLink = sc.getCellValue(SC_FIELDS.SHOW);
  if (showLink && showLink.length > 0) {
    showsWithCategories.add(showLink[0].id);
  }
}

// Find Shows that have a template but no ShowCategories yet
const eligibleShows = [];
for (const show of allShows.records) {
  const templateLink = show.getCellValue(SHOWS_FIELDS.TEMPLATE);

  // Must have a template
  if (!templateLink || templateLink.length === 0) continue;

  // Must NOT already have ShowCategories
  if (showsWithCategories.has(show.id)) continue;

  eligibleShows.push({
    id: show.id,
    name: show.name || "(Unnamed Show)",
    templateId: templateLink[0].id,
  });
}

if (eligibleShows.length === 0) {
  output.markdown("✅ All Shows with templates already have ShowCategories created.");
  return;
}

// Show what we found and ask for confirmation
const showNames = eligibleShows.map(s => `- ${s.name}`).join("\n");
output.markdown(
  `📋 Found **${eligibleShows.length}** Show(s) ready for ShowCategories:\n\n${showNames}`
);

const choice = await input.buttonsAsync(
  `Create ShowCategories for all ${eligibleShows.length} Show(s)?`,
  ["Yes", "No"]
);

if (choice !== "Yes") {
  output.markdown("↪️ Cancelled.");
  return;
}

// Load all templates once
const allTemplates = await showTemplates.selectRecordsAsync({
  fields: [
    ST_FIELDS.NUM_ROUNDS,
    ST_FIELDS.V1, ST_FIELDS.S1, ST_FIELDS.A1,
    ST_FIELDS.V2, ST_FIELDS.S2, ST_FIELDS.A2,
    ST_FIELDS.Q_PER_VISUAL, ST_FIELDS.Q_PER_SPOKEN, ST_FIELDS.Q_PER_AUDIO,
  ]
});
const templatesById = new Map(allTemplates.records.map(t => [t.id, t]));

// Process each eligible Show
const results = [];
const BATCH = 50;

for (const show of eligibleShows) {
  const template = templatesById.get(show.templateId);

  if (!template) {
    results.push({ show: show.name, status: "⚠️ Template not found", count: 0 });
    continue;
  }

  // Pull template numbers
  const numRounds = nz(template.getCellValue(ST_FIELDS.NUM_ROUNDS));

  const countsR1 = {
    visual: nz(template.getCellValue(ST_FIELDS.V1)),
    spoken: nz(template.getCellValue(ST_FIELDS.S1)),
    audio:  nz(template.getCellValue(ST_FIELDS.A1)),
  };
  const countsR2 = {
    visual: nz(template.getCellValue(ST_FIELDS.V2)),
    spoken: nz(template.getCellValue(ST_FIELDS.S2)),
    audio:  nz(template.getCellValue(ST_FIELDS.A2)),
  };

  const perType = {
    visual: nz(template.getCellValue(ST_FIELDS.Q_PER_VISUAL)),
    spoken: nz(template.getCellValue(ST_FIELDS.Q_PER_SPOKEN)),
    audio:  nz(template.getCellValue(ST_FIELDS.Q_PER_AUDIO)),
  };

  // Build category rows
  let toCreate = [];
  if (numRounds >= 1) {
    toCreate = toCreate.concat(buildRoundRecords(show.id, 1, countsR1, perType));
  }
  if (numRounds >= 2) {
    toCreate = toCreate.concat(buildRoundRecords(show.id, 2, countsR2, perType));
  }

  if (toCreate.length === 0) {
    results.push({ show: show.name, status: "⚠️ Template yields 0 categories", count: 0 });
    continue;
  }

  // Create in batches of 50
  for (let i = 0; i < toCreate.length; i += BATCH) {
    await showCategories.createRecordsAsync(toCreate.slice(i, i + BATCH));
  }

  const totalR1 = (numRounds >= 1) ? (countsR1.visual + countsR1.spoken + countsR1.audio) : 0;
  const totalR2 = (numRounds >= 2) ? (countsR2.visual + countsR2.spoken + countsR2.audio) : 0;

  results.push({
    show: show.name,
    status: "✅ Created",
    count: toCreate.length,
    r1: totalR1,
    r2: totalR2,
  });
}

// Summary report
const lines = results.map(r => {
  if (r.count === 0) {
    return `- **${r.show}**: ${r.status}`;
  }
  return `- **${r.show}**: ${r.status} ${r.count} categories (R1: ${r.r1}, R2: ${r.r2})`;
});

const totalCreated = results.reduce((sum, r) => sum + r.count, 0);

output.markdown([
  "# 🎉 Bulk ShowCategories Creation Complete",
  "",
  `**Total ShowCategories created: ${totalCreated}**`,
  "",
  "## Results by Show:",
  ...lines,
].join("\n"));
