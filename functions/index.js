/* global require, exports, process */
/* eslint-disable no-unused-vars, no-empty */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { Expo } = require("expo-server-sdk");

const app = express();
console.log("[INIT] Express app booting...");
app.use(cors({ origin: true }));
app.use(express.json());
app.use((req, _res, next) => {
  try { console.log(`[REQ] ${req.method} ${req.path}`); } catch (e) { }
  next();
});

const ECOHOMELY_APP_NAME = "ecohomely-app";
const ECOHOMELY_PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "ecohomely-app";
try {
  const defaultApp = admin.app();
  if (defaultApp && defaultApp.name === '[DEFAULT]') {
    console.log("[INIT] Deleting default Firebase Admin app (might be from workexpress project)");
    admin.app().delete();
  }
} catch (e) {
  // No default app exists, which is fine
  console.log("[INIT] No default Firebase Admin app found");
}

// Initialize with ecohomely-app credentials
let adminApp;
try {
  adminApp = admin.app(ECOHOMELY_APP_NAME);
  console.log("[INIT] Firebase Admin app already exists, using existing app");
} catch (e) {
  // App doesn't exist, initialize it with explicit project configuration
  adminApp = admin.initializeApp({
    projectId: ECOHOMELY_PROJECT_ID,
  }, ECOHOMELY_APP_NAME);
  console.log(`[INIT] Firebase Admin initialized for project: ${ECOHOMELY_PROJECT_ID}`);
}

// Get Firestore instance - explicitly use the ecohomely app
// This ensures we're connecting to the ecohomely-app database, not workexpress
const db = admin.firestore(adminApp);
console.log("[INIT] Firestore database initialized for project:", ECOHOMELY_PROJECT_ID);

/** True if string looks like a Firebase Storage download URL (v0/b/.../o/...). */
function isFirebaseStorageHttpsUrl(s) {
  return (
    typeof s === "string" &&
    /^https:\/\//i.test(s) &&
    s.includes("firebasestorage.googleapis.com") &&
    s.includes("/o/")
  );
}

/**
 * Parse Firebase download URL path `.../v0/b/{bucket}/o/{encodedObjectPath}`.
 * @returns {{ bucketName: string, objectPath: string } | null}
 */
function parseFirebaseStorageDownloadUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (!u.hostname.endsWith("firebasestorage.googleapis.com")) return null;
    const pathMatch = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!pathMatch) return null;
    const bucketName = decodeURIComponent(pathMatch[1]);
    let encodedObject = pathMatch[2];
    const q = encodedObject.indexOf("?");
    if (q !== -1) encodedObject = encodedObject.slice(0, q);
    const objectPath = decodeURIComponent(encodedObject.replace(/\+/g, " "));
    return { bucketName, objectPath };
  } catch (e) {
    return null;
  }
}

/**
 * Parse `https://storage.googleapis.com/{bucket}/{objectPath}` (signed/public style).
 * @returns {{ bucketName: string, objectPath: string } | null}
 */
function parseStorageGoogleapisUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.hostname !== "storage.googleapis.com") return null;
    const path = u.pathname.replace(/^\/+/, "");
    const slash = path.indexOf("/");
    if (slash === -1) return null;
    const bucketName = decodeURIComponent(path.slice(0, slash));
    const objectPath = decodeURIComponent(
      path.slice(slash + 1).replace(/\+/g, " ")
    );
    if (!bucketName || !objectPath) return null;
    return { bucketName, objectPath };
  } catch (e) {
    return null;
  }
}

/** `gs://bucket/object/path` → { bucketName, objectPath } */
function parseGsUrl(url) {
  if (typeof url !== "string" || !url.startsWith("gs://")) return null;
  try {
    const without = url.slice(5);
    const slash = without.indexOf("/");
    if (slash === -1) return null;
    const bucketName = without.slice(0, slash);
    const objectPath = decodeURIComponent(without.slice(slash + 1).replace(/\+/g, " "));
    if (!bucketName || !objectPath) return null;
    return { bucketName, objectPath };
  } catch (e) {
    return null;
  }
}

/** Recursively collect deletable Storage URLs from correction snapshot JSON. */
function collectFirebaseStorageDownloadUrls(value, intoSet) {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (isFirebaseStorageHttpsUrl(t)) intoSet.add(t);
    else if (/^gs:\/\//i.test(t)) intoSet.add(t);
    else if (parseStorageGoogleapisUrl(t)) intoSet.add(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFirebaseStorageDownloadUrls(item, intoSet);
    return;
  }
  if (typeof value === "object") {
    for (const k of Object.keys(value)) {
      collectFirebaseStorageDownloadUrls(value[k], intoSet);
    }
  }
}

/**
 * Resolve a collected URL string to { bucketName, objectPath } for deletion.
 * @param {string} url
 * @returns {{ bucketName: string, objectPath: string } | null}
 */
function resolveStorageObjectFromUrl(url) {
  if (typeof url !== "string") return null;
  const t = url.trim();
  if (t.startsWith("gs://")) return parseGsUrl(t);
  const fb = parseFirebaseStorageDownloadUrl(t);
  if (fb) return fb;
  return parseStorageGoogleapisUrl(t);
}

/**
 * On approve: delete every Firebase / GCS object URL found inside `correctionFieldValues`
 * (images, PDFs, videos, docs, etc.), then the caller removes that map and `correctionFields`
 * from Firestore.
 */
async function deleteCorrectionSnapshotStorageFiles(servicemanData) {
  const cfv =
    servicemanData && typeof servicemanData === "object"
      ? servicemanData.correctionFieldValues
      : undefined;
  if (!cfv || typeof cfv !== "object" || Array.isArray(cfv)) return;

  const correctionUrls = new Set();
  for (const key of Object.keys(cfv)) {
    collectFirebaseStorageDownloadUrls(cfv[key], correctionUrls);
  }
  if (correctionUrls.size === 0) return;

  const toDelete = [...correctionUrls];
  await Promise.all(
    toDelete.map(async (url) => {
      const parsed = resolveStorageObjectFromUrl(url);
      if (!parsed) {
        console.warn(`[approve] Skip storage delete (unparseable URL): ${String(url).slice(0, 120)}`);
        return;
      }
      try {
        const bucket = admin.storage(adminApp).bucket(parsed.bucketName);
        const file = bucket.file(parsed.objectPath);
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
          console.log(
            `[approve] Deleted correction snapshot file: gs://${parsed.bucketName}/${parsed.objectPath}`
          );
        }
      } catch (err) {
        const firstApiErr =
          err && err.errors && err.errors[0] ? err.errors[0] : null;
        const code = err && (err.code || (firstApiErr && firstApiErr.code));
        if (code === 404) {
          console.warn(`[approve] Storage object already missing: ${parsed.objectPath}`);
        } else {
          console.error(
            `[approve] Storage delete failed for ${url}:`,
            err && err.message ? err.message : err
          );
        }
      }
    })
  );
}

// ─── Google Sheets: append chat history row (optional, no-op if spreadsheet ID not set)
// Sheet: ecohomelydevelopment@gmail.com — https://docs.google.com/spreadsheets/d/1cAR0xLEV7IwXwp1iGf-OoWKrIUqvyYupdL6eVcSSYu4/
// Override with GOOGLE_SHEET_CHATBOT_HISTORY_ID or functions.config().sheets.spreadsheet_id.
// Enable Google Sheets API in GCP and share the sheet with the deployed function service account.
const SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];
const DEFAULT_CHATBOT_HISTORY_SHEET_ID = "1cAR0xLEV7IwXwp1iGf-OoWKrIUqvyYupdL6eVcSSYu4";
const CHAT_HISTORY_SHEET_HEADERS = ["Session ID", "Date", "Time", "Lang", "Messages", "Conversation"];

function formatConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  return messages
    .map((m) => {
      const role = (m.role === "user" ? "User" : "Bot");
      let content = (m.content || "").trim();
      content = content.replace(/\r\n/g, " ").replace(/\n/g, " ").slice(0, 50000);
      return `"${role}": ${content}`;
    })
    .join(", ");
}

const IST_OPT = { timeZone: "Asia/Kolkata" };

function googleSheetsAuth() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawCredentials) {
    const credentials = JSON.parse(rawCredentials);
    return new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: SHEETS_SCOPE,
    });
  }

  return new google.auth.GoogleAuth({scopes: SHEETS_SCOPE});
}

async function appendChatHistoryToSheet(sessionId, data) {
  const spreadsheetId = process.env.GOOGLE_SHEET_CHATBOT_HISTORY_ID || functions.config().sheets?.spreadsheet_id || DEFAULT_CHATBOT_HISTORY_SHEET_ID;
  if (!spreadsheetId || !sessionId) return;

  try {
    const auth = googleSheetsAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const startMs = typeof data.startTime === "number" ? data.startTime : (data.startTime?.toMillis?.() ?? 0);
    const startDate = startMs ? new Date(startMs) : new Date();
    const dateStr = startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", ...IST_OPT });
    const timeStr = startDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, ...IST_OPT });
    const msgCount = Array.isArray(data.messages) ? data.messages.length : 0;
    const lang = (data.lang || "en").toUpperCase();
    const conversation = formatConversation(data.messages);
    const row = [sessionId, dateStr, timeStr, lang, msgCount, conversation];

    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Sheet1!A1:F1" }).catch(() => ({ data: { values: null } }));
    const hasHeader = headerRes.data?.values && headerRes.data.values.length > 0;
    if (!hasHeader) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1:F1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [CHAT_HISTORY_SHEET_HEADERS] },
      });
    }

    const colARes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Sheet1!A2:A" }).catch(() => ({ data: { values: [] } }));
    const colA = colARes.data?.values || [];
    const rowIndex = colA.findIndex((r) => (r && r[0]) === sessionId);
    if (rowIndex >= 0) {
      const sheetRow = rowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!A${sheetRow}:F${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
      console.log("[Sheets] Updated existing row for session:", sessionId);
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A:F",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
      console.log("[Sheets] Appended new row for session:", sessionId);
    }
  } catch (e) {
    console.warn("[Sheets] Failed to sync chat history (sheet may be missing or not shared with service account):", e.message);
  }
}

