/***** Bulk-create ShowQuestions for ALL rounds in a Show (run from ShowCategories)
 *  + copy Category name/description into ShowQuestions
 *  + OPTIONAL post-step: prompt to create Questions based on "Create new" checkbox
 *****/

// ==== TABLE NAMES
const TABLES = {
  SHOW_CATEGORIES: "ShowCategories",
  SHOW_QUESTIONS:  "ShowQuestions",
  CATEGORIES:      "Categories",
  QUESTIONS:       "Questions",
};

// ==== FIELD NAMES ON ShowCategories (source)
const SC = {
  SHOW:      "Show",                        // link → Shows
  CATEGORY:  "Category",                    // link → Categories
  SUPERSECRET:"Super secret",               // checkbox
  QTYPE:     "Question type",               // single select: Visual | Spoken | Audio
  CAT_IMG:   "Category image attachments",  // attachments
  CAT_AUD:   "Category audio attachments",  // attachments
  ROUND:     "Round",                       // number
  CAT_ORDER: "Category order",              // number
  EXPECTED:  "Expected count",              // number
  CREATE_NEW:"Create new"                   // checkbox
};

// ==== FIELD NAMES ON ShowQuestions (destination)
const SQ = {
  SHOW:       "Show",                        // link → Shows
  CATEGORY:   "Category",                    // link → Categories
  SUPERSECRET:"Super secret",                // checkbox
  QTYPE:      "Question type",               // single select
  CAT_IMG:    "Category image attachments",  // attachments
  CAT_AUD:    "Category audio attachments",  // attachments
  ROUND:      "Round",                       // number
  CAT_ORDER:  "Category order",              // number
  Q_ORDER:    "Question order",              // single line text
  SORT_ORDER: "Sort order",                  // number
  CAT_NAME:   "Category name",               // rich text / single line
  CAT_DESC:   "Category description",        // rich text / long text
};

// ==== FIELD NAMES ON Categories (source of name/desc)
const CAT = {
  NAME: "Category name",
  DESC: "Category description",
};

// ==== FIELD NAMES ON Questions (we only create minimal rows)
const QN = {
  CATEGORY:   "Categories",       // ⚠️ your field name (multi-link → Categories)
  QTYPE:      "Question type",    // single select: Spoken | Audio | Visual
  SQ_BACKLINK:"ShowQuestions",    // linked-record back to ShowQuestions
};

// ---------- Helpers
const nz = (n) => (typeof n === "number" && !isNaN(n) ? n : 0);

function toAttach(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(a => a && a.url).map(a => ({ url: a.url, filename: a.filename || undefined }));
}

// spreadsheet-style letters: 1->A, 2->B, … 26->Z, 27->AA, etc
function numToLetters(n) {
  let s = "", x = n;
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s || "A";
}

