import json

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/53", tags=["idea-53"])

DATA_PATH = "rectal-quality-network.json"


class NoParams(BaseModel):
    pass


def _raw_data() -> dict:
    return sample_data.read(DATA_PATH)


def _network_average(hospitals: list[dict], key: str) -> float:
    total_cases = sum(hospital["cases"] for hospital in hospitals)
    return round(sum(hospital["indicators"][key] * hospital["cases"] for hospital in hospitals) / total_cases, 1)


def _build_snapshot() -> dict:
    data = _raw_data()
    hospitals = data["hospitals"]
    hospital_f = next(hospital for hospital in hospitals if hospital["id"] == "F")
    network_time_to_treatment = _network_average(hospitals, "time_to_treatment")
    peer_mri_wait = round(
        sum(hospital["median_mri_wait_days"] for hospital in hospitals if hospital["id"] != "F") / (len(hospitals) - 1),
        1,
    )
    return {
        **data,
        "network_average": {
            indicator["key"]: _network_average(hospitals, indicator["key"]) for indicator in data["indicators"]
        },
        "signal": {
            "hospital_id": "F",
            "indicator": "time_to_treatment",
            "headline": "Hospital F time-to-treatment deviation",
            "observed": hospital_f["indicators"]["time_to_treatment"],
            "network_average": network_time_to_treatment,
            "target": 80,
            "gap": round(network_time_to_treatment - hospital_f["indicators"]["time_to_treatment"], 1),
            "likely_cause": "MRI waiting time",
            "cause_detail": (
                f"Hospital F median referral-to-MRI wait is {hospital_f['median_mri_wait_days']} days "
                f"versus {peer_mri_wait} days across peers; patient mix is similar."
            ),
            "next_quarter_observed": hospital_f["next_quarter"]["time_to_treatment"],
        },
    }


@define_tool(description="Return synthetic rectal-cancer network quality aggregates for issue 53.", skip_permission=True)
def get_rectal_quality_signal(params: NoParams) -> str:
    return json.dumps(_build_snapshot())


@router.get("/quality-snapshot")
async def quality_snapshot() -> dict:
    return _build_snapshot()


@router.post("/assistant")
async def assistant(request: AgentRequest) -> AgentResult:
    snapshot = _build_snapshot()
    prompt = (
        "You are helping a rectal-cancer tumour working group chair during a network quality meeting. "
        "Use get_rectal_quality_signal to inspect the synthetic aggregate data. Explain whether Hospital F's "
        "time-to-treatment signal is more likely patient mix or process delay, propose five anonymised local "
        "cases for audit, draft the audit agenda, and state what the simulated next quarter changes. "
        "Make clear that only totals crossed hospital boundaries and clinicians approve any action."
    )
    result = await run_agent(
        request,
        system_prompt=(
            "You are an oncology quality-improvement assistant. Be concise, clinically plain, and always keep "
            "human judgement explicit. Use the supplied tool before rendering UI."
        ),
        prompt=prompt,
        extra_tools=[get_rectal_quality_signal],
    )
    if result.mode == "copilot":
        return result
    return _fallback_agent_result(snapshot, result.note or "Copilot SDK not configured; showing deterministic demo.")


def _fallback_agent_result(snapshot: dict, note: str) -> AgentResult:
    signal = snapshot["signal"]
    return AgentResult(
        mode="fallback",
        headline="Likely cause: Hospital F MRI waiting time",
        trace=[TraceStep(tool="get_rectal_quality_signal", arguments=DATA_PATH)],
        note=note,
        blocks=[
            UIBlock(
                type="alert",
                title=signal["headline"],
                body=signal["cause_detail"],
                severity="warning",
                items=[
                    UIItem(
                        label="Treatment within 31 days",
                        detail=f"Hospital F {signal['observed']}% vs network {signal['network_average']}%",
                        severity="warning",
                    ),
                    UIItem(label="Likely cause", detail=signal["likely_cause"]),
                ],
            ),
            UIBlock(
                type="evidence",
                title="Five anonymised Hospital F cases for audit",
                items=[
                    UIItem(
                        label=case["local_id"],
                        detail=f"{case['tumour']} · MRI wait {case['mri_wait_days']} days · {case['reason']}",
                    )
                    for case in snapshot["audit_cases"]
                ],
            ),
            UIBlock(
                type="actions",
                title="Draft audit agenda and human decision",
                body=snapshot["intervention"]["expected_effect"],
                items=[UIItem(label=item) for item in snapshot["agenda"]],
            ),
        ],
    )