// Route to fetch all users
app.get("/users", async (req, res) => {
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No users found" });
    }

    const users = [];
    snapshot.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to fetch all assistance records
app.get("/assistance", async (req, res) => {
  try {
    const assistanceRef = db.collection("assistance");
    const snapshot = await assistanceRef.get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const assistanceRecords = [];
    snapshot.forEach((doc) => {
      assistanceRecords.push({ id: doc.id, ...doc.data() });
    });

    // Sort by date/time descending (most recent first)
    assistanceRecords.sort((a, b) => {
      const aTime = a.time?.toMillis ? a.time.toMillis() : (a.time?._seconds ? a.time._seconds * 1000 : (a.date?._seconds ? a.date._seconds * 1000 : 0));
      const bTime = b.time?.toMillis ? b.time.toMillis() : (b.time?._seconds ? b.time._seconds * 1000 : (b.date?._seconds ? b.date._seconds * 1000 : 0));
      return bTime - aTime;
    });

    res.status(200).json(assistanceRecords);
  } catch (error) {
    console.error("Error fetching assistance records:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route to update assistance record solved status
app.patch("/assistance/:id/solved", async (req, res) => {
  try {
    const recordId = req.params.id;
    const { solved } = req.body;

    if (typeof solved !== 'boolean') {
      return res.status(400).json({ error: "Solved must be a boolean value" });
    }

    const assistanceRef = db.collection("assistance").doc(recordId);
    const doc = await assistanceRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Assistance record not found" });
    }

    await assistanceRef.update({ solved });
    const updatedDoc = await assistanceRef.get();

    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Error updating assistance record:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route to delete a user by ID
app.delete("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "User not found" });
    }

    await userRef.delete();
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to update accountEdited flag for a user
app.patch("/users/:id/accountEdited", async (req, res) => {
  try {
    const userId = req.params.id;
    const { accountEdited } = req.body;

    if (typeof accountEdited !== "boolean") {
      return res.status(400).json({ error: "accountEdited must be a boolean value" });
    }

    const userRef = db.collection("users").doc(userId);
    const docSnap = await userRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    await userRef.update({ accountEdited });
    const updatedDoc = await userRef.get();

    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Error updating user accountEdited flag:", error);
    res.status(500).json({ error: error.message });
  }
});


// Route to fetch all servicemen
app.get("/servicemen", async (req, res) => {
  try {
    const servicemenRef = db.collection("servicemen");
    const snapshot = await servicemenRef.get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No servicemen found" });
    }

    const servicemen = [];
    snapshot.forEach((doc) => {
      servicemen.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(servicemen);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to delete a serviceman by ID
app.delete("/servicemen/:id", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Serviceman not found" });
    }

    await servicemanRef.delete();
    res.status(200).json({ message: "Serviceman deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to update accountEdited flag for a serviceman
app.patch("/servicemen/:id/accountEdited", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const { accountEdited } = req.body;

    if (typeof accountEdited !== "boolean") {
      return res.status(400).json({ error: "accountEdited must be a boolean value" });
    }

    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const docSnap = await servicemanRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Serviceman not found" });
    }

    await servicemanRef.update({ accountEdited });
    const updatedDoc = await servicemanRef.get();

    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Error updating serviceman accountEdited flag:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route to update a serviceman by ID
app.put("/servicemen/:id", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const servicemanData = req.body;

    // Log incoming data for debugging
    console.log(`📥 Updating serviceman ${servicemanId}:`, {
      media: servicemanData.media?.length || 0,
      documents: servicemanData.documents?.length || 0,
      hidden: servicemanData.hidden?.length || 0,
      hiddenDocuments: servicemanData.hiddenDocuments?.length || 0,
      secondaryMedia: servicemanData.secondaryMedia?.length || 0,
      secondaryDocuments: servicemanData.secondaryDocuments?.length || 0,
      hiddenSecondary: servicemanData.hiddenSecondary?.length || 0,
      hiddenSecondaryDocuments: servicemanData.hiddenSecondaryDocuments?.length || 0,
    });
    
    // Log media array structure for debugging
    if (servicemanData.media && servicemanData.media.length > 0) {
      console.log("📥 Media array items received:", servicemanData.media.map((item, idx) => ({
        index: idx,
        isEmpty: item === "" || item === null || item === undefined,
        isObject: typeof item === 'object',
        hasUrl: item?.url ? true : false,
        hasType: item?.type ? true : false,
        type: item?.type,
        url: item?.url ? item.url.substring(0, 50) + '...' : 'none',
      })));
    }

    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      return res.status(404)
        .json({ error: "Serviceman not found" });
    }

    // If only isFlaged is being updated, handle it as a simple flag update
    const updateKeys = Object.keys(servicemanData);
    const isOnlyFlagUpdate = updateKeys.length === 1 && updateKeys[0] === 'isFlaged';

    if (isOnlyFlagUpdate) {
      // Simple flag update - no need for complex validations
      const updateData = {};
      if (servicemanData.isFlaged === null) {
        // Use FieldValue.delete() to remove the field from Firestore
        updateData.isFlaged = admin.firestore.FieldValue.delete();
      } else {
        updateData.isFlaged = servicemanData.isFlaged;
      }
      await servicemanRef.update(updateData);
      const updatedDoc = await servicemanRef.get();
      return res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
    }

    // Admin: mark which profile field keys need correction (+ optional snapshots of values)
    const correctionUpdateKeys = updateKeys.filter(
      (k) => k === "correctionFields" || k === "correctionFieldValues"
    );
    const isOnlyCorrectionFieldsUpdate =
      correctionUpdateKeys.length === updateKeys.length &&
      updateKeys.length >= 1 &&
      updateKeys.length <= 2 &&
      updateKeys.includes("correctionFields");

    if (isOnlyCorrectionFieldsUpdate) {
      const raw = servicemanData.correctionFields;
      if (!Array.isArray(raw)) {
        return res.status(400)
          .json({ error: "correctionFields must be an array of field name strings" });
      }
      const correctionFields = [...new Set(
        raw
          .map((x) => {
            if (typeof x === "string") return x.trim();
            if (x && typeof x === "object" && x.key != null) return String(x.key).trim();
            return "";
          })
          .filter((s) => s !== "")
      )];

      const updatePayload = { correctionFields };

      if (Object.prototype.hasOwnProperty.call(servicemanData, "correctionFieldValues")) {
        const cfv = servicemanData.correctionFieldValues;
        if (cfv === null) {
          updatePayload.correctionFieldValues = admin.firestore.FieldValue.delete();
        } else if (typeof cfv !== "object" || Array.isArray(cfv)) {
          return res.status(400).json({
            error: "correctionFieldValues must be a plain object (field key → snapshot), or null to remove",
          });
        } else if (correctionFields.length === 0) {
          if (Object.keys(cfv).length > 0) {
            return res.status(400).json({
              error: "correctionFieldValues must be {} when correctionFields is empty",
            });
          }
          updatePayload.correctionFieldValues = admin.firestore.FieldValue.delete();
        } else {
          const valueKeys = Object.keys(cfv);
          const unknown = valueKeys.filter((k) => !correctionFields.includes(k));
          if (unknown.length) {
            return res.status(400).json({
              error: `correctionFieldValues has keys not listed in correctionFields: ${unknown.join(", ")}`,
            });
          }
          const missing = correctionFields.filter((k) => !Object.prototype.hasOwnProperty.call(cfv, k));
          if (missing.length) {
            return res.status(400).json({
              error: `correctionFieldValues missing entries for: ${missing.join(", ")}`,
            });
          }
          updatePayload.correctionFieldValues = cfv;
        }
      }

      await servicemanRef.update(updatePayload);
      const updatedDoc = await servicemanRef.get();
      return res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
    }

    // Full update - validate media and services
    if (servicemanData.media !== null && servicemanData.media !== undefined) {
      if (!Array.isArray(servicemanData.media)) {
        return res.status(400)
          .json({ error: "Media must be an array" });
      }
      for (let i = 0; i < servicemanData.media.length; i++) {
        const item = servicemanData.media[i];
        // Skip null or undefined items (shouldn't happen, but handle gracefully)
        if (item === null || item === undefined) {
          console.warn(`Media item at index ${i} is null/undefined, skipping`);
          continue;
        }
        // Ensure item is an object (no empty strings expected - hidden items are removed from array)
        if (typeof item !== 'object') {
          console.error(`Invalid media item at index ${i}: not an object`, item);
          return res.status(400).json({ error: `Invalid media format at index ${i}: item must be an object` });
        }
        // Validate media items
        if (!item.url || !item.type ||
          !["image", "video"].includes(item.type)) {
          console.error(`Invalid media item at index ${i}:`, item);
          return res.status(400).json({ error: `Invalid media format at index ${i}: missing url, type, or invalid type` });
        }
        if (!item.url.startsWith("https://firebasestorage.googleapis.com")) {
          console.error(`Invalid media URL at index ${i}:`, item.url);
          return res.status(400)
            .json({ error: `Invalid media URL at index ${i}: must be from Firebase Storage` });
        }
      }
    }

    if (servicemanData.services && !Array.isArray(servicemanData.services)) {
      return res.status(400)
        .json({ error: "Services must be an array" });
    }

    // If the serviceman was asked for a profile correction and is now submitting a
    // real profile edit, mark it as a resubmission so it surfaces in the admin's
    // Profile Updates review inbox (mirrors isWorkerCorrectionResubmission in
    // src/services/firebaseClient.js, which only runs for admin-initiated writes).
    const existingData = doc.data() || {};
    const correctionWasActive = Boolean(
      existingData.correctionRequired
      || existingData.requiresCorrection
      || existingData.needsCorrection
      || existingData.correctionRequested
      || String(existingData.approvalStatus || "").toLowerCase().includes("correction")
    );

    // Handle isFlaged field deletion - if it's null, delete the field
    const updateData = { ...servicemanData };

    if (correctionWasActive) {
      updateData.correctionSubmittedAt = new Date().toISOString();
      updateData.correctionStatus = "Submitted";
      updateData.correctionRequired = false;
      updateData.requiresCorrection = false;
      updateData.needsCorrection = false;
      updateData.correctionRequested = false;
      updateData.adminCorrectionNotificationRead = false;
      updateData.approvalStatus = "Pending";
      updateData.reviewStatus = "Pending";
    }
    if (updateData.isFlaged === null) {
      // Use FieldValue.delete() to remove the field from Firestore
      updateData.isFlaged = admin.firestore.FieldValue.delete();
    } else if (updateData.isFlaged === undefined) {
      // If undefined, don't include it in the update
      delete updateData.isFlaged;
    }

    // CRITICAL: Handle image field - ALWAYS ensure it's a valid string URL
    // This prevents mobile app crashes when image field has wrong type or is null/undefined
    // If image is provided in update, validate and normalize it
    if (updateData.image !== undefined) {
      if (updateData.image === null || updateData.image === '' || 
          (typeof updateData.image === 'object' && updateData.image !== null)) {
        // If null, empty, or object (like Firestore Timestamp), get existing image or use default
        const existingData = doc.data();
        updateData.image = existingData.image || "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
      }
      // Ensure it's always a string type
      if (typeof updateData.image !== 'string') {
        updateData.image = String(updateData.image);
      }
      // Validate it's a valid URL string
      if (!updateData.image || updateData.image.trim() === '') {
        const existingData = doc.data();
        updateData.image = existingData.image || "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
      }
    } else {
      // If image is not in update, ensure existing image is still valid (prevent type corruption)
      // CRITICAL: Always validate existing image field to prevent mobile app crashes
      const existingData = doc.data();
      const existingImage = existingData.image;
      
      // If existing image is invalid (null, undefined, empty string, or not a string), set to default
      if (!existingImage || typeof existingImage !== 'string' || existingImage.trim() === '') {
        updateData.image = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
      }
      // If existing image is valid, ensure it stays valid (no need to update)
    }
    
    // Remove fields that shouldn't be updated (availability times, etc.)
    // These fields might be in formData but should not be modified
    delete updateData.availabilityStart;
    delete updateData.availabilityEnd;
    delete updateData.secondaryAvailabilityStart;
    delete updateData.secondaryAvailabilityEnd;

    // Handle media and documents - set to empty array if empty (not null) to prevent mobile app crashes
    // Mobile apps expect these fields to be arrays, not null or missing
    if (updateData.media !== undefined) {
      if (!Array.isArray(updateData.media)) {
        updateData.media = [];
      }
      // Ensure empty array is set (not null) - mobile apps expect array type
      if (updateData.media.length === 0) {
        updateData.media = [];
      }
    }
    if (updateData.secondaryMedia !== undefined) {
      if (!Array.isArray(updateData.secondaryMedia)) {
        updateData.secondaryMedia = [];
      }
      if (updateData.secondaryMedia.length === 0) {
        updateData.secondaryMedia = [];
      }
    }
    if (updateData.documents !== undefined) {
      if (!Array.isArray(updateData.documents)) {
        updateData.documents = [];
      }
      if (updateData.documents.length === 0) {
        updateData.documents = [];
      }
    }
    if (updateData.secondaryDocuments !== undefined) {
      if (!Array.isArray(updateData.secondaryDocuments)) {
        updateData.secondaryDocuments = [];
      }
      if (updateData.secondaryDocuments.length === 0) {
        updateData.secondaryDocuments = [];
      }
    }
    
    // Handle hidden media array - validate and ensure it's an array
    if (updateData.hidden !== undefined) {
      if (!Array.isArray(updateData.hidden)) {
        updateData.hidden = [];
      }
      // Validate hidden media items
      updateData.hidden = updateData.hidden.filter(item => {
        if (!item || typeof item !== 'object') return false;
        return item.url && item.type && ["image", "video"].includes(item.type);
      });
      if (updateData.hidden.length === 0) {
        updateData.hidden = admin.firestore.FieldValue.delete();
      }
    }
    
    // Handle hidden documents array - validate and ensure it's an array
    if (updateData.hiddenDocuments !== undefined) {
      if (!Array.isArray(updateData.hiddenDocuments)) {
        updateData.hiddenDocuments = [];
      }
      // Validate hidden documents - allow both {file: {url}} and {url} structures
      updateData.hiddenDocuments = updateData.hiddenDocuments.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const fileUrl = item?.file?.url || item?.url;
        return fileUrl && fileUrl.startsWith("https://firebasestorage.googleapis.com");
      });
      if (updateData.hiddenDocuments.length === 0) {
        updateData.hiddenDocuments = admin.firestore.FieldValue.delete();
      }
    }
    
    // Handle hidden secondary media array - validate and ensure it's an array
    if (updateData.hiddenSecondary !== undefined) {
      if (!Array.isArray(updateData.hiddenSecondary)) {
        updateData.hiddenSecondary = [];
      }
      // Validate hidden secondary media items
      updateData.hiddenSecondary = updateData.hiddenSecondary.filter(item => {
        if (!item || typeof item !== 'object') return false;
        return item.url && item.type && ["image", "video"].includes(item.type);
      });
      if (updateData.hiddenSecondary.length === 0) {
        updateData.hiddenSecondary = admin.firestore.FieldValue.delete();
      }
    }
    
    // Handle hidden secondary documents array - validate and ensure it's an array
    if (updateData.hiddenSecondaryDocuments !== undefined) {
      if (!Array.isArray(updateData.hiddenSecondaryDocuments)) {
        updateData.hiddenSecondaryDocuments = [];
      }
      // Validate hidden secondary documents - allow both {file: {url}} and {url} structures
      updateData.hiddenSecondaryDocuments = updateData.hiddenSecondaryDocuments.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const fileUrl = item?.file?.url || item?.url;
        return fileUrl && fileUrl.startsWith("https://firebasestorage.googleapis.com");
      });
      if (updateData.hiddenSecondaryDocuments.length === 0) {
        updateData.hiddenSecondaryDocuments = admin.firestore.FieldValue.delete();
      }
    }
    
    // Validate documents array - allow empty strings for hidden items
    if (updateData.documents !== null && updateData.documents !== undefined) {
      if (!Array.isArray(updateData.documents)) {
        return res.status(400).json({ error: "Documents must be an array" });
      }
      for (let i = 0; i < updateData.documents.length; i++) {
        const item = updateData.documents[i];
        // Skip null or undefined items (shouldn't happen, but handle gracefully)
        if (item === null || item === undefined) {
          console.warn(`Document item at index ${i} is null/undefined, skipping`);
          continue;
        }
        // Ensure item is an object (no empty strings expected - hidden items are removed from array)
        if (typeof item !== 'object') {
          console.error(`Invalid document format at index ${i} - not an object:`, typeof item, item);
          return res.status(400).json({ error: `Invalid document format at index ${i}: item must be an object` });
        }
        const fileUrl = item?.file?.url || item?.url;
        if (!fileUrl) {
          console.error(`Document missing URL at index ${i}:`, item);
          return res.status(400).json({ error: `Invalid document format at index ${i}: missing URL` });
        }
        if (!fileUrl.startsWith("https://firebasestorage.googleapis.com")) {
          console.error(`Invalid document URL at index ${i}:`, fileUrl);
          return res.status(400).json({ error: `Invalid document URL at index ${i}: must be from Firebase Storage` });
        }
      }
    }

    await servicemanRef.update(updateData);
    const updatedDoc = await servicemanRef.get();

    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Error updating serviceman:", error);
    res.status(500)
      .json({ error: "Internal server error" });
  }
});


// Route to fetch bookings of a particular serviceman
app.get("/servicemen/:id/bookings", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const bookingsRef = db.collection("servicemen")
      .doc(servicemanId).collection("Bookings");
    const snapshot = await bookingsRef.get();

    if (snapshot.empty) {
      return res.status(404)
        .json({ message: "No bookings found for this serviceman" });
    }

    const bookings = [];
    snapshot.forEach((doc) => {
      bookings.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to approve or reject a service provider
app.patch("/servicemen/:id/approve", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const { Approved, approvedBy } = req.body;

    if (typeof Approved !== "boolean") {
      return res.status(400)
        .json({
          message:
            "Invalid request. 'Approved' must be true or false."
        });
    }

    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Serviceman not found" });
    }

    const servicemanData = doc.data();
    const updateData = { Approved };
    if (Approved && approvedBy != null && String(approvedBy).trim() !== "") {
      updateData.approvedBy = String(approvedBy).trim();
    } else if (!Approved) {
      updateData.approvedBy = null;
    }

    if (Approved === true) {
      await deleteCorrectionSnapshotStorageFiles(servicemanData);
      updateData.correctionFields = admin.firestore.FieldValue.delete();
      updateData.correctionFieldValues = admin.firestore.FieldValue.delete();
    }

    await servicemanRef.update(updateData);

    res.status(200)
      .json({
        message: `Serviceman ${Approved ? "approved" : "rejected"} successfully.`
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to flag or unflag a serviceman
app.patch("/servicemen/:id/flag", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const { isFlaged } = req.body;

    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Serviceman not found" });
    }

    // If isFlaged is null or false, remove the field. Otherwise, set it to true
    if (isFlaged === null || isFlaged === false) {
      await servicemanRef.update({
        isFlaged: admin.firestore.FieldValue.delete()
      });
      res.status(200).json({
        message: "Serviceman unflagged successfully",
        isFlaged: null
      });
    } else if (isFlaged === true) {
      await servicemanRef.update({ isFlaged: true });
      res.status(200).json({
        message: "Serviceman flagged successfully",
        isFlaged: true
      });
    } else {
      return res.status(400).json({
        error: "Invalid request. 'isFlaged' must be true, false, or null."
      });
    }
  } catch (error) {
    console.error("Error flagging/unflagging serviceman:", error);
    res.status(500).json({ error: error.message });
  }
});


// Route to fetch reviews and ratings of a particular serviceman
app.get("/servicemen/:id/reviews", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const reviewsRef = db.collection("reviews")
      .where("sid", "==", servicemanId);
    const snapshot = await reviewsRef.get();

    if (snapshot.empty) {
      return res.status(404)
        .json({ message: "No reviews found for this serviceman" });
    }

    const reviews = [];
    snapshot.forEach((doc) => {
      reviews.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to fetch servicemenStats for a particular serviceman (must be before /servicemen/:id)
app.get("/servicemen/:uid/stats", async (req, res) => {
  try {
    const servicemanUid = req.params.uid;
    console.log(`[servicemenStats] Fetching stats for UID: ${servicemanUid}`);

    const statsRef = db.collection("servicemenStats");

    // Query all documents where servicemanId matches the uid AND type is "call_action"
    console.log(`[servicemenStats] Querying with servicemanId: ${servicemanUid}, type: call_action`);
    const snapshot = await statsRef
      .where("servicemanId", "==", servicemanUid)
      .where("type", "==", "call_action")
      .get();

    console.log(`[servicemenStats] Query returned ${snapshot.size} documents`);

    if (snapshot.empty) {
      console.log(`[servicemenStats] No records found for serviceman ${servicemanUid}`);
      return res.status(200).json([]);
    }

    const stats = [];
    const userIds = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.userId) {
        userIds.add(data.userId);
      }
      stats.push({ id: doc.id, ...data });
    });

    // Fetch user names for all unique user IDs
    const userNamesMap = {};
    if (userIds.size > 0) {
      const usersRef = db.collection("users");
      const userPromises = Array.from(userIds).map(async (userId) => {
        try {
          const userDoc = await usersRef.doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            userNamesMap[userId] = userData.name || 'Unknown User';
          } else {
            userNamesMap[userId] = 'Unknown User';
          }
        } catch (error) {
          console.error(`Error fetching user ${userId}:`, error);
          userNamesMap[userId] = 'Unknown User';
        }
      });
      await Promise.all(userPromises);
    }

    // Add user names to stats
    stats.forEach((stat) => {
      stat.userName = userNamesMap[stat.userId] || 'Unknown User';
    });

    // Sort by timestamp descending (most recent first)
    stats.sort((a, b) => {
      const aTime = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp?._seconds ? a.timestamp._seconds * 1000 : 0);
      const bTime = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp?._seconds ? b.timestamp._seconds * 1000 : 0);
      return bTime - aTime;
    });

    console.log(`[servicemenStats] Returning ${stats.length} call_action records for serviceman ${servicemanUid}`);
    res.status(200).json(stats);
  } catch (error) {
    console.error("[servicemenStats] Error fetching servicemenStats:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route to fetch a particular serviceman's data
app.get("/servicemen/:id", async (req, res) => {
  try {
    const servicemanId = req.params.id;
    const servicemanRef = db.collection("servicemen").doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "Serviceman not found" });
    }

    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Route to fetch a particular user's data
app.get("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const { Timestamp } = require("firebase-admin/firestore");

app.get("/stats", async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    // Fetch total customers manually
    const usersSnapshot = await db.collection("users").get();
    const totalCustomers = usersSnapshot.size;

    // Fetch total servicemen manually
    const servicemenSnapshot = await db.collection("servicemen").get();
    const totalServicemen = servicemenSnapshot.size;

    // Count approved and rejected servicemen
    let approvedCount = 0;
    let rejectedCount = 0;
    servicemenSnapshot.forEach((doc) => {
      const { Approved } = doc.data();
      if (Approved === true) approvedCount++;
      else if (Approved === false) rejectedCount++;
    });

    // Fetch all bookings manually
    const bookingsSnapshot = await db.collectionGroup("Bookings").get();
    const totalBookings = bookingsSnapshot.size;

    // Count this month's bookings manually
    let thisMonthBookings = 0;
    bookingsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.BookingDate && data.BookingDate instanceof Timestamp) {
        const bookingDate = data.BookingDate.toDate();
        if (bookingDate >= startOfMonth && bookingDate <= endOfMonth) {
          thisMonthBookings++;
        }
      }
    });

    res.status(200).json({
      totalCustomers,
      totalServicemen,
      approvedServicemen: approvedCount,
      rejectedServicemen: rejectedCount,
      totalBookings,
      thisMonthBookings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400)
        .json({ message: "Username and password are required." });
    }

    // Query the admin collection for a matching username and password
    const adminSnapshot = await db.collection("admin")
      .where("username", "==", username)
      .where("password", "==", password)
      .get();

    if (adminSnapshot.empty) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    // If a match is found, return success
    const adminData = adminSnapshot.docs[0].data();
    res.status(200).json({ message: "Login successful", admin: adminData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to list routes
app.get("/__routes", (_req, res) => {
  try {
    const routes = (app._router?.stack || [])
      .filter((r) => r.route)
      .map((r) => ({ path: r.route.path, methods: Object.keys(r.route.methods) }));
    res.status(200).json({ routes });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Change password for admin (self-service)
app.post("/admin/change-password", async (req, res) => {
  try {
    console.log("[CHANGE-PASSWORD] body:", JSON.stringify(req.body || {}));
    const { username, currentPassword, newPassword } = req.body || {};

    if (!username || !currentPassword || !newPassword) {
      console.log("[CHANGE-PASSWORD] missing fields", { u: !!username, c: !!currentPassword, n: !!newPassword });
      return res.status(400).json({ message: "username, currentPassword, and newPassword are required." });
    }

    const collectionsToTry = ["admins", "admin"]; // prefer 'admins' but support legacy 'admin'
    let matchDoc = null;
    let matchedCollection = null;
    for (const col of collectionsToTry) {
      const snap = await db.collection(col)
        .where("username", "==", username)
        .where("password", "==", currentPassword)
        .get();
      if (!snap.empty) {
        matchDoc = snap.docs[0];
        matchedCollection = col;
        break;
      }
    }

    if (!matchDoc) {
      console.log("[CHANGE-PASSWORD] invalid current password for:", username, " in collections:", collectionsToTry);
      return res.status(401).json({ message: "Invalid current password." });
    }

    await db.collection(matchedCollection).doc(matchDoc.id).update({ password: newPassword });
    console.log("[CHANGE-PASSWORD] updated doc:", matchDoc.id, "collection:", matchedCollection);
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Area Names Management Routes
// GET all area names
app.get("/area-names", async (req, res) => {
  try {
    const areaNamesRef = db.collection("areaNames");
    const snapshot = await areaNamesRef.get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const areaNames = [];
    snapshot.forEach((doc) => {
      areaNames.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(areaNames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Add a new area name
app.post("/area-names", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Area name is required" });
    }

    // Check for duplicates (case-insensitive)
    const areaNamesRef = db.collection("areaNames");
    const snapshot = await areaNamesRef.where("name", "==", name.trim()).get();

    if (!snapshot.empty) {
      return res.status(400).json({ error: "Area name already exists" });
    }

    const newAreaName = {
      name: name.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await areaNamesRef.add(newAreaName);

    res.status(201).json({ id: docRef.id, ...newAreaName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update an area name
app.put("/area-names/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Area name is required" });
    }

    const areaNameRef = db.collection("areaNames").doc(id);
    const doc = await areaNameRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Area name not found" });
    }

    // Check for duplicates (excluding current document)
    const areaNamesRef = db.collection("areaNames");
    const snapshot = await areaNamesRef.where("name", "==", name.trim()).get();

    if (!snapshot.empty && snapshot.docs[0].id !== id) {
      return res.status(400).json({ error: "Area name already exists" });
    }

    await areaNameRef.update({
      name: name.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await areaNameRef.get();
    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Delete an area name
app.delete("/area-names/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const areaNameRef = db.collection("areaNames").doc(id);
    const doc = await areaNameRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Area name not found" });
    }

    await areaNameRef.delete();

    res.status(200).json({ message: "Area name deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Initialize default area names
app.post("/area-names/initialize", async (req, res) => {
  try {
    const { areaNames: defaultAreas } = req.body;

    if (!Array.isArray(defaultAreas) || defaultAreas.length === 0) {
      return res.status(400).json({ error: "Area names array is required" });
    }

    const areaNamesRef = db.collection("areaNames");
    const batch = db.batch();
    let addedCount = 0;
    let skippedCount = 0;

    for (const areaName of defaultAreas) {
      // Check if area name already exists
      const snapshot = await areaNamesRef.where("name", "==", areaName.trim()).get();

      if (snapshot.empty) {
        const newAreaName = {
          name: areaName.trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = areaNamesRef.doc();
        batch.set(docRef, newAreaName);
        addedCount++;
      } else {
        skippedCount++;
      }
    }

    await batch.commit();

    res.status(200).json({
      message: "Area names initialized successfully",
      added: addedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Professions Management Routes
// GET all professions
app.get("/professions", async (req, res) => {
  try {
    const professionsRef = db.collection("professions");
    const snapshot = await professionsRef.get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const professions = [];
    snapshot.forEach((doc) => {
      professions.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(professions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single profession by ID
app.get("/professions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const professionRef = db.collection("professions").doc(id);
    const doc = await professionRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Profession not found" });
    }

    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Add a new profession
app.post("/professions", async (req, res) => {
  try {
    const { value, services, images, vehicleTypes, bsType } = req.body;

    console.log("[POST /professions] ========== FULL REQUEST BODY ==========");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("[POST /professions] vehicleTypes:", vehicleTypes);
    console.log("[POST /professions] bsType:", bsType);
    console.log("[POST /professions] ========================================");

    if (!value || !value.trim()) {
      return res.status(400).json({ error: "Profession value is required" });
    }

    // Check for duplicates
    const professionsRef = db.collection("professions");
    const snapshot = await professionsRef.where("value", "==", value.trim()).get();

    if (!snapshot.empty) {
      return res.status(400).json({ error: "Profession with this value already exists" });
    }

    // Build the profession object - CONSTRUCT WITH ALL FIELDS FROM START
    console.log("[POST /professions] ========== RECEIVED DATA ==========");
    console.log("value:", value);
    console.log("services:", services);
    console.log("images:", images);
    console.log("vehicleTypes:", JSON.stringify(vehicleTypes, null, 2));
    console.log("bsType:", JSON.stringify(bsType, null, 2));
    console.log("=====================================================");

    // Validate vehicleTypes if provided
    if (vehicleTypes) {
      if (!Array.isArray(vehicleTypes)) {
        return res.status(400).json({ error: "vehicleTypes must be an array" });
      }
      if (vehicleTypes.length > 0) {
        for (let i = 0; i < vehicleTypes.length; i++) {
          const vehicleType = vehicleTypes[i];
          if (!vehicleType || !vehicleType.type || !String(vehicleType.type).trim()) {
            return res.status(400).json({ error: `Vehicle type at index ${i} must have a 'type' field` });
          }
          if (!Array.isArray(vehicleType.services)) {
            return res.status(400).json({ error: `Vehicle type "${vehicleType.type}" must have a 'services' array` });
          }
        }
      }
    }

    // Build object - START WITH BASE FIELDS
    const newProfession = {
      value: value.trim(),
      services: Array.isArray(services) ? services : [],
      images: Array.isArray(images) ? images : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // EXPLICITLY ADD vehicleTypes if it exists
    if (vehicleTypes && Array.isArray(vehicleTypes) && vehicleTypes.length > 0) {
      newProfession.vehicleTypes = vehicleTypes;
      console.log("[POST /professions] ✅ ADDED vehicleTypes to newProfession");
    }

    // EXPLICITLY ADD bsType if it exists - MORE LENIENT CHECK
    console.log("[POST /professions] Checking bsType...");
    console.log("[POST /professions] bsType value:", JSON.stringify(bsType, null, 2));
    console.log("[POST /professions] bsType type:", typeof bsType);
    console.log("[POST /professions] bsType is object?", typeof bsType === 'object' && bsType !== null);
    console.log("[POST /professions] bsType.type exists?", !!bsType?.type);
    console.log("[POST /professions] bsType.options exists?", !!bsType?.options);
    console.log("[POST /professions] bsType.options is array?", Array.isArray(bsType?.options));
    console.log("[POST /professions] bsType.options length:", bsType?.options?.length);

    if (bsType && typeof bsType === 'object' && bsType !== null) {
      if (bsType.type && Array.isArray(bsType.options) && bsType.options.length > 0) {
        newProfession.bsType = bsType;
        console.log("[POST /professions] ✅✅✅ ADDED bsType to newProfession:", JSON.stringify(bsType, null, 2));
      } else {
        console.log("[POST /professions] ⚠ bsType provided but invalid structure - missing type or options");
        console.log("[POST /professions] bsType.type:", bsType.type);
        console.log("[POST /professions] bsType.options:", bsType.options);
      }
    } else {
      console.log("[POST /professions] ⚠ bsType is not a valid object or is null/undefined");
    }

    console.log("[POST /professions] ✅ Built newProfession with keys:", Object.keys(newProfession));
    console.log("[POST /professions] newProfession.vehicleTypes exists?", 'vehicleTypes' in newProfession);
    console.log("[POST /professions] newProfession.bsType exists?", 'bsType' in newProfession);

    // CRITICAL: Log EXACTLY what we're saving
    console.log("[POST /professions] ========== FINAL OBJECT TO SAVE ==========");
    console.log("Object keys:", Object.keys(newProfession));
    console.log("newProfession.vehicleTypes:", newProfession.vehicleTypes);
    console.log("newProfession.bsType:", newProfession.bsType);
    console.log("Type of vehicleTypes:", typeof newProfession.vehicleTypes);
    console.log("Type of bsType:", typeof newProfession.bsType);
    console.log("Is vehicleTypes array?", Array.isArray(newProfession.vehicleTypes));
    console.log("Full newProfession object:");
    const logObj = { ...newProfession };
    if (logObj.createdAt && logObj.createdAt._methodName) logObj.createdAt = '<TIMESTAMP>';
    if (logObj.updatedAt && logObj.updatedAt._methodName) logObj.updatedAt = '<TIMESTAMP>';
    console.log(JSON.stringify(logObj, null, 2));
    console.log("=============================================================");

    // VERIFY BEFORE SAVING
    if (vehicleTypes && vehicleTypes.length > 0) {
      if (!newProfession.vehicleTypes) {
        console.error("[POST /professions] ❌❌❌ CRITICAL ERROR: vehicleTypes NOT in newProfession!");
        return res.status(500).json({ error: "Internal error: vehicleTypes not assigned" });
      }
      console.log("[POST /professions] ✅ VERIFIED: vehicleTypes is in newProfession");
    }

    if (bsType && bsType.options && bsType.options.length > 0) {
      if (!newProfession.bsType) {
        console.error("[POST /professions] ❌❌❌ CRITICAL ERROR: bsType NOT in newProfession!");
        return res.status(500).json({ error: "Internal error: bsType not assigned" });
      }
      console.log("[POST /professions] ✅ VERIFIED: bsType is in newProfession");
    }

    console.log("[POST /professions] 🚀 SAVING TO FIRESTORE NOW...");
    const docRef = await professionsRef.add(newProfession);
    console.log("[POST /professions] ✅ SAVED! Document ID:", docRef.id);

    // Get the saved document IMMEDIATELY after saving
    const savedDoc = await docRef.get();
    const savedData = savedDoc.data();

    console.log("[POST /professions] ========== WHAT FIRESTORE ACTUALLY SAVED ==========");
    console.log("Document ID:", docRef.id);
    console.log("Saved data keys:", Object.keys(savedData || {}));
    console.log("Has vehicleTypes in saved data?", !!savedData?.vehicleTypes);
    console.log("Has bsType in saved data?", !!savedData?.bsType);
    console.log("vehicleTypes value:", savedData?.vehicleTypes);
    console.log("bsType value:", savedData?.bsType);
    console.log("Full saved data from Firestore:", JSON.stringify(savedData, null, 2));

    // CRITICAL CHECK: If we sent vehicleTypes but it's not in saved data, something is wrong
    if (vehicleTypes && vehicleTypes.length > 0 && !savedData?.vehicleTypes) {
      console.error("[POST /professions] ❌❌❌ FIRESTORE DID NOT SAVE vehicleTypes!");
      console.error("[POST /professions] We sent:", JSON.stringify(vehicleTypes, null, 2));
      console.error("[POST /professions] Firestore returned:", JSON.stringify(savedData, null, 2));
    }

    if (bsType && bsType.options && bsType.options.length > 0 && !savedData?.bsType) {
      console.error("[POST /professions] ❌❌❌ FIRESTORE DID NOT SAVE bsType!");
      console.error("[POST /professions] We sent:", JSON.stringify(bsType, null, 2));
      console.error("[POST /professions] Firestore returned:", JSON.stringify(savedData, null, 2));
    }

    console.log("=====================================================");

    res.status(201).json({ id: savedDoc.id, ...savedData });
  } catch (error) {
    console.error("[POST /professions] ✗ Error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update a profession
app.put("/professions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { value, services, images, vehicleTypes, bsType } = req.body;

    console.log("[PUT /professions/:id] ========== RECEIVED UPDATE DATA ==========");
    console.log("ID:", id);
    console.log("value:", value);
    console.log("services:", services);
    console.log("images:", images);
    console.log("vehicleTypes:", JSON.stringify(vehicleTypes, null, 2));
    console.log("bsType:", JSON.stringify(bsType, null, 2));
    console.log("===============================================================");

    if (!value || !value.trim()) {
      return res.status(400).json({ error: "Profession value is required" });
    }

    const professionRef = db.collection("professions").doc(id);
    const doc = await professionRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Profession not found" });
    }

    // Check for duplicates (excluding current document)
    const professionsRef = db.collection("professions");
    const snapshot = await professionsRef.where("value", "==", value.trim()).get();

    if (!snapshot.empty && snapshot.docs[0].id !== id) {
      return res.status(400).json({ error: "Profession with this value already exists" });
    }

    const updateData = {
      value: value.trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (services !== undefined) {
      updateData.services = services;
    }

    if (images !== undefined) {
      updateData.images = images;
    }

    // Handle vehicleTypes - EXPLICITLY ADD
    if (vehicleTypes !== undefined) {
      if (vehicleTypes === null || (Array.isArray(vehicleTypes) && vehicleTypes.length === 0)) {
        // Remove vehicleTypes field if explicitly set to null or empty array
        updateData.vehicleTypes = admin.firestore.FieldValue.delete();
        console.log("[PUT /professions/:id] Removing vehicleTypes field");
      } else if (Array.isArray(vehicleTypes) && vehicleTypes.length > 0) {
        // Validate vehicleTypes structure
        for (let i = 0; i < vehicleTypes.length; i++) {
          const vehicleType = vehicleTypes[i];
          if (!vehicleType || !vehicleType.type || !String(vehicleType.type).trim()) {
            return res.status(400).json({ error: `Vehicle type at index ${i} must have a 'type' field` });
          }
          if (!Array.isArray(vehicleType.services)) {
            return res.status(400).json({ error: `Vehicle type "${vehicleType.type}" must have a 'services' array` });
          }
        }
        updateData.vehicleTypes = vehicleTypes;
        console.log("[PUT /professions/:id] ✅ ADDING vehicleTypes to updateData");
        console.log("[PUT /professions/:id] vehicleTypes:", JSON.stringify(vehicleTypes, null, 2));
      }
    }

    // Handle bsType - EXPLICITLY ADD
    if (bsType !== undefined) {
      if (bsType === null) {
        // Remove bsType field if explicitly set to null
        updateData.bsType = admin.firestore.FieldValue.delete();
        console.log("[PUT /professions/:id] Removing bsType field");
      } else if (typeof bsType === 'object' && bsType.type && Array.isArray(bsType.options) && bsType.options.length > 0) {
        updateData.bsType = bsType;
        console.log("[PUT /professions/:id] ✅ ADDING bsType to updateData");
        console.log("[PUT /professions/:id] bsType:", JSON.stringify(bsType, null, 2));
      }
    }

    console.log("[PUT /professions/:id] ========== UPDATE DATA TO SAVE ==========");
    console.log("Keys:", Object.keys(updateData));
    console.log("Has vehicleTypes:", !!updateData.vehicleTypes);
    console.log("Has bsType:", !!updateData.bsType);
    const logUpdateData = { ...updateData };
    if (logUpdateData.updatedAt && logUpdateData.updatedAt._methodName) {
      logUpdateData.updatedAt = '<TIMESTAMP>';
    }
    if (logUpdateData.vehicleTypes && logUpdateData.vehicleTypes._methodName === 'delete') {
      logUpdateData.vehicleTypes = '<DELETE>';
    }
    if (logUpdateData.bsType && logUpdateData.bsType._methodName === 'delete') {
      logUpdateData.bsType = '<DELETE>';
    }
    console.log(JSON.stringify(logUpdateData, null, 2));
    console.log("=============================================================");

    console.log("[PUT /professions/:id] 🚀 UPDATING FIRESTORE...");
    await professionRef.update(updateData);
    console.log("[PUT /professions/:id] ✅ UPDATED!");

    const updatedDoc = await professionRef.get();
    const updatedData = updatedDoc.data();

    console.log("[PUT /professions/:id] ========== WHAT FIRESTORE ACTUALLY SAVED ==========");
    console.log("Document ID:", updatedDoc.id);
    console.log("Saved data keys:", Object.keys(updatedData || {}));
    console.log("Has vehicleTypes in saved data?", !!updatedData?.vehicleTypes);
    console.log("Has bsType in saved data?", !!updatedData?.bsType);
    console.log("vehicleTypes value:", updatedData?.vehicleTypes);
    console.log("bsType value:", updatedData?.bsType);
    console.log("Full saved data:", JSON.stringify(updatedData, null, 2));
    console.log("=============================================================");

    res.status(200).json({ id: updatedDoc.id, ...updatedData });
  } catch (error) {
    console.error("[PUT /professions/:id] ✗ Error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Delete a profession
app.delete("/professions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const professionRef = db.collection("professions").doc(id);
    const doc = await professionRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Profession not found" });
    }

    await professionRef.delete();

    res.status(200).json({ message: "Profession deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST - Initialize default professions
app.post("/professions/initialize", async (req, res) => {
  try {
    const { professions: defaultProfessions } = req.body;

    if (!Array.isArray(defaultProfessions) || defaultProfessions.length === 0) {
      return res.status(400).json({ error: "Professions array is required" });
    }

    const professionsRef = db.collection("professions");
    const batch = db.batch();
    let addedCount = 0;
    let skippedCount = 0;

    for (const professionData of defaultProfessions) {
      const { profession, services } = professionData;

      if (!profession || !profession.value) {
        continue;
      }

      // Check if profession already exists
      const snapshot = await professionsRef.where("value", "==", profession.value).get();

      if (snapshot.empty) {
        const newProfession = {
          value: profession.value,
          services: services || [],
          images: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = professionsRef.doc();
        batch.set(docRef, newProfession);
        addedCount++;
      } else {
        skippedCount++;
      }
    }

    await batch.commit();

    res.status(200).json({
      message: "Professions initialized successfully",
      added: addedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Referrals Management Routes
// GET all referrals
app.get("/referrals", async (req, res) => {
  try {
    const referralsRef = db.collection("referrals");
    const snapshot = await referralsRef.get();

    if (snapshot.empty) {
      return res.status(200).json([]);
    }

    const referrals = [];
    snapshot.forEach((doc) => {
      referrals.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(referrals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH - Approve a referral
app.patch("/referrals/:id/approve", async (req, res) => {
  try {
    const referralId = req.params.id;
    const referralRef = db.collection("referrals").doc(referralId);
    const doc = await referralRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Referral not found" });
    }

    await referralRef.update({
      status: 'approved',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await referralRef.get();
    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH - Decline a referral
app.patch("/referrals/:id/decline", async (req, res) => {
  try {
    const referralId = req.params.id;
    const referralRef = db.collection("referrals").doc(referralId);
    const doc = await referralRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Referral not found" });
    }

    await referralRef.update({
      status: 'declined',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await referralRef.get();
    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cashbacks Management Routes
// GET all cashbacks
app.get("/cashback", async (req, res) => {
  try {
    console.log("[GET /cashback] ========== START ==========");
    console.log("[GET /cashback] Firebase project_id:", ECOHOMELY_PROJECT_ID);
    console.log("[GET /cashback] Admin app name:", ECOHOMELY_APP_NAME);
    
    // Verify we're using the correct database by checking the service account
    const expectedProjectId = ECOHOMELY_PROJECT_ID;
    console.log("[GET /cashback] Expected project ID:", expectedProjectId);
    
    const cashbacksRef = db.collection("cashback");
    console.log("[GET /cashback] Querying cashback collection...");
    
    const snapshot = await cashbacksRef.get();
    console.log(`[GET /cashback] Query returned ${snapshot.size} document(s)`);

    if (snapshot.empty) {
      console.log("[GET /cashback] No cashbacks found, returning empty array");
      console.log("[GET /cashback] ========== END (empty) ==========");
      return res.status(200).json({ cashbacks: [] });
    }

    const cashbacks = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Convert Firestore Timestamp to JavaScript Date/ISO string for JSON serialization
      const cashbackData = {
        id: doc.id,
        amount: data.amount,
        authId: data.authId,
        mode: data.mode,
        monthKey: data.monthKey,
        paymentDetails: data.paymentDetails,
        paymentMethod: data.paymentMethod,
        status: data.status
      };
      
      // Handle createdAt timestamp
      if (data.createdAt) {
        if (data.createdAt.toDate) {
          // Firestore Timestamp
          cashbackData.createdAt = data.createdAt.toDate().toISOString();
        } else if (data.createdAt._seconds) {
          // Firestore Timestamp in serialized form
          cashbackData.createdAt = new Date(data.createdAt._seconds * 1000).toISOString();
        } else {
          cashbackData.createdAt = data.createdAt;
        }
      }
      
      // Handle any other timestamp fields
      if (data.updatedAt) {
        if (data.updatedAt.toDate) {
          cashbackData.updatedAt = data.updatedAt.toDate().toISOString();
        } else if (data.updatedAt._seconds) {
          cashbackData.updatedAt = new Date(data.updatedAt._seconds * 1000).toISOString();
        } else {
          cashbackData.updatedAt = data.updatedAt;
        }
      }
      
      cashbacks.push(cashbackData);
      console.log(`[GET /cashback] Found cashback: ${doc.id}, status: ${data.status}, amount: ${data.amount}, authId: ${data.authId}`);
    });

    console.log(`[GET /cashback] Successfully returning ${cashbacks.length} cashback(s)`);
    console.log("[GET /cashback] Sample cashback data:", JSON.stringify(cashbacks[0] || {}));
    console.log("[GET /cashback] ========== END (success) ==========");
    res.status(200).json({ cashbacks });
  } catch (error) {
    console.error("[GET /cashback] ========== ERROR ==========");
    console.error("[GET /cashback] Error fetching cashbacks:", error);
    console.error("[GET /cashback] Error message:", error.message);
    console.error("[GET /cashback] Error code:", error.code);
    console.error("[GET /cashback] Error stack:", error.stack);
    console.error("[GET /cashback] ========== END (error) ==========");
    res.status(500).json({ error: error.message });
  }
});

// PUT - Update cashback status
app.put("/cashback/:id/status", async (req, res) => {
  try {
    const cashbackId = req.params.id;
    const { status, approvalTimestamp, referrerAuthId } = req.body;

    console.log(`[PUT /cashback/:id/status] Updating cashback ${cashbackId} to status: ${status}`);

    if (!status || !["requested", "paid", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'requested', 'paid', or 'rejected'" });
    }

    const cashbackRef = db.collection("cashback").doc(cashbackId);
    const doc = await cashbackRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Cashback not found" });
    }

    const updateData = {
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (approvalTimestamp) {
      updateData.approvalTimestamp = admin.firestore.Timestamp.fromDate(new Date(approvalTimestamp));
    }

    await cashbackRef.update(updateData);
    const updatedDoc = await cashbackRef.get();

    console.log(`[PUT /cashback/:id/status] Successfully updated cashback ${cashbackId}`);
    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("[PUT /cashback/:id/status] Error updating cashback:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route to update a user by ID
app.put("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const userData = req.body;

    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    // Handle image field - ensure it's always a valid string URL
    const updateData = { ...userData };
    if (updateData.image !== undefined) {
      const DEFAULT_IMAGE = "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
      
      if (updateData.image === null || updateData.image === '' || 
          (typeof updateData.image === 'object' && updateData.image !== null)) {
        // If null, empty, or object, use default image
        updateData.image = DEFAULT_IMAGE;
      }
      // Ensure it's always a string type
      if (typeof updateData.image !== 'string') {
        updateData.image = String(updateData.image);
      }
      // Validate it's a valid URL string
      if (!updateData.image || updateData.image.trim() === '') {
        updateData.image = DEFAULT_IMAGE;
      }
    }

    await userRef.update(updateData);
    const updatedDoc = await userRef.get();

    res.status(200).json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Sync a chat session to Google Sheet (called by frontend after saving to Firestore)
app.post("/chat-history/sync-to-sheet", async (req, res) => {
  try {
    const { sessionId, ...data } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    await appendChatHistoryToSheet(sessionId, data);
    res.status(200).json({ ok: true, message: "Synced to sheet" });
  } catch (error) {
    console.warn("[chat-history/sync-to-sheet]", error.message);
    res.status(500).json({ error: error.message });
  }
});

// JSON 404 to avoid HTML error pages
app.use((req, res) => {
  console.log("[404]", req.method, req.path);
  res.status(404).json({ message: "Not found", method: req.method, path: req.path });
});


// Function to send notification when serviceman account is approved
exports.onServicemanApproved = functions.firestore
  .document('servicemen/{servicemanId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const servicemanId = context.params.servicemanId;

      // Initialize Expo SDK
      const expo = new Expo();

      // Check if approval status changed from false/undefined to true
      if (!before.Approved && after.Approved === true) {
        console.log(`Serviceman ${servicemanId} account approved, sending notification...`);

        // Get serviceman details
        const servicemanData = after;
        const servicemanName = servicemanData.name || servicemanData.fullName || 'Service Provider';

        // Store notification in Firestore
        await db.collection('notifications').add({
          servicemanId: servicemanId,
          type: 'account_approval',
          title: 'Account Approved!',
          message: 'Congratulations! Your Ecohomely service provider account has been approved. You can now start accepting bookings.',
          servicemanName: servicemanName,
          status: 'approved',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          priority: 'high'
        });

        // Send Expo push notification
        const expoPushToken = servicemanData.expoPushToken;
        if (expoPushToken && Expo.isExpoPushToken(expoPushToken)) {
          try {
            const messages = [{
              to: expoPushToken,
              sound: 'default',
              title: '🎉 Account Approved!',
              body: `Hi ${servicemanName}! Your Ecohomely account has been approved. Start accepting bookings now!`, // Updated capitalization
              data: {
                type: 'account_approval',
                servicemanId: servicemanId,
                status: 'approved'
              },
              priority: 'high',
              channelId: 'default'
            }];

            const chunks = expo.chunkPushNotifications(messages);
            const tickets = [];

            for (const chunk of chunks) {
              try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
              } catch (error) {
                console.error('Error sending push notification chunk:', error);
              }
            }

            console.log(`Expo push notification sent to serviceman ${servicemanId}:`, tickets);
          } catch (error) {
            console.error('Error sending Expo push notification:', error);
          }
        } else {
          console.log(`No valid Expo push token found for serviceman ${servicemanId}`);
        }

        console.log(`Notification sent to serviceman ${servicemanId}: Account approved`);
        return { success: true, message: 'Approval notification sent' };
      }

      // Check if approval status changed from true to false (rejection)
      if (before.Approved === true && after.Approved === false) {
        console.log(`Serviceman ${servicemanId} account rejected, sending notification...`);

        const servicemanName = after.name || after.fullName || 'Service Provider';

        // Store rejection notification in Firestore
        await db.collection('notifications').add({
          servicemanId: servicemanId,
          type: 'account_rejection',
          title: 'Account Application Rejected',
          message: 'Your Ecohomely service provider account application has been rejected. Please contact support for more information.',
          servicemanName: servicemanName,
          status: 'rejected',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
          priority: 'high'
        });

        // Send Expo push notification for rejection
        const expoPushToken = after.expoPushToken;
        if (expoPushToken && Expo.isExpoPushToken(expoPushToken)) {
          try {
            const messages = [{
              to: expoPushToken,
              sound: 'default',
              title: '❌ Account Application Rejected',
              body: `Hi ${servicemanName}, your account application was rejected. Contact support for details.`,
              data: {
                type: 'account_rejection',
                servicemanId: servicemanId,
                status: 'rejected'
              },
              priority: 'high',
              channelId: 'default'
            }];

            const chunks = expo.chunkPushNotifications(messages);
            const tickets = [];

            for (const chunk of chunks) {
              try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
              } catch (error) {
                console.error('Error sending push notification chunk:', error);
              }
            }

            console.log(`Expo push notification sent to serviceman ${servicemanId}:`, tickets);
          } catch (error) {
            console.error('Error sending Expo push notification:', error);
          }
        } else {
          console.log(`No valid Expo push token found for serviceman ${servicemanId}`);
        }

        console.log(`Notification sent to serviceman ${servicemanId}: Account rejected`);
        return { success: true, message: 'Rejection notification sent' };
      }

    } catch (error) {
      console.error('Error in onServicemanApproved trigger:', error);
      return { error: error.message };
    }
  });

// Function to register Expo push token for servicemen
exports.registerExpoPushToken = functions.https.onCall(async (data, context) => {
  try {
    const { servicemanId, expoPushToken } = data;

    if (!servicemanId || !expoPushToken) {
      throw new functions.https.HttpsError('invalid-argument', 'Serviceman ID and Expo push token are required');
    }

    // Validate the Expo push token format
    if (!Expo.isExpoPushToken(expoPushToken)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid Expo push token format');
    }

    // Update the servicemen document with the push token
    const servicemanRef = db.collection('servicemen').doc(servicemanId);
    const doc = await servicemanRef.get();

    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Serviceman not found');
    }

    await servicemanRef.update({
      expoPushToken: expoPushToken,
      pushTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Expo push token registered for serviceman ${servicemanId}`);

    return {
      success: true,
      message: 'Expo push token registered successfully',
      servicemanId: servicemanId
    };

  } catch (error) {
    console.error('Error registering Expo push token:', error);
    throw error;
  }
});

// Export the Express app as a Cloud Function
exports.app = functions.https.onRequest(app);

// Sync chat history to Google Sheet when a document is created or updated in chats_history
exports.onChatHistoryWritten = functions.firestore
  .document("chats_history/{sessionId}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const sessionId = context.params.sessionId;
    const data = change.after.data();
    await appendChatHistoryToSheet(sessionId, data);
  });

// -----------------------------------------------------------------------------
// Dashboard-only functions migrated into the same source for one safe deploy.
// -----------------------------------------------------------------------------
const {onRequest: dashboardOnRequest} = require("firebase-functions/v2/https");
const {onDocumentWritten: dashboardOnDocumentWritten} = require("firebase-functions/v2/firestore");

const DASHBOARD_REGION = "asia-south1";
const DASHBOARD_FIRESTORE_PAGE_SIZE = 500;
const DASHBOARD_STORAGE_PAGE_SIZE = 1000;
const DASHBOARD_DEFAULT_MAX_DELETE = 100;
const DASHBOARD_PROPERTY_LISTING_COLLECTIONS = [
  {collection: "propertyListings", exportName: "sendPropertyCorrectionNotification_propertyListings"},
  {collection: "propertyListing", exportName: "sendPropertyCorrectionNotification_propertyListing"},
  {collection: "toletListings", exportName: "sendPropertyCorrectionNotification_toletListingsV2"},
];
const DASHBOARD_STORAGE_URL_PATTERNS = [
  /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?'"\s]+)/gi,
  /https:\/\/storage\.googleapis\.com\/[^/]+\/([^?'"\s]+)/gi,
  /gs:\/\/[^/]+\/([^'"\s]+)/gi,
];
const DASHBOARD_FILE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|pptx?|txt|csv|mp4|mov|avi|mkv|webm|heic|zip)$/i;

function dashboardFirstValue(...values) {
  return values.find((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });
}

function dashboardMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dashboardIsCorrectionActive(listing) {
  return listing.correctionRequired === true ||
    listing.requiresCorrection === true ||
    listing.needsCorrection === true ||
    listing.correctionRequested === true ||
    String(listing.approvalStatus || listing.status || "")
        .toLowerCase()
        .includes("correction");
}

function dashboardCorrectionRequestFromListing(listing, listingId) {
  const existing = dashboardFirstValue(
      listing.listingCorrectionRequest,
      listing.propertyListingCorrectionRequest,
      listing.toLetCorrectionRequest,
      listing.partnerAppPopup,
      listing.userAppPopup,
      listing.propertyAppPopup,
  ) || {};
  const fields = dashboardFirstValue(
      existing.fields,
      listing.correctionFields,
      listing.correctionItems,
      [],
  );
  const message = dashboardFirstValue(
      existing.message,
      listing.reviewNote,
      "Correction requested for: " + (Array.isArray(fields) ? fields.join(", ") : fields),
  );

  return {
    ...existing,
    type: "listing_correction",
    title: existing.title || "Listing update required",
    message,
    fields: Array.isArray(fields) ? fields : [],
    fieldValues: existing.fieldValues || listing.correctionFieldValues || {},
    media: existing.media || listing.correctionMedia || [],
    listingId,
    requestedAt: dashboardFirstValue(existing.requestedAt, listing.correctionRequestedAt,
        admin.firestore.FieldValue.serverTimestamp()),
    read: false,
  };
}

async function dashboardGetUserNotificationTargets(userId) {
  if (!userId) return {user: null, expoId: ""};

  const refs = [
    db.collection("users").doc(userId),
    db.collection("customers").doc(userId),
  ];
  const snapshots = await Promise.all(refs.map((ref) => ref.get().catch(() => null)));
  const user = snapshots.find((snapshot) => snapshot && snapshot.exists)?.data() || null;
  const expoId = dashboardFirstValue(
      user?.expoId,
      user?.expoPushToken,
      user?.pushToken,
      user?.notificationToken,
      user?.deviceToken,
      "",
  );

  return {user, expoId};
}

async function dashboardSendExpoPush(expoId, payload) {
  if (!expoId || !Expo.isExpoPushToken(expoId)) return false;

  const expo = new Expo();
  const messages = [{
    to: expoId,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: "high",
    channelId: "default",
  }];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    return true;
  } catch (error) {
    console.error("Dashboard property correction push failed", error);
    return false;
  }
}

async function dashboardPushPropertyCorrectionNotification({listingId, listing}) {
  const userId = dashboardFirstValue(
      listing.userId,
      listing.uid,
      listing.ownerId,
      listing.ownerCustomerId,
      listing.form?.userId,
  );
  if (!userId) return;

  const correctionRequest = dashboardCorrectionRequestFromListing(listing, listingId);
  const {expoId} = await dashboardGetUserNotificationTargets(userId);
  const notification = {
    userId,
    recipientId: userId,
    targetId: userId,
    ownerCustomerId: userId,
    expoId,
    title: "Listing corrections requested",
    body: correctionRequest.message ||
      "Listing corrections are being asked from admin end",
    message: correctionRequest.message ||
      "Listing corrections are being asked from admin end",
    type: "listing_correction",
    notificationType: "listing_correction",
    listingId,
    correctionFields: correctionRequest.fields || [],
    correctionRequest,
    channel: "push",
    read: false,
    sent: expoId ? 1 : 0,
    delivered: 0,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const popupUpdate = {
    latestToLetNotification: notification,
    partnerAppPopup: correctionRequest,
    userAppPopup: correctionRequest,
    propertyAppPopup: correctionRequest,
    toLetListingPopup: correctionRequest,
    listingCorrectionRequest: correctionRequest,
    propertyListingCorrectionRequest: correctionRequest,
    toLetCorrectionRequest: correctionRequest,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all([
    db.collection("notifications").add(notification),
    db.collection("users").doc(userId)
        .collection("notifications").add(notification).catch(() => null),
    db.collection("customers").doc(userId)
        .collection("notifications").add(notification).catch(() => null),
    db.collection("users").doc(userId)
        .set(popupUpdate, {merge: true}).catch(() => null),
    db.collection("customers").doc(userId)
        .set(popupUpdate, {merge: true}).catch(() => null),
    dashboardSendExpoPush(expoId, {
      title: notification.title,
      body: notification.body,
      data: {
        type: "listing_correction",
        listingId,
        correctionFields: correctionRequest.fields || [],
      },
    }),
  ]);
}

function dashboardNormalizeStoragePath(value) {
  if (!value || typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";

  for (const pattern of DASHBOARD_STORAGE_URL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).replace(/^\/+/, "");
    }
  }

  if (text.startsWith("http://") || text.startsWith("https://")) return "";
  if (text.startsWith("data:")) return "";
  if (text.includes("://")) return "";
  if (!DASHBOARD_FILE_EXTENSION_PATTERN.test(text)) return "";

  return decodeURIComponent(text).replace(/^\/+/, "");
}

function dashboardCollectStorageReferences(value, references) {
  if (value === null || value === undefined) return;

  if (typeof value === "string") {
    for (const pattern of DASHBOARD_STORAGE_URL_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(value);
      while (match && match[1]) {
        references.add(decodeURIComponent(match[1]).replace(/^\/+/, ""));
        match = pattern.exec(value);
      }
    }

    const directPath = dashboardNormalizeStoragePath(value);
    if (directPath) references.add(directPath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => dashboardCollectStorageReferences(item, references));
    return;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => dashboardCollectStorageReferences(item, references));
  }
}

async function dashboardAssertAdminRequest(req) {
  const configuredSecret = process.env.STORAGE_CLEANUP_SECRET || "";
  const headerSecret = req.get("x-cleanup-secret");
  if (configuredSecret && headerSecret && headerSecret === configuredSecret) return;

  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const error = new Error("Unauthorized. Provide admin auth token or x-cleanup-secret.");
    error.status = 401;
    throw error;
  }

  const decoded = await admin.auth(adminApp).verifyIdToken(token);
  const isAdmin = decoded.admin === true || decoded.superAdmin === true || decoded.role === "super_admin";
  if (!isAdmin) {
    const error = new Error("Forbidden. Admin access required.");
    error.status = 403;
    throw error;
  }
}

async function dashboardScanCollection(collectionRef, references, stats) {
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    let query = collectionRef
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(DASHBOARD_FIRESTORE_PAGE_SIZE);

    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    for (const docSnapshot of snapshot.docs) {
      stats.firestoreDocuments += 1;
      dashboardCollectStorageReferences(docSnapshot.data(), references);

      const subcollections = await docSnapshot.ref.listCollections();
      for (const subcollection of subcollections) {
        await dashboardScanCollection(subcollection, references, stats);
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < DASHBOARD_FIRESTORE_PAGE_SIZE) hasMore = false;
  }
}

async function dashboardCollectFirestoreStorageReferences() {
  const references = new Set();
  const stats = {firestoreCollections: 0, firestoreDocuments: 0};
  const rootCollections = await db.listCollections();

  for (const collectionRef of rootCollections) {
    stats.firestoreCollections += 1;
    await dashboardScanCollection(collectionRef, references, stats);
  }

  return {references, stats};
}

async function dashboardListStorageFiles({prefix}) {
  const bucket = admin.storage(adminApp).bucket();
  const files = [];
  let pageToken;

  do {
    const [pageFiles, nextQuery] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: DASHBOARD_STORAGE_PAGE_SIZE,
      pageToken,
      prefix: prefix || undefined,
    });

    files.push(...pageFiles);
    pageToken = nextQuery && nextQuery.pageToken;
  } while (pageToken);

  return files;
}

exports.cleanupUnusedStorageFiles = dashboardOnRequest({
  region: DASHBOARD_REGION,
  timeoutSeconds: 3600,
  memory: "1GiB",
  cors: true,
}, async (req, res) => {
  const startedAt = Date.now();

  try {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }

    await dashboardAssertAdminRequest(req);

    const body = req.body || {};
    const dryRun = body.dryRun !== false;
    const maxDelete = Number.isFinite(Number(body.maxDelete)) ?
      Math.max(0, Number(body.maxDelete)) :
      DASHBOARD_DEFAULT_MAX_DELETE;
    const prefix = typeof body.prefix === "string" ? body.prefix.trim() : "";

    const {references, stats} = await dashboardCollectFirestoreStorageReferences();
    const files = await dashboardListStorageFiles({prefix});
    const unusedFiles = files.filter((file) => !references.has(file.name));
    const selectedFiles = dryRun ? unusedFiles : unusedFiles.slice(0, maxDelete);
    const deleted = [];
    const failed = [];

    if (!dryRun) {
      for (const file of selectedFiles) {
        try {
          await file.delete({ignoreNotFound: true});
          deleted.push(file.name);
        } catch (error) {
          failed.push({path: file.name, error: error.message});
        }
      }
    }

    return res.status(200).json({
      dryRun,
      prefix,
      firestoreDocumentsScanned: stats.firestoreDocuments,
      rootCollectionsScanned: stats.firestoreCollections,
      referencedStoragePaths: references.size,
      storageFilesScanned: files.length,
      unusedFilesFound: unusedFiles.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
      maxDeleteApplied: dryRun ? 0 : maxDelete,
      sampleUnusedFiles: unusedFiles.slice(0, 50).map((file) => file.name),
      deleted,
      failed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("cleanupUnusedStorageFiles failed", error);
    return res.status(error.status || 500).json({
      error: error.message || "Storage cleanup failed.",
      durationMs: Date.now() - startedAt,
    });
  }
});

DASHBOARD_PROPERTY_LISTING_COLLECTIONS.forEach(({collection, exportName}) => {
  exports[exportName] = dashboardOnDocumentWritten({
    region: DASHBOARD_REGION,
    document: collection + "/{listingId}",
  }, async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || !dashboardIsCorrectionActive(after)) return;

    const beforeRequestedAt = dashboardMillis(before?.correctionRequestedAt) ||
      dashboardMillis(before?.listingCorrectionRequest?.requestedAt) ||
      dashboardMillis(before?.propertyListingCorrectionRequest?.requestedAt) ||
      dashboardMillis(before?.toLetCorrectionRequest?.requestedAt);
    const afterRequestedAt = dashboardMillis(after.correctionRequestedAt) ||
      dashboardMillis(after.listingCorrectionRequest?.requestedAt) ||
      dashboardMillis(after.propertyListingCorrectionRequest?.requestedAt) ||
      dashboardMillis(after.toLetCorrectionRequest?.requestedAt);
    const becameCorrection = !before || !dashboardIsCorrectionActive(before);
    const requestChanged = afterRequestedAt && afterRequestedAt !== beforeRequestedAt;

    if (!becameCorrection && !requestChanged) return;

    await dashboardPushPropertyCorrectionNotification({
      listingId: event.params.listingId,
      listing: after,
    });
  });
});
