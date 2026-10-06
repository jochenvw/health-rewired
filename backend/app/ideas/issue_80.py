"""Reviewed synthetic facts → fictional conditional pathways, never clinical advice."""

import csv
import io
import json
import re
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.tools import NoParams
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/80", tags=["idea-80"])
DISCLAIMER = "Hackathon prototype – synthetic data – not for clinical use. All excerpts are fictional and unverified."
MISSING_BRANCHES = {
    "stage": ["Localized pathway", "Metastatic pathway"],
    "ct": ["Non-metastatic staging confirmed", "Metastatic staging confirmed"],
    "mmr": ["dMMR / MSI-high discussion", "pMMR / MSS discussion"],
    "histology": ["Adenocarcinoma pathway", "Different histology — reassess applicability"],
    "ecog": ["Performance permits discussion", "Supportive / adapted approach after clinician assessment"],
    "comorbidity": ["Toxicity / comorbidity review", "Adapt hypothetical option to health conditions"],
    "allergy": ["Drug safety review", "Reconsider oxaliplatin-containing option"],
    "wishes": ["Shared decision-making", "Align options with patient priorities"],
}


class PrepareRequest(BaseModel):
    horizon: Literal["future", "six-months"] = "future"
    reviewed: bool = False
    fields: dict[str, str] = Field(default_factory=dict)


class ExcerptParams(BaseModel):
    excerpt_id: str = Field(
        description="Fictional excerpt id: localized, localized-it, localized-nccn, "
        "systemic-nl, systemic, systemic-nccn, ox, or mmr"
    )


@router.get("/record")
def get_record() -> dict:
    data = sample_data.read("issue-80/record.json")
    return {key: value for key, value in data.items() if key != "synthetic"}


def effective_record(request: PrepareRequest) -> dict:
    record = get_record()
    record["fields"] = [
        {
            **field,
            "value": request.fields.get(field["key"], field["value"]),
            "source": (
                "Clinician-reviewed correction"
                if field["key"] in request.fields and request.fields[field["key"]] != field["value"]
                else field["source"]
            ),
        }
        for field in record["fields"]
        if request.horizon == "future" or field["minimal"]
    ]
    # Do not leak excluded clinic/safety details through the original source documents.
    if request.horizon == "six-months":
        for field in record["fields"]:
            if field["key"] == "ecog" and "ecog" not in request.fields:
                field["value"] = "Unavailable from minimal feed; requires local clinic-note review"
                field["source"] = "WHO performance status — patient / clinic note; simulated availability gap"
        body = io.StringIO()
        writer = csv.writer(body)
        writer.writerow(["synthetic", "key", "label", "value", "source"])
        writer.writerows([True, f["key"], f["label"], f["value"], f["source"]] for f in record["fields"])
        record["documents"] = [
            {
                "name": "Minimal MDT extract.csv (synthetic; reviewed local report extracts)",
                "format": "CSV",
                "body": body.getvalue(),
            }
        ]
    return record


def unresolved(value: str) -> bool:
    return not value.strip() or bool(
        re.search(
            r"\b(pending|unknown|unavailable|awaiting|not available|not tested|uncertain|not done)\b", value.lower()
        )
    )


