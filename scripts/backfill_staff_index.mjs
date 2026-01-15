// scripts/backfill_staff_index.mjs
import admin from "firebase-admin";

function pickFullName(d) {
  const fullName = (d.fullName || "").trim();
  if (fullName) return fullName;
  const last = (d.lastName || "").trim();
  const first = (d.firstName || "").trim();
  return `${last} ${first}`.trim();
}

function uniqStrings(arr) {
  return Array.from(new Set((arr || []).filter(x => typeof x === "string" && x.trim().length > 0)));
}

async function main() {
  // Uses Application Default Credentials (ADC).
  // In Cloud Shell: gcloud auth application-default login
  // Or locally with GOOGLE_APPLICATION_CREDENTIALS.
  if (!admin.apps.length) admin.initializeApp();

  const db = admin.firestore();

  console.log("Reading users...");
  const usersSnap = await db.collection("users").get();

  let writes = 0;
  let usersProcessed = 0;

  // Firestore batch max: 500 ops
  let batch = db.batch();

  for (const docSnap of usersSnap.docs) {
    usersProcessed += 1;
    const userId = docSnap.id;
    const d = docSnap.data() || {};

    // Supports: unitIds (array), unitIDs (legacy array), unitId (single string)
    const unitIds = uniqStrings([
      ...(Array.isArray(d.unitIds) ? d.unitIds : []),
      ...(Array.isArray(d.unitIDs) ? d.unitIDs : []),
      ...(typeof d.unitId === "string" ? [d.unitId] : []),
    ]);

    if (unitIds.length === 0) continue;

    const payload = {
      userId,
      fullName: pickFullName(d),
      position: typeof d.position === "string" ? d.position : null,
      role: typeof d.role === "string" ? d.role : null,
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    for (const unitId of unitIds) {
      const ref = db.doc(`units/${unitId}/staff/${userId}`);
      batch.set(ref, payload, { merge: true });
      writes += 1;

      if (writes % 450 === 0) {
        // commit early to stay comfortably under 500
        await batch.commit();
        batch = db.batch();
        console.log(`Committed ${writes} writes so far...`);
      }
    }
  }

  if (writes % 450 !== 0) {
    await batch.commit();
  }

  console.log("Done.");
  console.log({ usersProcessed, writes });
  console.log("Next: update the schedule app to read from units/{unitId}/staff instead of users.");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
