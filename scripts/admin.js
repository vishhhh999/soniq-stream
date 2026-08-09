// Admin CLI for granting/removing SONIQ Pro without going through Razorpay
// — for comping yourself, friends, testers, etc. Run against your real
// DATABASE_URL the same way you run init-db.js.
//
// Usage:
//   node scripts/admin.js grant <username-or-email> monthly [days=30]
//   node scripts/admin.js grant <username-or-email> yearly  [years=1]
//   node scripts/admin.js grant <username-or-email> forever
//   node scripts/admin.js extend <username-or-email> days=30
//   node scripts/admin.js remove <username-or-email>
//   node scripts/admin.js status <username-or-email>
//   node scripts/admin.js list
//
// Examples matching what you described:
//   node scripts/admin.js grant vishafterdark monthly days=60
//   node scripts/admin.js grant vishafterdark yearly years=3
//   node scripts/admin.js remove vishafterdark
//
// Grants set subscriptionStatus='comped' — a status distinct from real
// Razorpay 'active' subscriptions, so it's always clear in the DB who's
// actually paying vs who's been manually given access. Enforcement
// (lib/billing.ts isPaidStatus) checks a comped grant's periodEnd
// directly, since there's no webhook to expire it automatically the way
// a real subscription has — this script sets that expiry itself.
//
// IMPORTANT: `remove` only clears the LOCAL subscriptionStatus. If the
// person actually has a real Razorpay subscription (razorpaySubscriptionId
// set to a real sub, not just a comp), removing them here does NOT cancel
// that subscription on Razorpay's side — the next webhook event (e.g. a
// renewal charge) will just set them back to 'active'. To fully remove a
// real paying customer, cancel their subscription in the Razorpay
// dashboard directly, or build that into this script later if needed.
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (or export it) and retry.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

function parseArgs(rest) {
  // Accepts key=value pairs anywhere in the remaining args, e.g. "days=60".
  const out = {};
  for (const arg of rest) {
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    out[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  return out;
}

async function findUser(identifier) {
  const clean = identifier.replace(/^@/, "");
  const isEmail = clean.includes("@");
  const rows = isEmail
    ? await sql`SELECT id, username, email, subscription_status, subscription_period_end, razorpay_subscription_id FROM users WHERE email = ${clean}`
    : await sql`SELECT id, username, email, subscription_status, subscription_period_end, razorpay_subscription_id FROM users WHERE username = ${clean}`;
  return rows[0] || null;
}

async function grant(identifier, plan, opts) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}" (checked username, then email if it looked like one).`);
    return;
  }

  let periodEnd = null;
  if (plan === "monthly") {
    const days = parseInt(opts.days || "30", 10);
    periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  } else if (plan === "yearly") {
    const years = parseInt(opts.years || "1", 10);
    periodEnd = new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000);
  } else if (plan === "forever") {
    periodEnd = null; // no expiry
  } else {
    console.error(`Unknown plan "${plan}". Use monthly, yearly, or forever.`);
    return;
  }

  await sql`
    UPDATE users
    SET subscription_status = 'comped', subscription_period_end = ${periodEnd}
    WHERE id = ${user.id}
  `;

  console.log(
    `Granted @${user.username || user.email} Pro (comped)${periodEnd ? `, expires ${periodEnd.toISOString().slice(0, 10)}` : ", no expiry"}.`
  );
}

async function extend(identifier, opts) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}".`);
    return;
  }
  if (user.subscription_status !== "comped") {
    console.error(`@${user.username || user.email} is not currently comped (status: ${user.subscription_status}). Use "grant" instead.`);
    return;
  }
  const days = parseInt(opts.days || "30", 10);
  const base = user.subscription_period_end && new Date(user.subscription_period_end) > new Date() ? new Date(user.subscription_period_end) : new Date();
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  await sql`UPDATE users SET subscription_period_end = ${newEnd} WHERE id = ${user.id}`;
  console.log(`Extended @${user.username || user.email} by ${days} days, now expires ${newEnd.toISOString().slice(0, 10)}.`);
}

async function remove(identifier) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}".`);
    return;
  }
  if (user.razorpay_subscription_id) {
    console.warn(
      `Note: @${user.username || user.email} has a real razorpaySubscriptionId on file. This command only clears the local status — if they have an actual active Razorpay subscription, cancel it in the Razorpay dashboard too, or the next webhook event will set them back to 'active'.`
    );
  }
  await sql`
    UPDATE users
    SET subscription_status = 'free', subscription_period_end = NULL
    WHERE id = ${user.id}
  `;
  console.log(`Removed Pro access from @${user.username || user.email}.`);
}

async function status(identifier) {
  const user = await findUser(identifier);
  if (!user) {
    console.error(`No user found matching "${identifier}".`);
    return;
  }
  console.log({
    username: user.username,
    email: user.email,
    subscriptionStatus: user.subscription_status,
    subscriptionPeriodEnd: user.subscription_period_end,
    razorpaySubscriptionId: user.razorpay_subscription_id,
  });
}

async function list() {
  const rows = await sql`
    SELECT username, email, subscription_status, subscription_period_end
    FROM users
    WHERE subscription_status != 'free'
    ORDER BY subscription_period_end ASC NULLS LAST
  `;
  if (rows.length === 0) {
    console.log("No users currently on a paid or comped plan.");
    return;
  }
  for (const r of rows) {
    const who = r.username ? `@${r.username}` : r.email;
    const end = r.subscription_period_end ? r.subscription_period_end.toISOString().slice(0, 10) : "no expiry";
    console.log(`${who.padEnd(24)} ${r.subscription_status.padEnd(10)} ${end}`);
  }
}

async function main() {
  const [, , cmd, identifier, ...rest] = process.argv;
  const opts = parseArgs(rest);

  if (cmd === "grant") {
    const plan = rest[0];
    if (!identifier || !plan) {
      console.error("Usage: node scripts/admin.js grant <username> <monthly|yearly|forever> [days=N|years=N]");
      process.exit(1);
    }
    await grant(identifier, plan, opts);
  } else if (cmd === "extend") {
    if (!identifier) {
      console.error("Usage: node scripts/admin.js extend <username> days=N");
      process.exit(1);
    }
    await extend(identifier, opts);
  } else if (cmd === "remove") {
    if (!identifier) {
      console.error("Usage: node scripts/admin.js remove <username>");
      process.exit(1);
    }
    await remove(identifier);
  } else if (cmd === "status") {
    if (!identifier) {
      console.error("Usage: node scripts/admin.js status <username>");
      process.exit(1);
    }
    await status(identifier);
  } else if (cmd === "list") {
    await list();
  } else {
    console.log(`Usage:
  node scripts/admin.js grant <username> monthly [days=30]
  node scripts/admin.js grant <username> yearly [years=1]
  node scripts/admin.js grant <username> forever
  node scripts/admin.js extend <username> days=30
  node scripts/admin.js remove <username>
  node scripts/admin.js status <username>
  node scripts/admin.js list`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
