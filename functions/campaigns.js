/* global require, module, process */
/**
 * Campaign delivery.
 *
 * Two trigger models, one delivery path:
 *   - offers / announcements / festival wishes — an admin triggers them from the dashboard,
 *     immediately or at a scheduled time. They are broadcast, and live in `campaigns`.
 *   - birthday wishes — the daily job triggers them. They are personal, and live in
 *     `users/{uid}/campaigns`, because every device reads the shared collection and one
 *     birthday doc placed there would pop up on all of them.
 *
 * Platform split is deliberate, not a fallback: FCM for Android, Expo for iOS. Firebase has
 * no APNs key for com.ecohomely.user, so every FCM send to an iPhone fails at the APNs
 * handoff. Expo keeps its own APNs credentials and is the only path that reaches iOS today.
 * If an APNs key is ever uploaded, flip PREFER_EXPO_ON_IOS to false.
 */
const { Expo } = require("expo-server-sdk");

const CAMPAIGNS = "campaigns";
const TEMPLATES = "campaignTemplates";
const EVENTS = "campaignEvents";
const PROMOTIONS_CHANNEL = "promotions";

const FCM_BATCH = 500; // sendEachForMulticast hard limit
const USER_QUERY_LIMIT = 5000;
const PREFER_EXPO_ON_IOS = true;

const BIRTHDAY_DEFAULTS = {
  title: "Happy Birthday, {{name}}! 🎂",
  body: "Wishing you a wonderful day from everyone at Ecohomely.",
  imageUrl: "",
  action: { label: "See offers", screen: "Offers" },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function millisOf(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function renderTemplate(text, vars) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
    vars[key] === undefined || vars[key] === null ? "" : String(vars[key]),
  );
}

