# AarogyaTriage: Multimodal Healthcare Triage Assistant
### Non-Diagnostic Clinical Copilot for Government & Institutional Health Facilities in India

> **Core Philosophy:** *AI organizes. Rules safeguard. Humans decide.*

AarogyaTriage is an institutional, human-in-the-loop healthcare triage support system designed for Community Health Centres (CHCs), Primary Health Centres (PHCs), district hospitals, health camps, and campus health units.

The system helps healthcare workers and doctors convert patient-provided text, voice (Odia, Hindi, English), and physical medical reports (CBC, lab slips) into structured clinical triage notes for qualified medical officer evaluation.

---

## 1. Safety & Ethical Safeguards

- **Strict Non-Diagnostic Boundary:** The system does NOT diagnose diseases, prescribe medications, or recommend treatments.
- **Mandatory Advisory Label:** All outputs are labeled: *"Advisory / Triage Support Only — Final assessment must be performed by a qualified healthcare professional."*
- **Deterministic Urgency Rules:** Clinical urgency signals (e.g. SpO2 < 90%, BP Crisis, Severe Thrombocytopenia < 50k /µL, Dengue warning signs) are evaluated using calibrated, deterministic rules—never left to autonomous model hallucination.
- **Explainability:** Transparent *"Why was this flagged?"* factor cards displaying reason, evidence citations, source documents, and deterministic rule IDs without hidden chain-of-thought exposure.
- **Human Authority:** Healthcare reviewers have complete override power to edit triage notes, correct OCR measurements, verify test values, escalate cases, or draft inter-facility referrals.
- **Privacy & Synthetic Data:** Zero storage of Aadhaar numbers or personal contact identifiers. Built strictly for synthetic evaluation datasets.

---

## 2. Core Multimodal Architecture

1. **Voice Input (Speech-to-Text & Translation):**
   - Supports native Odia (ଓଡ଼ିଆ), Hindi (हिंदी), and English.
   - Dual-stream persistence: Retains original verbatim audio transcript alongside standardized English clinical interpretations.
2. **Medical Report OCR:**
   - Automated entity extraction from CBC reports, laboratory slips, and point-of-care vitals sheets.
   - Extracts Test Name, Numeric Value, Unit, Reference Interval, and Confidence Level (`HIGH`/`MEDIUM`/`LOW`).
3. **Structured Clinical State & Timeline:**
   - Chronological patient timeline (Day 1, Day 2, Today) with approximate indicators.
4. **Missing Information & Adaptive Follow-Up Engine:**
   - Detects unrecorded vitals, uncharacterized pain locations, missing durations, and pregnancy/LMP status.
   - Generates dynamic, concise follow-up questions understandable to ordinary patients.
5. **Inter-Facility Referral Generator:**
   - One-click drafting of formal PHC-to-District Hospital handover slips with physician endorsement workflow.

---

## 3. Demonstration Scenarios

- **Case C (PT-101) — Urgent Safety Signal (Dengue Warning Sign):**
  - 34M presenting with acute high fever, retro-orbital headache, persistent vomiting, petechial rash, and CBC with **Platelets 38,000 /µL**.
  - Triggers `RULE_THROMBOCYTOPENIA_CRITICAL` → `🔴 URGENT HUMAN REVIEW` → Transparent Explainability & Referral Slip.
- **Case B (PT-102) — Missing Information & Adaptive Follow-Up:**
  - 28F presenting with vague abdominal pain. Vitals, duration, and LMP unrecorded.
  - Demonstrates Missing Information Engine and interactive follow-up question answering.
- **Case A (PT-103) — Routine:**
  - 42M with mild 2-day runny nose and sore throat, stable normal vitals, assigned `🟢 ROUTINE` review.

---

## 4. Technology Stack

- **Backend:** Express full-stack server running TypeScript on Node.js (`server.ts`).
- **AI Engine:** Google Gemini Flash (`@google/genai`) with strict system prompts, response schemas, and prompt injection defense.
- **Frontend:** React SPA with Tailwind CSS and Lucide icons.
- **Safety Engine:** Deterministic rule engine (`server/safetyEngine.ts`).