def match_reviewed(record: dict, horizon: str) -> dict:
    facts = {field["key"]: field["value"].strip().lower() for field in record["fields"]}
    metadata = {field["key"]: field for field in record["fields"]}
    stage, ct, mmr = (facts[key] for key in ("stage", "ct", "mmr"))
    ct_negative = bool(
        re.search(r"\b(no|without|negative for)\s+(distant\s+)?(metastases|metastatic disease)\b", ct)
        or ct in ("negative", "m0")
    )
    ct_positive = bool(re.search(r"\bmetastases (present|confirmed)\b|\bm1[a-c]?\b", ct)) or ct in (
        "positive",
        "metastatic disease",
    )
    ct_pending = unresolved(ct) or ct_negative == ct_positive
    metastatic = bool(re.search(r"m1[a-c]?\b|\bstage iv\b", stage)) or stage == "metastatic"
    localized = bool(re.search(r"m0\b", stage)) or stage in ("localized", "non-metastatic")
    if not ct_pending:
        if ct_negative:
            localized = True
        elif ct_positive:
            metastatic = True
    # Conflicting or unconfirmed staging preserves both branches.
    staging_conflict = localized and metastatic
    pathways = ["localized", "metastatic"]
    if metastatic and not localized:
        pathways = ["metastatic"]
    elif localized and not metastatic and not ct_pending:
        pathways = ["localized"]
    mmr_deficient = bool(re.search(r"\bdmmr\b|\bmsi[- ]high\b", mmr))
    mmr_proficient = bool(re.search(r"\bpmmr\b|\bmss\b|\bmsi[- ](stable|negative)\b", mmr))
    mmr_pending = unresolved(mmr) or mmr_deficient == mmr_proficient
    missing = []
    for key in metadata:
        unknown = unresolved(facts[key])
        if key == "stage":
            unknown = unknown or len(pathways) == 2
        if key == "mmr":
            unknown = mmr_pending
        if key == "ct":
            unknown = ct_pending
        if unknown:
            missing.append(
                {
                    "label": metadata[key]["label"],
                    "status": "Pending" if "pending" in facts[key] else "Unknown / needs clarification",
                    "source": f"{metadata[key]['source']}: {metadata[key]['value']}",
                    "branches": MISSING_BRANCHES[key],
                }
            )
    if horizon == "six-months":
        for key, label in (("allergy", "Drug hypersensitivity"), ("wishes", "Patient wishes")):
            missing.append(
                {
                    "label": label,
                    "status": "Outside minimal dataset — unavailable, not negative",
                    "source": "Patient / clinic note; requires local clinician review",
                    "branches": MISSING_BRANCHES[key],
                }
            )
    conflicts = []
    ox_option = "Metastatic pathway: hypothetical oxaliplatin-containing option"
    for key, pattern, negative, reason in (
        (
            "allergy",
            r"oxaliplatin.*(hypersensitivity|allerg)|hypersensitivity.*oxaliplatin",
            r"(no|denies|without)\s+(known\s+)?(oxaliplatin\s+)?(hypersensitivity|allerg)",
            "Reviewed oxaliplatin hypersensitivity history conflicts with this hypothetical option.",
        ),
        (
            "comorbidity",
            r"\bneuropathy\b",
            r"(no|denies|without)\s+(persistent\s+|sensory\s+)?neuropathy|neuropathy\s+(resolved|absent)",
            "Reviewed neuropathy requires reconsidering potential hand-function toxicity.",
        ),
        (
            "wishes",
            r"hand function|piano",
            r"(no|without)\s+(hand.function\s+)?(preference|priority)",
            "The patient's hand-function priority requires shared decision-making.",
        ),
    ):
        value = facts.get(key, "")
        if any(
            re.search(pattern, clause) and not re.search(negative, clause) for clause in re.split(r"[;,\n.]", value)
        ):
            conflicts.append({"option": ox_option, "reason": reason})
    if staging_conflict:
        conflicts.append(
            {
                "option": "Staging pathway",
                "reason": "Reviewed stage and CT disagree; resolve before selecting a pathway.",
            }
        )
    recommendations = []
    histology_ok = bool(
        re.fullmatch(
            r"(?:colorectal |colon |sigmoid |well differentiated |moderately differentiated |poorly differentiated )*"
            r"adenocarcinoma",
            facts["histology"],
        )
    )
    performance = re.search(r"\b([0-4])\b", facts["ecog"])
    performance_review = performance is None or int(performance[1]) >= 3
    for excerpt in sample_data.read("issue-80/guidelines.json")["excerpts"]:
        branch = excerpt["branch"]
        if branch not in pathways or (excerpt["id"] == "mmr" and mmr_proficient and not mmr_pending):
            continue
        conditional = bool(missing) or len(pathways) == 2 or not histology_ok or staging_conflict
        status = "Conditional — resolve missing facts" if conditional else "For MDT discussion — not treatment advice"
        if not histology_ok:
            status = "On hold — confirm adenocarcinoma; toy pathway may not apply"
        elif performance_review:
            status = "On hold — clinician assessment of performance status required"
        if excerpt["id"] == "ox" and any(c["option"] == ox_option for c in conflicts):
            status = "Conflict — requires clinician reconsideration"
        recommendations.append(
            {
                **{key: excerpt[key] for key in ("guideline", "option", "passage", "source")},
                "used": [f"{key}: {metadata[key]['value']}" for key in excerpt["used"] if key in metadata],
                "status": status,
            }
        )
    return {"recommendations": recommendations, "missing": missing, "conflicts": conflicts}


