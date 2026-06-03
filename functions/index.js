"use strict";

const admin = require("firebase-admin");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");

admin.initializeApp();

const CLEANUP_SECRET = defineSecret("STORAGE_CLEANUP_SECRET");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const ADMIN_CREDENTIAL_FROM_EMAIL = defineSecret("ADMIN_CREDENTIAL_FROM_EMAIL");
const REGION = "asia-south1";
const FIRESTORE_PAGE_SIZE = 500;
const STORAGE_PAGE_SIZE = 1000;
const DEFAULT_MAX_DELETE = 100;

const STORAGE_URL_PATTERNS = [
  /https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?'"`\s]+)/gi,
  /https:\/\/storage\.googleapis\.com\/[^/]+\/([^?'"`\s]+)/gi,
  /gs:\/\/[^/]+\/([^'"`\s]+)/gi,
];

const FILE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|pptx?|txt|csv|mp4|mov|avi|mkv|webm|heic|zip)$/i;

function hasMailContent(data) {
  return Boolean(data && Array.isArray(data.to) && data.to.length && data.message && data.message.subject);
}

async function sendMailWithResend(data) {
  const apiKey = RESEND_API_KEY.value();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const from = ADMIN_CREDENTIAL_FROM_EMAIL.value() || "Ecohomely Admin <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: data.to,
      subject: data.message.subject,
      text: data.message.text || "",
      html: data.message.html || "",
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || `Resend failed with ${response.status}.`);
  }

  return result;
}

exports.sendQueuedMail = onDocumentCreated({
  region: REGION,
  secrets: [RESEND_API_KEY, ADMIN_CREDENTIAL_FROM_EMAIL],
  document: "mail/{mailId}",
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  if (!hasMailContent(data)) {
    await snapshot.ref.set({
      delivery: {
        status: "failed",
        error: "Invalid mail document payload.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, {merge: true});
    return;
  }

  try {
    await snapshot.ref.set({
      delivery: {
        status: "sending",
        provider: "resend",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, {merge: true});

    const result = await sendMailWithResend(data);

    await snapshot.ref.set({
      delivery: {
        status: "sent",
        provider: "resend",
        providerId: result.id || "",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, {merge: true});
  } catch (error) {
    console.error("sendQueuedMail failed", error);
    await snapshot.ref.set({
      delivery: {
        status: "failed",
        provider: "resend",
        error: error.message || "Unable to send email.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    }, {merge: true});
  }
});

function normalizeStoragePath(value) {
  if (!value || typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";

  for (const pattern of STORAGE_URL_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).replace(/^\/+/, "");
    }
  }

  if (text.startsWith("http://") || text.startsWith("https://")) return "";
  if (text.startsWith("data:")) return "";
  if (text.includes("://")) return "";
  if (!FILE_EXTENSION_PATTERN.test(text)) return "";

  return decodeURIComponent(text).replace(/^\/+/, "");
}

function collectStorageReferences(value, references) {
  if (value === null || value === undefined) return;

  if (typeof value === "string") {
    for (const pattern of STORAGE_URL_PATTERNS) {
      pattern.lastIndex = 0;
      let match = pattern.exec(value);
      while (match && match[1]) {
        references.add(decodeURIComponent(match[1]).replace(/^\/+/, ""));
        match = pattern.exec(value);
      }
    }

    const directPath = normalizeStoragePath(value);
    if (directPath) references.add(directPath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStorageReferences(item, references));
    return;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectStorageReferences(item, references));
  }
}

async function assertAdminRequest(req) {
  const configuredSecret = CLEANUP_SECRET.value();
  const headerSecret = req.get("x-cleanup-secret");
  if (configuredSecret && headerSecret && headerSecret === configuredSecret) return;

  const authHeader = req.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const error = new Error("Unauthorized. Provide admin auth token or x-cleanup-secret.");
    error.status = 401;
    throw error;
  }

  const decoded = await admin.auth().verifyIdToken(token);
  const isAdmin = decoded.admin === true || decoded.superAdmin === true || decoded.role === "super_admin";
  if (!isAdmin) {
    const error = new Error("Forbidden. Admin access required.");
    error.status = 403;
    throw error;
  }
}

async function scanCollection(collectionRef, references, stats) {
  let lastDoc = null;

  while (true) {
    let query = collectionRef
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(FIRESTORE_PAGE_SIZE);

    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const docSnapshot of snapshot.docs) {
      stats.firestoreDocuments += 1;
      collectStorageReferences(docSnapshot.data(), references);

      const subcollections = await docSnapshot.ref.listCollections();
      for (const subcollection of subcollections) {
        await scanCollection(subcollection, references, stats);
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < FIRESTORE_PAGE_SIZE) break;
  }
}

async function collectFirestoreStorageReferences() {
  const references = new Set();
  const stats = {firestoreCollections: 0, firestoreDocuments: 0};
  const rootCollections = await admin.firestore().listCollections();

  for (const collectionRef of rootCollections) {
    stats.firestoreCollections += 1;
    await scanCollection(collectionRef, references, stats);
  }

  return {references, stats};
}

async function listStorageFiles({prefix}) {
  const bucket = admin.storage().bucket();
  const files = [];
  let pageToken;

  do {
    const [pageFiles, nextQuery] = await bucket.getFiles({
      autoPaginate: false,
      maxResults: STORAGE_PAGE_SIZE,
      pageToken,
      prefix: prefix || undefined,
    });

    files.push(...pageFiles);
    pageToken = nextQuery && nextQuery.pageToken;
  } while (pageToken);

  return files;
}

exports.cleanupUnusedStorageFiles = onRequest({
  region: REGION,
  timeoutSeconds: 3600,
  memory: "1GiB",
  secrets: [CLEANUP_SECRET],
  cors: true,
}, async (req, res) => {
  const startedAt = Date.now();

  try {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }

    await assertAdminRequest(req);

    const body = req.body || {};
    const dryRun = body.dryRun !== false;
    const maxDelete = Number.isFinite(Number(body.maxDelete)) ?
      Math.max(0, Number(body.maxDelete)) :
      DEFAULT_MAX_DELETE;
    const prefix = typeof body.prefix === "string" ? body.prefix.trim() : "";

    const {references, stats} = await collectFirestoreStorageReferences();
    const files = await listStorageFiles({prefix});
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