try {
  const showCategoriesTbl = base.getTable(TABLES.SHOW_CATEGORIES);
  const showQuestionsTbl  = base.getTable(TABLES.SHOW_QUESTIONS);
  const categoriesTbl     = base.getTable(TABLES.CATEGORIES);
  const questionsTbl      = base.getTable(TABLES.QUESTIONS);

  // Run from a specific ShowCategories record
  const scStart = await input.recordAsync(
    "Run for this Show (starting from this category):",
    showCategoriesTbl
  );
  if (!scStart) {
    output.markdown("⚠️ Must run from a **ShowCategories** record.");
    return;
  }

  const showLR = scStart.getCellValue(SC.SHOW) || [];
  const showId = showLR[0]?.id ?? null;
  if (!showId) {
    output.markdown("⚠️ The starting row has no **Show** linked.");
    return;
  }

  // Load ALL ShowCategories (needed fields only)
  const scFields = [SC.SHOW, SC.CATEGORY, SC.SUPERSECRET, SC.QTYPE, SC.CAT_IMG, SC.CAT_AUD, SC.ROUND, SC.CAT_ORDER, SC.EXPECTED, SC.CREATE_NEW];
  const scQuery  = await showCategoriesTbl.selectRecordsAsync({ fields: scFields });

  // Filter to this show + positive Expected count
  const scForShow = scQuery.records
    .filter(r => (r.getCellValue(SC.SHOW) || []).some(x => x?.id === showId))
    .filter(r => nz(r.getCellValue(SC.EXPECTED)) > 0);

  if (scForShow.length === 0) {
    output.markdown("ℹ️ No categories with **Expected count > 0** for this Show.");
    return;
  }

  // Build a set of Category IDs we'll need names/descriptions for
  const needCatIds = new Set();
  for (const r of scForShow) {
    const catLR = r.getCellValue(SC.CATEGORY) || [];
    const catId = catLR[0]?.id || null;
    if (catId) needCatIds.add(catId);
  }

  // Fetch those Categories once for name/desc lookup
  const catQuery = await categoriesTbl.selectRecordsAsync({ fields: [CAT.NAME, CAT.DESC] });
  const catById = new Map(catQuery.records.map(r => [r.id, r]));

  // Group by Round
  const byRound = new Map();
  for (const r of scForShow) {
    const round = nz(r.getCellValue(SC.ROUND));
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round).push(r);
  }

  // Load existing ShowQuestions for this show to continue counters
  const sqFields = [SQ.SHOW, SQ.ROUND, SQ.QTYPE, SQ.SORT_ORDER];
  const sqQuery  = await showQuestionsTbl.selectRecordsAsync({ fields: sqFields });

  const isSameShow = (r) => (r.getCellValue(SQ.SHOW) || []).some(x => x?.id === showId);

  const existingByRound = new Map();
  for (const r of sqQuery.records) {
    if (!isSameShow(r)) continue;
    const round = nz(r.getCellValue(SQ.ROUND));
    if (!existingByRound.has(round)) {
      existingByRound.set(round, { visualCount: 0, numCount: 0, maxSort: 0 });
    }
    const bucket = existingByRound.get(round);
    const so = nz(r.getCellValue(SQ.SORT_ORDER));
    if (so > bucket.maxSort) bucket.maxSort = so;
    const tCell = r.getCellValue(SQ.QTYPE);
    const t = tCell?.name ?? null;
    if (t === "Visual") bucket.visualCount += 1;
    else if (t === "Spoken" || t === "Audio") bucket.numCount += 1;
  }

  // Build creates across *all* rounds
  const toCreate = []; // payloads for ShowQuestions.createRecordsAsync
  // Track categories where "Create new" is checked
  const needNewQuestions = []; // {catId, type, count, catName}

  for (const [round, rows] of byRound.entries()) {
    // Order categories within round
    rows.sort((a, b) => {
      const ao = nz(a.getCellValue(SC.CAT_ORDER));
      const bo = nz(b.getCellValue(SC.CAT_ORDER));
      if (ao !== bo) return ao - bo;
      return (a.name || "").localeCompare(b.name || "");
    });

    // Starting counters for this round (continue from existing)
    const start = existingByRound.get(round) || { visualCount: 0, numCount: 0, maxSort: 0 };
    let nextLetterIndex = start.visualCount + 1; // A=1
    let nextNumberIndex = start.numCount + 1;    // 1..N
    let nextSort        = start.maxSort + 1;     // 1..N

    for (const r of rows) {
      const catLR      = r.getCellValue(SC.CATEGORY) || [];
      const categoryId = catLR[0]?.id || null;
      const superSecret= !!r.getCellValue(SC.SUPERSECRET);
      const qTypeCell  = r.getCellValue(SC.QTYPE);
      const qTypeName  = qTypeCell?.name || null;
      const catImages  = toAttach(r.getCellValue(SC.CAT_IMG));
      const catAudio   = toAttach(r.getCellValue(SC.CAT_AUD));
      const catOrder   = nz(r.getCellValue(SC.CAT_ORDER));
      const expected   = nz(r.getCellValue(SC.EXPECTED));
      const createNew  = !!r.getCellValue(SC.CREATE_NEW);

      if (!categoryId) continue;
      if (!(qTypeName === "Visual" || qTypeName === "Spoken" || qTypeName === "Audio")) continue;

      const catRec = catById.get(categoryId);
      const catName = catRec ? (catRec.getCellValueAsString(CAT.NAME) || "").trim() : "";
      const catDesc = catRec ? (catRec.getCellValueAsString(CAT.DESC) || "").trim() : "";

      // Track if "Create new" is checked
      if (createNew && expected > 0) {
        needNewQuestions.push({
          catId: categoryId,
          type: qTypeName,
          count: expected,
          catName: catName
        });
      }

      for (let i = 0; i < expected; i++) {
        const qOrder = (qTypeName === "Visual")
          ? numToLetters(nextLetterIndex++)
          : String(nextNumberIndex++);

        toCreate.push({
          fields: {
            [SQ.SHOW]:       [{ id: showId }],
            [SQ.CATEGORY]:   [{ id: categoryId }],
            [SQ.SUPERSECRET]:superSecret,
            [SQ.QTYPE]:      { name: qTypeName },
            [SQ.CAT_IMG]:    catImages,
            [SQ.CAT_AUD]:    catAudio,
            [SQ.ROUND]:      round,
            [SQ.CAT_ORDER]:  catOrder,
            [SQ.Q_ORDER]:    qOrder,
            [SQ.SORT_ORDER]: nextSort++,
            [SQ.CAT_NAME]:   catName,
            [SQ.CAT_DESC]:   catDesc,
          }
        });
      }
    }
  }

  if (toCreate.length === 0) {
    output.markdown("ℹ️ Nothing to create (no valid categories or Expected count).");
    return;
  }

  // Create ShowQuestions in batches of 50
  const BATCH = 50;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    await showQuestionsTbl.createRecordsAsync(toCreate.slice(i, i + BATCH));
  }

  output.markdown(`✅ Created **${toCreate.length}** ShowQuestions across **${byRound.size}** round(s) for this Show.`);

  // ===== OPTIONAL POST-STEP: Create Questions based on "Create new" checkbox =====
  if (needNewQuestions.length === 0) {
    output.markdown("ℹ️ No categories have **Create new** checked.");
    return;
  }

  const choice = await input.buttonsAsync(
    `Create ${needNewQuestions.reduce((sum, item) => sum + item.count, 0)} new Questions for categories with "Create new" checked?`,
    ["Yes", "No"]
  );

  if (choice !== "Yes") {
    output.markdown("↪️ Skipped creating questions.");
    return;
  }

  // Create the requested Questions
  const toMake = [];
  const summary = [];

  for (const item of needNewQuestions) {
    for (let i = 0; i < item.count; i++) {
      toMake.push({
        fields: {
          [QN.CATEGORY]: [{ id: item.catId }],
          [QN.QTYPE]:    { name: item.type },
        }
      });
    }
    summary.push({ catName: item.catName, type: item.type, made: item.count });
  }

  for (let i = 0; i < toMake.length; i += BATCH) {
    await questionsTbl.createRecordsAsync(toMake.slice(i, i + BATCH));
  }

  // Summarize by category & type
  const lines = [];
  for (const s of summary) {
    lines.push(`${s.made} ${s.type} (${s.catName})`);
  }
  output.markdown(
    `✅ Created **${toMake.length}** Questions:\n\n- ` +
    lines.join("\n- ")
  );

} catch (err) {
  output.markdown("❌ Error: " + (err?.message ?? String(err)));
}
