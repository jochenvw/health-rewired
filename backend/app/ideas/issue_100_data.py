"""Deterministic synthetic population data for the issue 100 prototype."""

import math
import random
import statistics
from collections import Counter
from typing import Any

SEED = 100_2026
REPORTING_THRESHOLD = 320
TRUST_DIMENSIONS = (
    ("Provenance", 0.2, 90, "The reported value traces to an EMR coding chain."),
    ("Independent corroboration", 0.18, 35, "Six records represent only three independent evidence chains."),
    ("Source reputation", 0.14, 85, "The EMR is a strong source for coded counts."),
    ("Semantic consistency", 0.18, 75, "Hospital A and B do not count the same procedure definition."),
    ("Incentive exposure", 0.12, 70, "The threshold warrants scrutiny, not an inference of intent."),
    ("Threshold proximity", 0.12, 15, "30 is exactly the reporting threshold."),
    ("Evidence completeness", 0.08, 15, "The OR log and pathology record disagree with the reported count."),
)
REPORTED_COUNT_DISTRIBUTION = ((28, 0.1), (29, 0.15), (30, 0.55), (31, 0.2))
APPROVED_COUNT_DISTRIBUTION = ((27, 0.1), (28, 0.35), (29, 0.35), (30, 0.2))
HOSPITAL_B_COUNT_DISTRIBUTION = ((28, 0.12), (29, 0.64), (30, 0.24))
OTHER_ONCOLOGY_EVENT_COUNT = 24_000
OTHER_EVENT_TYPES = ("Infusion / treatment", "Imaging or biopsy", "Follow-up", "Other procedure")

SITES = (
    ("A", "Nordhavn University Hospital", 2200, 355, 327, 355),
    ("B", "Rheinblick Cancer Centre", 2100, 400, 398, 401),
    ("C", "Alpenstadt Oncology Institute", 1800, 246, 194, 262),
    ("D", "Westhaven University Clinic", 2050, 390, 350, 390),
    ("E", "Sonnenberg Medical Centre", 1900, 310, 282, 315),
    ("F", "Danube Regional Hospital", 2150, 420, 385, 422),
    ("G", "Northgate Cancer Institute", 1800, 330, 302, 339),
    ("H", "Lakeside University Hospital", 2000, 360, 329, 361),
    ("I", "Central City Oncology Centre", 1750, 285, 260, 285),
    ("J", "Green Valley Hospital", 1950, 350, 317, 353),
    ("K", "Harbourview Medical Centre", 2150, 390, 350, 394),
    ("L", "Riverside Cancer Hospital", 2150, 381, 347, 386),
)

SOURCE_COUNTS = (
    ("EMR", 4217, "Independent source"),
    ("Cancer registry", 4175, "EMR coding feed"),
    ("Operating-room system", 4120, "Independent source"),
    ("Pathology", 3960, "Independent source"),
    ("Department reporting database", 4174, "EMR coding feed"),
    ("Manual spreadsheet", 4050, "Locally reconciled extract"),
    ("Research extract", 4217, "EMR coding feed"),
)

PATTERNS = (
    ("Secondary bowel resection during another primary operation", 206),
    ("Recurrent-disease procedure counted as incident", 82),
    ("Procedure date versus discharge date", 47),
    ("Unresolved after available evidence", 41),
)

CASES = (
    {
        "id": "SYN-C-2024-00817",
        "hospital": "Alpenstadt Oncology Institute",
        "year": 2024,
        "pattern": "Secondary bowel resection during another primary operation",
        "summary": "A secondary bowel resection was recorded during ovarian cytoreductive surgery.",
        "evidence": [
            {"source": "EMR procedure coding", "value": "Primary colorectal resection", "lineage": "EMR"},
            {
                "source": "Operating-room note",
                "value": "Bowel resection performed during ovarian surgery",
                "lineage": "OR",
            },
            {"source": "Research extract", "value": "Qualifying colorectal procedure", "lineage": "EMR"},
        ],
    },
    {
        "id": "SYN-C-2025-00314",
        "hospital": "Alpenstadt Oncology Institute",
        "year": 2025,
        "pattern": "Recurrent-disease procedure counted as incident",
        "summary": "A procedure for recurrent disease uses the same local code as an incident primary resection.",
        "evidence": [
            {"source": "Cancer registry", "value": "Colorectal primary · recurrence", "lineage": "Registry"},
            {"source": "Department report", "value": "Qualifying primary procedure", "lineage": "EMR"},
        ],
    },
    {
        "id": "SYN-B-2023-00102",
        "hospital": "Rheinblick Cancer Centre",
        "year": 2023,
        "pattern": "Procedure date versus discharge date",
        "summary": (
            "The operating-room system assigns the procedure to December; the registry uses a January discharge date."
        ),
        "evidence": [
            {"source": "Operating-room system", "value": "Procedure date · 2023-12-29", "lineage": "OR"},
            {"source": "Cancer registry", "value": "Discharge date · 2024-01-04", "lineage": "Registry"},
        ],
    },
)


