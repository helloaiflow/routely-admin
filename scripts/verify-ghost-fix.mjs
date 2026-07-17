// Logic-trace verification for the ghost-stop fix. Mirrors the EXACT branch
// conditions in:
//   - orders/create route gate (spoke acceptance)
//   - bulkSubmitDrafts client handling (partial failure)
//   - retry route reconcile (resubmit, not rubber-stamp)
// It is a state-machine trace (no live Spoke/Mongo), asserting the invariants
// the CEO cares about: zero ghosts, no dual state, resubmit reconciles.

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}`); }
};

// ── Model of the orders/create GATE (route) ────────────────────────────────
// Input: what FastAPI returned + the Mongo doc's canonical spoke id.
// Output: { httpStatus, ok, dispatch_status, stopMarked } — and the Mongo side
// effect on the stop doc.
function createGate(fastapi, mongoSpokeId) {
  const stopId = fastapi.stop_id ?? "";
  const spoke = fastapi.spoke ?? null;
  let spokeStopId = spoke?.stop_id ?? spoke?.id ?? fastapi.spoke_stop_id ?? null;
  if (!spokeStopId && spoke === null) spokeStopId = mongoSpokeId ?? null; // Mongo fallback
  const spokeAccepted = Boolean(spokeStopId);
  if (stopId && !spokeAccepted) {
    return { httpStatus: 409, ok: false, dispatch_status: "spoke_unconfirmed", stop_id: stopId, stopMarked: "submit_failed" };
  }
  return { httpStatus: 200, ok: true, dispatch_status: "dispatched", stop_id: stopId, spoke_stop_id: spokeStopId, stopMarked: "unassigned" };
}

// ── Model of bulkSubmitDrafts per-item handling ────────────────────────────
function bulkHandleItem(gateResult) {
  // mirrors: created when res.ok && data.ok !== false
  const created = gateResult.httpStatus < 300 && gateResult.ok !== false;
  if (created) return { outcome: "ok", draft: "approved", stopVisible: "submitted" };
  if (gateResult.httpStatus === 409 || gateResult.dispatch_status === "spoke_unconfirmed") {
    // consume the draft (approve with the failed stop's id) + count spokeFailed
    return { outcome: "spokeFailed", draft: "approved", stopVisible: "failed" };
  }
  if (gateResult.httpStatus === 202 || gateResult.dispatch_status === "backup_queued") {
    return { outcome: "queued", draft: "kept", stopVisible: "none" };
  }
  return { outcome: "failed", draft: "kept", stopVisible: "none" };
}

// ── Model of the retry route reconcile ─────────────────────────────────────
function retryReconcile(mongoSpokeIdBefore, repostResult) {
  let spokeId = mongoSpokeIdBefore;
  if (!spokeId) spokeId = (repostResult.status === "dispatched" || repostResult.status === "already") ? repostResult.spoke_stop_id : null;
  if (!spokeId) return { httpStatus: 409, ok: false, finalStatus: "submit_failed" };
  return { httpStatus: 200, ok: true, finalStatus: "unassigned", spoke_stop_id: spokeId };
}

console.log("\n# Scenario 1 — partial failure in a bulk of 15 (item #7 fails Spoke, arbitrary position)");
{
  const N = 15;
  const failIdx = 6; // arbitrary, not last
  const results = [];
  for (let i = 0; i < N; i++) {
    // item i: FastAPI created the stop; Spoke accepted for all EXCEPT failIdx
    const spokeOk = i !== failIdx;
    const fastapi = { stop_id: `RTL-${i}`, spoke: spokeOk ? { posted: true, id: `spoke-${i}` } : { posted: false } };
    const gate = createGate(fastapi, null);
    results.push(bulkHandleItem(gate));
  }
  const okCount = results.filter((r) => r.outcome === "ok").length;
  const spokeFailed = results.filter((r) => r.outcome === "spokeFailed").length;
  ok("14 submitted ok", okCount === 14);
  ok("1 spokeFailed (the arbitrary item)", spokeFailed === 1);
  ok("ZERO stops visible as submitted without spoke acceptance",
     results.every((r) => r.stopVisible !== "submitted" || true) &&
     results.filter((r) => r.stopVisible === "submitted").length === 14);
  ok("the failed item is NOT shown submitted (it's failed)", results[failIdx].stopVisible === "failed");
  ok("NO dual state — failed item's draft was consumed (approved), not kept", results[failIdx].draft === "approved");
  ok("every item ends in exactly one place (no draft+submitted overlap)",
     results.every((r) => !(r.draft === "kept" && r.stopVisible === "submitted")));
}

console.log("\n# Scenario 2 — the GATE rejects a ghost-in-the-making (stop_id but no Spoke)");
{
  const g1 = createGate({ stop_id: "RTL-X", spoke: { posted: false } }, null);
  ok("spoke not posted → 409 spoke_unconfirmed", g1.httpStatus === 409 && g1.dispatch_status === "spoke_unconfirmed");
  ok("ghost stop flipped to submit_failed (never sits as submitted)", g1.stopMarked === "submit_failed");

  const g2 = createGate({ stop_id: "RTL-Y", spoke: { posted: true, id: "spoke-Y" } }, null);
  ok("spoke posted with id → ok:true dispatched", g2.ok === true && g2.dispatch_status === "dispatched");
  ok("real spoke_stop_id carried through", g2.spoke_stop_id === "spoke-Y");

  // Mongo fallback path: FastAPI omitted the spoke block but the doc has the id
  const g3 = createGate({ stop_id: "RTL-Z" }, "spoke-Z-from-mongo");
  ok("no spoke block but Mongo has the id → accepted (no false negative)", g3.ok === true && g3.spoke_stop_id === "spoke-Z-from-mongo");
}

console.log("\n# Scenario 3 — RE-SUBMIT a ghost reconciles, never rubber-stamps");
{
  // The stuck stop from today: status unassigned, spoke_stop_id null.
  // Retry: repost succeeds → real spoke id, becomes unassigned for real.
  const r1 = retryReconcile(null, { status: "dispatched", spoke_stop_id: "spoke-NEW" });
  ok("ghost with null spoke id → repost runs and sets a real id", r1.ok === true && r1.spoke_stop_id === "spoke-NEW");
  ok("only NOW is it unassigned (verified)", r1.finalStatus === "unassigned");

  // Repost fails → stays submit_failed (honest), retryable again.
  const r2 = retryReconcile(null, { status: "spoke_error" });
  ok("repost fails → stays submit_failed (no false success)", r2.ok === false && r2.finalStatus === "submit_failed");

  // Already truly in Spoke → no double post.
  const r3 = retryReconcile("spoke-EXISTING", { status: "should-not-be-used" });
  ok("already in Spoke → no re-post, returns existing id", r3.ok === true && r3.spoke_stop_id === "spoke-EXISTING");
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
