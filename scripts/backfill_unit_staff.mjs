// scripts/backfill_unit_staff.mjs
import admin from "firebase-admin";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

if (!PROJECT_ID) {
  console.error("Missing GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT env var.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();

function normalizeUnits(u) {
  const out = [];
  if (Array.isArray(u.unitIds)) out.push(...u.unitIds);
  if (Array.isArray(u.unitIDs)) out.push(...u.unitIDs);
  if (typeof u.unitId === "string" && u.unitId) out.push(u.unitId);
  // unique + truthy
  return [...new Set(out.filter(Boolean))];
}

async function main() {
  console.log("Project:", PROJECT_ID);
  console.log("Reading users...");

  const snap = await db.collection("users").get();
  console.log("Users:", snap.size);

  let batch = db.batch();
  let ops = 0;
  let written = 0;

  for (const doc of snap.docs) {
    const userId = doc.id;
    const data = doc.data();
    const units = normalizeUnits(data);

    for (const unitId of units) {
      const ref = db.doc(`unit_staff/${unitId}/users/${userId}`);
      batch.set(
        ref,
        {
          userId,
          unitId,
          // minimal fields for list
          fullName: data.fullName ?? `${(data.lastName ?? "")} ${(data.firstName ?? "")}`.trim(),
          position: data.position ?? null,
          active: data.active ?? true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      ops++;
      written++;

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
        process.stdout.write(`Committed... written=${written}\n`);
      }
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  console.log("DONE. unit_staff entries written:", written);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
}); 
