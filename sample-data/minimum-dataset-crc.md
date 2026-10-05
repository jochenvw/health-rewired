# Minimum dataset for colorectal cancer (UMC Utrecht)

> **Source and status.** English working translation of the minimum dataset (*minimale kern dataset*,
> MKD) for colorectal cancer that UMC Utrecht defined for MDT preparation and follow-up. This is a
> **data definition, not patient data**. It contains no patient records. Shared for the Oncology
> Hackathon 2026 Munich; check the original Dutch document before any real-world use.

Use this list as the **starting point for the "In six months" horizon** (see
`.github/hackathon/two-horizons.md`): which of these items does the idea need, which hospital
holds them today, and how much of the problem is solved by these items alone?

About 100 items, in two groups: recorded **once** per patient, and recorded **repeatedly** over the
course of treatment. A 32-item **medical summary** sits on top for the MDT.

## Recorded once

### Patient characteristics (12)
Age · Sex · Date of tumour diagnosis · Height · Medical history · Charlson Comorbidity Index (CCI) ·
Education level (proxy for socio-economic status) · Postcode area (proxy for socio-economic status;
the Netherlands Cancer Registry uses income per postcode area) · Ethnicity · Treating hospital ·
Family history · Intoxications (smoking, alcohol)

### Tumour (6)
How the tumour was diagnosed · How metastasis was diagnosed · cTNM · pTNM · Time from primary
diagnosis to first metastasis · Endoscopy report

### Pathology (11)
Topography · Morphology · Differentiation grade · Extramural invasion · Lymphatic invasion · Venous
invasion · Tumour budding · Distance to mesorectal fascia · Synchronous second tumour · Perforation ·
PALGA report (Dutch national pathology archive)

### Molecular (10)
- Non-metastatic CRC: MSI
- Metastatic CRC (mCRC): BRAF · RAS · MSI · HER2 · NGS · UGT1A1 mutation · DPYD genotyping · NTRK fusion · WGS

### Treatment (7)
Reason no tumour-directed treatment was given · Systemic therapy before or after surgery · Time from
primary diagnosis to start of systemic therapy · Surgery (yes/no) · HIPEC (yes/no) · Time from
primary diagnosis to surgery · Type and schedule of radiotherapy

### Quality indicator (1)
Radicality of resection

## Recorded repeatedly

### Patient (3)
- WHO performance status: at diagnosis, and before each treatment regimen
- Weight: at diagnosis, and before each treatment regimen
- Current medication: at diagnosis, and before each treatment regimen

### Tumour and imaging (6)
- Location of metastases
- Imaging results (including CT thorax-abdomen): staging; baseline before systemic therapy; at
  progression; before local treatment; every response evaluation
- Pelvic MRI in rectal cancer: initial local staging; after neoadjuvant therapy (restaging,
  pre-operative); suspected local recurrence
- Liver MRI in resectable liver metastases: staging of CRC with liver metastases; before local
  treatment of liver metastases
- Treatment response: pathological response after neoadjuvant therapy
- Local recurrence (yes/no)

### Laboratory (6)
- Full blood count: at diagnosis; at grade 3–4 toxicity
- Renal function: at diagnosis
- Liver function: at diagnosis; at grade 3–4 toxicity
- Albumin: at diagnosis
- CEA: curative setting at diagnosis; mCRC every measurement
- LDH: at diagnosis

### MDT (6, every MDT)
MDT conclusion · MDT treatment advice · **Is the MDT advice in line with the guideline?** ·
**Was the MDT advice followed in the treatment actually given?** · Reason for deviating from the
guideline or the MDT advice · Goal of treatment

These items close the learning loop: they record what was advised, whether it followed the
guideline, and what actually happened.

### Treatment, general (8)
Tumour-directed treatment given or not · Systemic therapy regimen (every regimen; de-escalation;
escalation; restart after a treatment pause) · Duration of systemic therapy (per agent) · Local
liver treatment (RFA / MWA / metastasectomy / wedge excision) · Radiotherapy (yes/no) · Patient's
treatment preference (and changes over time) · Treatment goal per treatment (at primary diagnosis) ·
Trials discussed

### Systemic therapy (7)
Reason to start · Planned number of cycles · Starting dose (full or reduced) · Dose reduction during
treatment · Reason for dose reduction (toxicity, progression, other) · Toxicity during treatment
(grade 3 or higher) · Reason to stop (progression, toxicity, drug holiday)

### Radiotherapy (7)
Reason to start · Early termination · Reason for early termination · Toxicity during treatment ·
Duration · Planned number of fractions · Reason to stop (progression, toxicity, drug holiday)

### Follow-up (4)
Overall survival · Time to treatment failure · Progression-free survival · Recurrence (yes/no)

### Quality indicators (5)
Treatment according to guideline (yes/no) · Admission due to toxicity · Waiting times (referral to
first outpatient visit) · Complicated course if admitted · Reason for deviating from the guideline

## Medical summary for the MDT (32)
Medical history · Comorbidities · Admissions during treatment · Tumour stage · Date of diagnosis ·
Date of resection · Stage at primary diagnosis · Primary tumour in situ · MSI · BRAF · RAS · Points of
attention · Current treatment modality with start date · Start and stop of each systemic therapy ·
Start and stop of each radiotherapy · Dates of local treatments (primary resection, metastasectomies,
ablations, radiotherapy) · Response to systemic therapy · Response to radiotherapy · Surgical
radicality (R0, R1, R2) · Dose reduction of systemic therapy · Reason for dose reduction · Reason to
switch or stop systemic therapy · Reason to switch or stop radiotherapy · Toxicity of systemic
therapy · Toxicity of radiotherapy · Dates of disease progression · Dates of recurrence · Current
medication · CEA at start · DPYD deficiency · UGT1A1 mutation · Early termination of radiotherapy

## Example: Anna Ricci (synthetic, `TUS-2026-0417`)

What the synthetic Italian record already covers, and what an MDT would still miss:

| Already there (synthetic) | Still missing |
|---|---|
| Age, sex, date of diagnosis, treating hospital | cTNM, WHO performance status, weight |
| Endoscopy report, morphology, differentiation grade (G2) | RAS, BRAF, MSI (requested, not reported) |
| Imaging: CT thorax-abdomen, liver MRI | Liver function, albumin, LDH |
| Full blood count (Hb), renal function (creatinine), CEA | MDT conclusion and advice, treatment goal |