def extra_tools(record: dict, result: dict) -> list:
    @define_tool(
        name="issue80_reviewed_facts",
        description="Read only the effective reviewed facts for this horizon.",
        skip_permission=True,
    )
    def reviewed_facts(params: NoParams) -> str:
        return json.dumps({"fields": record["fields"], "synthetic": True})

    @define_tool(
        name="issue80_retrieve_excerpt",
        description="Retrieve one fictional, unverified teaching excerpt.",
        skip_permission=True,
    )
    def retrieve_excerpt(params: ExcerptParams) -> str:
        excerpts = sample_data.read("issue-80/guidelines.json")
        return json.dumps(
            next(
                (e for e in excerpts["excerpts"] if e["id"] == params.excerpt_id),
                {"error": "Unknown fictional excerpt"},
            )
        )

    @define_tool(
        name="issue80_match_reviewed",
        description="Read the conditional matching of reviewed facts and gaps.",
        skip_permission=True,
    )
    def matching(params: NoParams) -> str:
        return json.dumps(result)

    return [reviewed_facts, retrieve_excerpt, matching]


def demo_agent(record: dict, result: dict, *, reviewed: bool, note: str | None = None) -> AgentResult:
    blocks = [
        UIBlock(type="summary", title="Synthetic preparation", body=DISCLAIMER),
        UIBlock(
            type="patient_card",
            title="Reviewed facts" if reviewed else "Extraction — clinician review required",
            items=[UIItem(label=f["label"], detail=f["value"], source=f["source"]) for f in record["fields"]],
        ),
    ]
    if len(record["fields"]) < 8:
        blocks.append(
            UIBlock(
                type="alert",
                title="Six-month coverage assumptions",
                severity="warning",
                body=(
                    "Report-text CT, stage, MMR and medical history require local extraction and review; "
                    "ECOG is often a clinic-note gap. These synthetic local values are not guaranteed "
                    "structured hospital feeds. Allergy and wishes are unavailable, not negative."
                ),
            )
        )
    if reviewed:
        blocks.extend(
            [
                UIBlock(
                    type="evidence",
                    title="Fictional conditional options",
                    items=[
                        UIItem(label=r["option"], detail=f"{r['status']}. {r['passage']}", source=r["source"])
                        for r in result["recommendations"]
                    ],
                ),
                UIBlock(
                    type="alert",
                    title="Missing facts and conflicts",
                    severity="warning",
                    items=[
                        *[UIItem(label=m["label"], detail=m["status"], source=m["source"]) for m in result["missing"]],
                        *[UIItem(label=c["option"], detail=c["reason"]) for c in result["conflicts"]],
                    ],
                ),
                UIBlock(
                    type="actions",
                    title="Human decisions",
                    body="Confirm results, resolve conflicts, then discuss at MDT.",
                ),
            ]
        )
    return AgentResult(
        mode="fallback",
        headline="Conditional MDT preparation" if reviewed else "Review extracted facts first",
        blocks=blocks,
        note=note or "Deterministic synthetic extraction; SDK not run before review.",
        trace=(
            [
                TraceStep(tool=name, arguments="Deterministic demo; no SDK execution")
                for name in ("issue80_reviewed_facts", "issue80_retrieve_excerpt", "issue80_match_reviewed")
            ]
            if reviewed
            else []
        ),
    )


@router.post("/prepare")
async def prepare(request: PrepareRequest) -> dict:
    record = effective_record(request)
    result = {"recommendations": [], "missing": [], "conflicts": []}
    if not request.reviewed:
        return {"record": record, **result, "agent": demo_agent(record, result, reviewed=False)}
    result = match_reviewed(record, request.horizon)
    agent = await run_agent(
        AgentRequest(task="Prepare conditional fictional MDT discussion after clinician review"),
        include_data_tools=False,
        system_prompt=(
            "You prepare issue 80's synthetic case for human MDT discussion, not treatment advice. "
            "Use only issue80_reviewed_facts, issue80_retrieve_excerpt and issue80_match_reviewed; "
            "do not read original records or use other data tools. Reviewed corrections override source documents. "
            "Preserve the matcher options, conditions, gaps and conflicts; unknown is never negative. "
            "All Dutch/Italian/NCCN-style excerpts are fictional, unverified, not actual guidelines. "
            "No real guideline claims. In six-months mode excluded allergy/wishes are unavailable, never safe. "
            "Finish using render_ui with summary, evidence, alert and human actions; include the prototype disclaimer."
        ),
        prompt=json.dumps({"horizon": request.horizon, "reviewed": True, "facts": record["fields"], **result}),
        extra_tools=extra_tools(record, result),
    )
    if agent.mode == "fallback":
        agent = demo_agent(record, result, reviewed=True, note=agent.note)
    return {"record": record, **result, "agent": agent}