def _stats(values: list[int]) -> dict[str, int | float]:
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "total": sum(ordered),
        "mean": round(statistics.mean(ordered), 1),
        "median": statistics.median(ordered),
        "standard_deviation": round(statistics.pstdev(ordered), 1),
        "minimum": ordered[0],
        "maximum": ordered[-1],
    }


def _trust_assessment() -> dict[str, Any]:
    score = round(sum(weight * rating for _, weight, rating, _ in TRUST_DIMENSIONS))
    return {
        "score": score,
        "confidence": 92,
        "dimensions": [
            {"label": label, "weight": weight, "rating": rating, "note": note}
            for label, weight, rating, note in TRUST_DIMENSIONS
        ],
    }


def _sample_count(rng: random.Random, distribution: tuple[tuple[int, float], ...]) -> int:
    draw = rng.random()
    cumulative = 0.0
    for count, probability in distribution:
        cumulative += probability
        if draw <= cumulative:
            return count
    return distribution[-1][0]


def _uncertainty_analysis(refined: bool) -> dict[str, Any]:
    rng = random.Random(SEED + 2)
    hospital_a = APPROVED_COUNT_DISTRIBUTION if refined else REPORTED_COUNT_DISTRIBUTION
    hospital_a_mean = 28.65 if refined else 29.85
    estimates = []
    for _ in range(500):
        count_a = _sample_count(rng, hospital_a)
        count_b = _sample_count(rng, HOSPITAL_B_COUNT_DISTRIBUTION)
        first = max(rng.random(), 0.0001)
        second = rng.random()
        normal = math.sqrt(-2 * math.log(first)) * math.cos(2 * math.pi * second)
        estimates.append(10 + (count_a - hospital_a_mean) * 3 - (count_b - 29.12) * 2 + normal * 5.8)
    estimates.sort()
    return {
        "simulations": len(estimates),
        "estimate": round(statistics.mean(estimates)),
        "lower": round(estimates[int(len(estimates) * 0.025)]),
        "upper": round(estimates[int(len(estimates) * 0.975)]),
        "hospital_a_distribution": [
            {"count": count, "probability_percent": round(probability * 100)} for count, probability in hospital_a
        ],
        "hospital_b_distribution": [
            {"count": count, "probability_percent": round(probability * 100)}
            for count, probability in HOSPITAL_B_COUNT_DISTRIBUTION
        ],
        "rule_approved": refined,
    }


def _definitions() -> list[dict[str, str]]:
    return [
        {
            "id": "inclusive",
            "version": "ONCO-CRC-PROC-v1",
            "name": "Inclusive clinical",
            "text": (
                "Count completed colorectal cancer resections, including a colorectal resection "
                "performed during another major abdominal operation."
            ),
        },
        {
            "id": "strict",
            "version": "ONCO-CRC-PROC-v1",
            "name": "Strict research",
            "text": (
                "Count completed primary colorectal resections for histologically confirmed malignant "
                "colorectal tumours. Exclude diagnostic procedures, secondary resections during another "
                "primary operation, recurrent-disease procedures and cancelled procedures."
            ),
        },
        {
            "id": "local",
            "version": "Local registry",
            "name": "Hospital-reported registry",
            "text": (
                "Use each hospital's designated oncology registry classification, including its "
                "documented local coding conventions."
            ),
        },
        {
            "id": "refined",
            "version": "ONCO-CRC-PROC-v2",
            "name": "Refined shared definition",
            "text": (
                "Count only completed primary colorectal resections. Do not include secondary bowel "
                "resections performed during another primary oncological operation."
            ),
        },
    ]