/** `MM-DD` in the given IANA zone — must match utils/pushCampaigns.js birthdayKeyFrom. */
function monthDayInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("month")}-${get("day")}`;
}

function yearInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(date);
}

/**
 * Birthday keys to match today.
 *
 * 29 February exists one year in four. Without this, anyone born on a leap day is wished
 * in 2028 and then not again until 2032, so 28 February stands in for them otherwise.
 */
function birthdayKeysForToday(date, timeZone) {
  const key = monthDayInZone(date, timeZone);
  if (key !== "02-28") return [key];
  const year = Number(yearInZone(date, timeZone));
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeapYear ? [key] : [key, "02-29"];
}

/**
 * Does this person still accept a push in this category?
 *
 * Mirrors utils/notificationPreferences.js. `promotions` is the only opt-out-able
 * category; wishes and operational news are not, so they always pass unless the master
 * switch is off. A user with no `notificationPrefs` has never opted out of anything.
 */
function pushAllowed(userData, category) {
  const prefs = userData && userData.notificationPrefs;
  if (!prefs) return true;
  if (prefs.allEnabled === false) return false;
  if (category !== "promotions") return true;
  const promotions = prefs.categories && prefs.categories.promotions;
  return !promotions || promotions.push !== false;
}

function recipientFrom(id, data, source = "users") {
  const platform = String(data.device || data.deviceType || "").toLowerCase();
  return {
    uid: id,
    name: data.name || data.fullName || "",
    platform: platform === "ios" ? "ios" : platform === "android" ? "android" : "",
    fcmToken: data.fcmToken || null,
    expoPushToken: data.expoPushToken || null,
    // Which collection this came from. Only `users` are customers, and only they get an
    // in-app copy — the customer app does not read `servicemen`.
    source,
    data,
  };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// audience
// ---------------------------------------------------------------------------

function matchesArea(record, area) {
  if (!area) return true;
  const needle = String(area).trim().toLowerCase();
  return [
    record.area, record.areaName, record.primaryArea, record.serviceArea,
    record.city, record.cityName, record.address,
    record.location && record.location.area,
    record.location && record.location.city,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function isPaidWorker(worker) {
  const membership = String(
    worker.membership || worker.plan || worker.subscriptionPlan || "",
  ).toLowerCase();
  return Boolean(
    worker.havePaid || worker.isPaid ||
    (worker.payment && worker.payment.paid) ||
    (worker.subscription && worker.subscription.active) ||
    ["gold", "silver", "bronze", "paid", "premium"].includes(membership),
  );
}

function isExpiringSoon(worker) {
  const expiry = millisOf(
    worker.expiryDate || worker.planExpiry ||
    (worker.subscription && worker.subscription.expiryDate) || worker.subscriptionEndsAt,
  );
  if (!expiry) return false;
  const days = (expiry - Date.now()) / 86400000;
  return days >= 0 && days <= 7;
}

function isVerifiedWorker(worker) {
  const status = String(
    worker.verification || worker.approvalStatus || worker.status || "",
  ).toLowerCase();
  return worker.verified === true || worker.isVerified === true ||
    worker.approved === true || ["verified", "approved", "active"].includes(status);
}

/**
 * Resolves a dashboard audience id to recipients.
 *
 * The same predicates the Notifications screen uses for its counts, moved server-side —
 * the browser currently downloads every user and worker just to show the tile numbers.
 */
async function resolveAudience(db, audience, area, explicitUids) {
  if (Array.isArray(explicitUids) && explicitUids.length) {
    const docs = await Promise.all(
      explicitUids.slice(0, 500).map((uid) => db.collection("users").doc(String(uid)).get()),
    );
    return docs.filter((d) => d.exists).map((d) => recipientFrom(d.id, d.data() || {}));
  }

  const id = String(audience || "all_users").toLowerCase();
  const needsCustomers = ["all_users", "all_customers", "by_area"].includes(id);
  const needsWorkers = id !== "all_customers";

  const [customerSnap, workerSnap] = await Promise.all([
    needsCustomers ? db.collection("users").limit(USER_QUERY_LIMIT).get() : null,
    needsWorkers ? db.collection("servicemen").limit(USER_QUERY_LIMIT).get() : null,
  ]);

  const customers = customerSnap
    ? customerSnap.docs.map((d) => recipientFrom(d.id, d.data() || {}, "users"))
    : [];
  const workers = workerSnap
    ? workerSnap.docs.map((d) => recipientFrom(d.id, d.data() || {}, "servicemen"))
    : [];

  switch (id) {
    case "all_customers":
      return customers;
    case "all_servicemen":
      return workers;
    case "paid_subscribers":
      return workers.filter((w) => isPaidWorker(w.data));
    case "unpaid_workers":
      return workers.filter((w) => !isPaidWorker(w.data));
    case "expiring_soon":
      return workers.filter((w) => isExpiringSoon(w.data));
    case "unverified_workers":
      return workers.filter((w) => !isVerifiedWorker(w.data));
    case "by_area":
      return [...customers, ...workers].filter((r) => matchesArea(r.data, area));
    default:
      return [...customers, ...workers];
  }
}

// ---------------------------------------------------------------------------
// delivery
// ---------------------------------------------------------------------------

/** FCM data values must all be strings. */
function buildDataPayload(campaignId, campaign) {
  const action = campaign.action || {};
  const data = {
    type: "campaign",
    campaignId: String(campaignId),
    category: String(campaign.category || "announcement"),
  };
  if (action.screen) data.screen = String(action.screen);
  if (action.params) data.params = JSON.stringify(action.params);
  return data;
}

async function sendViaFcm(messaging, recipients, campaign, campaignId) {
  const result = { sent: 0, failed: 0, invalid: [] };
  const tokens = recipients.map((r) => r.fcmToken).filter(Boolean);
  if (!tokens.length) return result;

  const data = buildDataPayload(campaignId, campaign);

  for (const batch of chunk(tokens, FCM_BATCH)) {
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: campaign.title, body: campaign.body },
        data,
        android: {
          priority: "high",
          notification: {
            channelId: PROMOTIONS_CHANNEL,
            sound: "default",
            ...(campaign.imageUrl ? { imageUrl: campaign.imageUrl } : {}),
          },
        },
      });

      response.responses.forEach((res, i) => {
        if (res.success) {
          result.sent += 1;
          return;
        }
        result.failed += 1;
        const code = res.error && res.error.code;
        // Only these two mean the token is dead; everything else may succeed on retry.
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          result.invalid.push(batch[i]);
        }
      });
    } catch (error) {
      console.error("campaigns: FCM batch failed", error.message);
      result.failed += batch.length;
    }
  }

  return result;
}

async function sendViaExpo(recipients, campaign, campaignId) {
  const result = { sent: 0, failed: 0, invalid: [] };
  const expo = new Expo();
  const data = buildDataPayload(campaignId, campaign);

  const messages = recipients
    .map((r) => r.expoPushToken)
    .filter((token) => token && Expo.isExpoPushToken(token))
    .map((token) => ({
      to: token,
      sound: "default",
      title: campaign.title,
      body: campaign.body,
      data,
      priority: "normal", // marketing: must not interrupt like a booking does
      channelId: PROMOTIONS_CHANNEL,
    }));

  if (!messages.length) return result;

  for (const batch of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(batch);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "ok") {
          result.sent += 1;
          return;
        }
        result.failed += 1;
        if (ticket.details && ticket.details.error === "DeviceNotRegistered") {
          result.invalid.push(batch[i].to);
        }
      });
    } catch (error) {
      console.error("campaigns: Expo batch failed", error.message);
      result.failed += batch.length;
    }
  }

  return result;
}

/** Clears tokens the provider reported as permanently dead, so later sends stay clean. */
async function pruneInvalidTokens(db, invalidTokens, recipients) {
  if (!invalidTokens.length) return 0;
  const dead = new Set(invalidTokens);
  const writes = recipients
    .filter((r) => dead.has(r.fcmToken) || dead.has(r.expoPushToken))
    .map((r) => {
      const patch = {};
      if (dead.has(r.fcmToken)) patch.fcmToken = null;
      if (dead.has(r.expoPushToken)) patch.expoPushToken = null;
      // r.source is the collection the recipient was read from ("users" or "servicemen").
      // Hardcoding "users" both created a junk doc under the wrong id and left the real
      // dead token in place, so every later campaign retried it.
      return db.collection(r.source || "users").doc(r.uid)
        .set(patch, { merge: true }).catch(() => null);
    });
  await Promise.all(writes);
  return writes.length;
}

/**
 * Pushes one campaign to an already-resolved, already-filtered recipient list.
 * Android goes over FCM, iOS over Expo; anyone whose preferred token is missing falls
 * back to the other transport rather than being dropped.
 */
async function pushToRecipients(db, messaging, recipients, campaign, campaignId) {
  const viaFcm = [];
  const viaExpo = [];

  recipients.forEach((r) => {
    const preferExpo = PREFER_EXPO_ON_IOS && r.platform === "ios";
    if (preferExpo) {
      if (r.expoPushToken) viaExpo.push(r);
      else if (r.fcmToken) viaFcm.push(r);
      return;
    }
    if (r.fcmToken) viaFcm.push(r);
    else if (r.expoPushToken) viaExpo.push(r);
  });

  const [fcm, expo] = await Promise.all([
    sendViaFcm(messaging, viaFcm, campaign, campaignId),
    sendViaExpo(viaExpo, campaign, campaignId),
  ]);

  const invalid = [...fcm.invalid, ...expo.invalid];
  const pruned = await pruneInvalidTokens(db, invalid, recipients);

  return {
    sent: fcm.sent + expo.sent,
    failed: fcm.failed + expo.failed,
    viaFcm: fcm.sent,
    viaExpo: expo.sent,
    pruned,
    targeted: recipients.length,
  };
}

// ---------------------------------------------------------------------------
// broadcast campaigns (admin-triggered)
// ---------------------------------------------------------------------------

/**
 * Audiences that genuinely mean "every customer", and so may stay as a shared document
 * the whole app reads. Anything narrower must not.
 */
const BROADCAST_AUDIENCES = new Set(["all_users", "all_customers"]);

const KNOWN_AUDIENCES = new Set([
  "all_users", "all_customers", "all_servicemen", "paid_subscribers",
  "unpaid_workers", "expiring_soon", "unverified_workers", "by_area",
]);

/**
 * Reads the audience off a campaign, whichever shape it was written in.
 *
 * The dashboard writes `audience` as a plain string with `area` beside it; a doc created
 * by hand or by the HTTP route uses `{type, area, uids}`. Both must work.
 *
 * An unrecognised value falls back to `all_users` rather than being passed through.
 * It previously fell through to resolveAudience's default branch, which loads workers
 * but not customers — so a campaign meant for customers went to servicemen instead.
 */
function readAudience(campaign) {
  const raw = campaign.audience;
  const obj = raw && typeof raw === "object" ? raw : {};
  const rawType = typeof raw === "string" ? raw : obj.type;
  const type = String(rawType || "").toLowerCase();

  const uids = Array.isArray(obj.uids) ? obj.uids
    : Array.isArray(campaign.uids) ? campaign.uids : null;

  return {
    type: KNOWN_AUDIENCES.has(type) ? type : "all_users",
    area: obj.area || campaign.area || "",
    uids,
  };
}

/**
 * Gives each customer their own copy of a narrowly-targeted campaign.
 *
 * The app shows every active doc in the shared `campaigns` collection, so a campaign
 * aimed at one city or at paid workers would still pop up for everyone in-app even
 * though the push went to the right people. Narrow audiences are therefore fanned out
 * into `users/{uid}/campaigns/{campaignId}` and the shared doc is hidden.
 */
async function writePersonalCopies(db, campaignId, campaign, recipients) {
  const customers = recipients.filter((r) => r.source === "users");
  if (!customers.length) return 0;

  const payload = {
    type: campaign.type || "announcement",
    category: campaign.category || "announcement",
    title: campaign.title || "",
    body: campaign.body || "",
    imageUrl: campaign.imageUrl || "",
    code: campaign.code || "",
    action: campaign.action || null,
    showPopup: campaign.showPopup !== false,
    isActive: true,
    status: "sent",
    targetAudience: "user",
    createdAt: new Date(),
  };

  let written = 0;
  // 500 writes per batch is the Firestore limit.
  for (const group of chunk(customers, 450)) {
    const batch = db.batch();
    group.forEach((r) => {
      batch.set(
        db.collection("users").doc(r.uid).collection(CAMPAIGNS).doc(campaignId),
        payload,
      );
    });
    try {
      await batch.commit();
      written += group.length;
    } catch (error) {
      console.error("campaigns: personal copy batch failed", error.message);
    }
  }
  return written;
}

/** Resolves the audience, drops opt-outs and those with no token, then sends. */
async function deliverBroadcastCampaign(db, messaging, campaignId, campaign) {
  const audience = readAudience(campaign);
  const audienceType = audience.type;

  const recipients = await resolveAudience(db, audienceType, audience.area, audience.uids);

  // Counted separately on purpose. Lumping them together reports "a third of your
  // customers muted you" when the real answer is usually "they never had a token".
  // Someone with neither a token nor consent is counted once, under noToken.
  const withToken = recipients.filter((r) => r.fcmToken || r.expoPushToken);
  const eligible = withToken.filter((r) => pushAllowed(r.data, campaign.category));

  // push:false is an in-app-only campaign: no notification, but it still publishes.
  const stats = campaign.push === false
    ? { targeted: 0, sent: 0, failed: 0, viaFcm: 0, viaExpo: 0, pruned: 0, note: "in-app only" }
    : await pushToRecipients(db, messaging, eligible, campaign, campaignId);

  stats.resolved = recipients.length;
  stats.noToken = recipients.length - withToken.length;
  stats.optedOut = withToken.length - eligible.length;

  // Who may see this in-app. A broadcast audience keeps the shared doc; anything narrower
  // is fanned out per person, and the caller hides the shared one.
  stats.isBroadcast = BROADCAST_AUDIENCES.has(audienceType) && !audience.uids;

  if (!stats.isBroadcast) {
    // Everyone targeted gets the in-app copy, including those with no push token —
    // a missing token is exactly who the popup exists for.
    const inAppFor = recipients.filter((r) => pushAllowed(r.data, campaign.category));
    stats.personalCopies = await writePersonalCopies(db, campaignId, campaign, inAppFor);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// birthdays (automatic)
// ---------------------------------------------------------------------------

async function loadBirthdayTemplate(db) {
  try {
    const doc = await db.collection(TEMPLATES).doc("birthday").get();
    if (doc.exists) return { ...BIRTHDAY_DEFAULTS, ...(doc.data() || {}) };
  } catch (error) {
    console.warn("campaigns: birthday template unreadable, using default", error.message);
  }
  return { ...BIRTHDAY_DEFAULTS };
}

/**
 * Wishes everyone whose birthday is today.
 *
 * The doc id carries the year (`bday-2027`) on purpose. Seen-state in the app is keyed by
 * campaign id, so reusing a fixed id would mark next year's wish as already seen and the
 * popup would silently never show again. It also makes the job idempotent: a retry finds
 * the doc already there and skips the person rather than wishing them twice.
 */
async function runBirthdayWishes(db, messaging, timeZone) {
  const now = new Date();
  const keys = birthdayKeysForToday(now, timeZone);
  const year = yearInZone(now, timeZone);
  const template = await loadBirthdayTemplate(db);

  const snaps = await Promise.all(
    keys.map((key) => db.collection("users").where("birthdayKey", "==", key).get()),
  );

  const recipients = [];
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => recipients.push(recipientFrom(d.id, d.data() || {})));
  });

  const summary = { keys, found: recipients.length, wished: 0, skipped: 0, sent: 0, failed: 0 };
  if (!recipients.length) return summary;

  for (const recipient of recipients) {
    // A birthday wish is category 'announcement', so only the master switch silences it.
    if (!pushAllowed(recipient.data, "announcement")) {
      summary.skipped += 1;
      continue;
    }

    const vars = { name: recipient.name || "there" };
    const campaign = {
      type: "birthday",
      category: "announcement",
      title: renderTemplate(template.title, vars),
      body: renderTemplate(template.body, vars),
      imageUrl: template.imageUrl || "",
      action: template.action || null,
      showPopup: true,
      isActive: true,
      status: "sent",
      targetAudience: "user",
      createdAt: new Date(),
    };

    const campaignId = `bday-${year}`;
    const ref = db.collection("users").doc(recipient.uid).collection(CAMPAIGNS).doc(campaignId);

    try {
      const existing = await ref.get();
      if (existing.exists) {
        summary.skipped += 1;
        continue;
      }
      await ref.set(campaign);
    } catch (error) {
      console.error(`campaigns: birthday write failed for ${recipient.uid}`, error.message);
      continue;
    }

    // The doc is written before the push, so the in-app wish survives a failed send.
    const stats = await pushToRecipients(db, messaging, [recipient], campaign, campaignId);
    summary.wished += 1;
    summary.sent += stats.sent;
    summary.failed += stats.failed;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

function normalizeIncoming(body) {
  const action = body.action || {};
  const type = String(body.type || "announcement").toLowerCase();
  return {
    type,
    category: String(body.category || (type === "offer" ? "promotions" : "announcement")),
    title: String(body.title || "").trim(),
    body: String(body.body || body.message || "").trim(),
    imageUrl: body.imageUrl || "",
    code: body.code || "",
    highlight: Boolean(body.highlight),
    action: action.screen || action.label ? {
      label: action.label || "",
      screen: action.screen || "",
      params: action.params || null,
    } : null,
    audience: {
      type: String(body.audience || "all_users"),
      area: body.area || "",
      uids: Array.isArray(body.uids) ? body.uids : null,
    },
    targetAudience: body.targetAudience || "user",
    showPopup: body.showPopup !== false,
    push: body.push !== false,
    isActive: true,
  };
}

/**
 * Mounts POST /notifications/campaigns/send on the dashboard's Express app — the path the
 * Notifications screen already calls, which until now fell through to a client-side stub
 * that wrote fake `delivered` counts and never sent anything.
 *
 * Set CAMPAIGN_API_KEY to require an `x-campaign-key` header. Left unset the route is open,
 * like every other route on this app — but this one can push to every user at once, so it
 * is worth setting.
 */
function registerCampaignRoutes(app, { db, messaging }) {
  app.post("/notifications/campaigns/send", async (req, res) => {
    try {
      // Fail closed. An unset CAMPAIGN_API_KEY must not leave a "push to every user"
      // endpoint open — this route is registered before the 404 handler, so it answers.
      const requiredKey = process.env.CAMPAIGN_API_KEY;
      if (!requiredKey || req.get("x-campaign-key") !== requiredKey) {
        return res.status(401).json({ success: false, error: "Invalid campaign key" });
      }

      const payload = normalizeIncoming(req.body || {});
      if (!payload.title && !payload.body) {
        return res.status(400).json({ success: false, error: "A title or message is required" });
      }

      const scheduledAt = req.body && req.body.scheduledAt
        ? new Date(req.body.scheduledAt) : null;
      const isScheduled = Boolean(scheduledAt && scheduledAt.getTime() > Date.now());

      const ref = await db.collection(CAMPAIGNS).add({
        ...payload,
        status: isScheduled ? "scheduled" : "sending",
        scheduledAt: scheduledAt || null,
        createdAt: new Date(),
        stats: null,
      });

      if (isScheduled) {
        return res.json({
          success: true, id: ref.id, status: "scheduled",
          scheduledAt: scheduledAt.toISOString(),
        });
      }

      const stats = payload.push
        ? await deliverBroadcastCampaign(db, messaging, ref.id, payload)
        : { targeted: 0, sent: 0, failed: 0, note: "push disabled for this campaign" };

      await ref.set({ status: "sent", sentAt: new Date(), stats }, { merge: true });
      return res.json({ success: true, id: ref.id, status: "sent", stats });
    } catch (error) {
      console.error("campaigns: send failed", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /** Aggregated open/delivery receipts written by the app, for the dashboard metrics. */
  app.get("/notifications/campaigns/:id/stats", async (req, res) => {
    try {
      const snap = await db.collection(EVENTS)
        .where("campaignId", "==", String(req.params.id)).get();
      const counts = { opened: 0, popup_shown: 0 };
      snap.docs.forEach((d) => {
        const event = (d.data() || {}).event;
        if (counts[event] !== undefined) counts[event] += 1;
      });
      return res.json({ success: true, campaignId: req.params.id, ...counts });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
}

/**
 * The two scheduled jobs. `functions` is the v1 namespace the dashboard already imports.
 */
function createCampaignSchedulers({ functions, db, messaging, timeZone = "Asia/Kolkata" }) {
  const sendBirthdayWishes = functions.pubsub
    .schedule("0 9 * * *")
    .timeZone(timeZone)
    .onRun(async () => {
      const summary = await runBirthdayWishes(db, messaging, timeZone);
      console.log("sendBirthdayWishes:", JSON.stringify(summary));
      return null;
    });

  // Every minute, not every five: the dashboard queues a campaign by writing the doc
  // rather than calling this function over HTTP (the function is IAM-protected and
  // making it public would expose a "push to every user" endpoint to the internet).
  // An admin pressing Send should not sit and wait, and 1,440 invocations a day is
  // nothing against the 2M free tier.
  const dispatchCampaigns = functions.pubsub
    .schedule("every 1 minutes")
    .onRun(async () => {
      // Single-field equality only. Combining `status ==` with `scheduledAt <=` is a
      // composite query and would need an index built on the `campaigns` collection;
      // the due-date check is done in memory instead, which costs nothing at this
      // volume and keeps the function independent of index deployment.
      const pending = await db.collection(CAMPAIGNS)
        .where("status", "==", "scheduled")
        .limit(100)
        .get();

      const now = Date.now();
      const due = {
        docs: pending.docs
          .filter((d) => {
            const at = millisOf((d.data() || {}).scheduledAt);
            return !at || at <= now; // a missing date means "send now"
          })
          .sort((a, b) => millisOf(a.data().scheduledAt) - millisOf(b.data().scheduledAt))
          .slice(0, 10),
      };

      for (const doc of due.docs) {
        // Claim it first. Two instances can overlap, and without this a scheduled
        // festival campaign goes out to everyone twice.
        const claimed = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists || (fresh.data() || {}).status !== "scheduled") return null;
          tx.update(doc.ref, { status: "sending", claimedAt: new Date() });
          return fresh.data();
        });
        if (!claimed) continue;

        try {
          // push:false means in-app only. It still has to reach "sent", because that is
          // what makes the campaign visible to the app at all.
          const stats = await deliverBroadcastCampaign(db, messaging, doc.id, {
            ...claimed,
            // push:false means in-app only, so skip the send but still fan out / publish.
            push: claimed.push !== false,
          });

          await doc.ref.set({
            status: "sent",
            sentAt: new Date(),
            stats,
            // A narrowly-targeted campaign now lives as per-person copies, so the shared
            // document must stop being visible or everyone would see it anyway.
            isActive: stats.isBroadcast,
          }, { merge: true });

          console.log(`dispatchCampaigns: ${doc.id}`, JSON.stringify(stats));
        } catch (error) {
          console.error(`dispatchCampaigns: ${doc.id} failed`, error.message);
          await doc.ref.set({ status: "failed", error: error.message }, { merge: true });
        }
      }
      return null;
    });

  return { sendBirthdayWishes, dispatchCampaigns };
}

module.exports = {
  registerCampaignRoutes,
  createCampaignSchedulers,
  // exported for the backfill script and tests
  runBirthdayWishes,
  resolveAudience,
  birthdayKeysForToday,
  pushAllowed,
  renderTemplate,
};