def build_dataset(selected_definition: str = "inclusive", refined: bool = False) -> dict[str, Any]:
    """Generate the same synthetic cohort and calculated summary on every call."""
    rng = random.Random(SEED)
    ages: list[int] = []
    cancer_types: Counter[str] = Counter()
    years: Counter[int] = Counter()
    for _site_id, _, patient_count, *_ in SITES:
        for _ in range(patient_count):
            ages.append(max(18, min(94, int(rng.gauss(66, 12)))))
            cancer_types[rng.choices(["Colorectal", "Breast", "Lung", "Other"], [0.38, 0.24, 0.2, 0.18])[0]] += 1
            years[rng.choice((2023, 2024, 2025, 2026))] += 1
    event_types = Counter(
        rng.choices(OTHER_EVENT_TYPES, [0.32, 0.24, 0.31, 0.13])[0] for _ in range(OTHER_ONCOLOGY_EVENT_COUNT)
    )

    events: list[dict[str, Any]] = []
    pattern_index = 0
    cause_pool = [name for name, count in PATTERNS for _ in range(count)]
    random.Random(SEED + 1).shuffle(cause_pool)
    patterns_by_site: dict[str, Counter[str]] = {}
    for site_id, _, _, inclusive_count, strict_count, _ in SITES:
        site_patterns: Counter[str] = Counter()
        for index in range(inclusive_count):
            if index >= strict_count:
                cause = cause_pool[pattern_index]
                pattern_index += 1
                site_patterns[cause] += 1
            else:
                cause = None
            events.append(
                {
                    "hospital": site_id,
                    "strict": index < strict_count,
                    "inclusive": True,
                    "cause": cause,
                }
            )
        patterns_by_site[site_id] = site_patterns

    representative_cases = list(CASES)
    represented_hospitals = {case["hospital"] for case in representative_cases}
    for index, (site_id, name, *_rest) in enumerate(SITES):
        if name in represented_hospitals:
            continue
        pattern = patterns_by_site[site_id].most_common(1)[0][0]
        template = next((case for case in CASES if case["pattern"] == pattern), CASES[0])
        representative_cases.append(
            {
                **template,
                "id": f"SYN-{site_id}-{2023 + index % 4}-{index + 1:04d}",
                "hospital": name,
                "year": 2023 + index % 4,
            }
        )

    by_id = {
        "strict": [sum(event["strict"] for event in events if event["hospital"] == site[0]) for site in SITES],
        "inclusive": [sum(event["inclusive"] for event in events if event["hospital"] == site[0]) for site in SITES],
        "local": [site[5] for site in SITES],
    }
    counts_by_definition = {
        "strict": [int(value) for value in by_id["strict"]],
        "inclusive": [int(value) for value in by_id["inclusive"]],
        "local": [int(value) for value in by_id["local"]],
        "refined": [int(value) for value in by_id["strict"]],
    }
    counts_by_definition["refined"] = list(counts_by_definition["strict"])

    sensitive_cases = sum(not event["strict"] for event in events)
    agreement_cases = 500
    agreement_before = [index >= 90 for index in range(agreement_cases)]
    agreement_after = [index >= 30 for index in range(agreement_cases)]
    unexplained_before = [index < 137 for index in range(agreement_cases)]
    unexplained_after = [index < 41 for index in range(agreement_cases)]
    sources = [{"name": name, "records": count, "lineage": lineage} for name, count, lineage in SOURCE_COUNTS]
    expected_source_records = len(events) * len(SOURCE_COUNTS)
    observed_source_records = sum(count for _, count, _ in SOURCE_COUNTS)
    duplicate_lineage_records = sum(count for _, count, lineage in SOURCE_COUNTS if lineage == "EMR coding feed") + sum(
        count for _, count, lineage in SOURCE_COUNTS if lineage == "Locally reconciled extract"
    )
    site_rows = []
    for index, (site_id, name, patient_count, *_rest) in enumerate(SITES):
        strict = counts_by_definition["strict"][index]
        inclusive = counts_by_definition["inclusive"][index]
        local = counts_by_definition["local"][index]
        sensitive = inclusive - strict
        site_rows.append(
            {
                "id": site_id,
                "name": name,
                "synthetic": True,
                "patients": patient_count,
                "strict": strict,
                "inclusive": inclusive,
                "local": local,
                "difference": sensitive,
                "difference_percent": round(sensitive / inclusive * 100, 1) if inclusive else 0,
                "strict_rate_per_1000": round(strict / patient_count * 1000, 1),
                "inclusive_rate_per_1000": round(inclusive / patient_count * 1000, 1),
                "source_completeness_percent": round(
                    (inclusive * len(SOURCE_COUNTS) - (50 + int(index < 6))) / (inclusive * len(SOURCE_COUNTS)) * 100,
                    1,
                ),
                "missing_source_records": 50 + int(index < 6),
                "patterns": [
                    {"name": pattern, "cases": count} for pattern, count in patterns_by_site[site_id].most_common()
                ],
                "top_two_patterns_percent": round(
                    sum(count for _, count in patterns_by_site[site_id].most_common(2)) / sensitive * 100, 1
                )
                if sensitive
                else 0,
            }
        )

    definition_stats = {
        definition_id: _stats(values)
        | {
            "hospitals_at_threshold": sum(value >= REPORTING_THRESHOLD for value in values),
            "reporting_threshold": REPORTING_THRESHOLD,
        }
        for definition_id, values in counts_by_definition.items()
    }
    pattern_details = [
        {"name": name, "cases": count, "percent_of_sensitive": round(count / sensitive_cases * 100, 1)}
        for name, count in PATTERNS
    ]
    overall_completeness = round(observed_source_records / expected_source_records * 100, 1)

    return {
        "synthetic": True,
        "seed": SEED,
        "generated_at_label": "Synthetic snapshot · 2023–2026",
        "patient_count": len(ages),
        "patient_age": {
            "mean": round(statistics.mean(ages), 1),
            "median": statistics.median(ages),
            "minimum": min(ages),
            "maximum": max(ages),
        },
        "cancer_types": dict(cancer_types),
        "patients_by_year": dict(sorted(years.items())),
        "hospital_count": len(SITES),
        "procedure_event_count": len(events) + OTHER_ONCOLOGY_EVENT_COUNT,
        "other_event_count": OTHER_ONCOLOGY_EVENT_COUNT,
        "other_event_types": dict(event_types),
        "modalities": sources,
        "quality": {
            "completeness_percent": overall_completeness,
            "expected_source_records": expected_source_records,
            "observed_source_records": observed_source_records,
            "missing_source_records": expected_source_records - observed_source_records,
            "dependent_lineage_records": duplicate_lineage_records,
            "duplicate_records": 96,
            "independent_modalities": sum(lineage == "Independent source" for _, _, lineage in SOURCE_COUNTS),
        },
        "definitions": _definitions(),
        "definition_stats": definition_stats,
        "selected_definition": "refined" if refined else selected_definition,
        "refinement_approved": refined,
        "definition_history": [
            {
                "version": "ONCO-CRC-PROC-v1",
                "status": "superseded" if refined else "current",
                "change": "Initial shared definition; secondary resection ambiguity unresolved.",
                "approved_by": "Research team · synthetic demo",
                "date": "2026-10-06",
            },
            {
                "version": "ONCO-CRC-PROC-v2",
                "status": "current" if refined else "candidate",
                "change": "Clarified: count primary colorectal resections only.",
                "approved_by": "Researcher" if refined else None,
                "date": "2026-10-07",
            },
        ],
        "trust_assessment": _trust_assessment(),
        "uncertainty_analysis": _uncertainty_analysis(refined),
        "hospitals": site_rows,
        "definition_sensitivity": {
            "cases": sensitive_cases,
            "percent": round(sensitive_cases / definition_stats["inclusive"]["total"] * 100, 1),
            "cross_hospital_agreement_before": round(sum(agreement_before) / agreement_cases * 100),
            "cross_hospital_agreement_after": round(sum(agreement_after) / agreement_cases * 100),
            "unexplained_before": sum(unexplained_before),
            "unexplained_after": sum(unexplained_after),
            "agreement_sample_size": agreement_cases,
        },
        "patterns": pattern_details,
        "representative_cases": representative_cases,
        "yearly_patient_count": dict(sorted(years.items())),
        "histogram": [
            {"age_band": f"{start}–{start + 9}", "patients": sum(start <= age <= start + 9 for age in ages)}
            for start in range(10, 100, 10)
        ],
        "definitions_note": (
            "Counts and metrics are generated and calculated in Python from a fixed synthetic seed. "
            "They are not real hospital results."
        ),
    }


def discrepancy_summary(hospital_id: str = "C") -> dict[str, Any]:
    """Return the precomputed synthetic findings used to ground the assistant's explanation."""
    dataset = build_dataset()
    hospital = next((row for row in dataset["hospitals"] if row["id"] == hospital_id), dataset["hospitals"][2])
    return {
        "hospital": hospital,
        "definition_sensitivity": dataset["definition_sensitivity"],
        "patterns": dataset["patterns"],
        "representative_cases": [
            case for case in dataset["representative_cases"] if case["hospital"].startswith(hospital["name"].split()[0])
        ]
        or dataset["representative_cases"],
    }
