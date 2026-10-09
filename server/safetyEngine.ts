import { PatientCase, SafetyFlag, Contradiction, ReviewPriority } from '../src/types/index.js';

export interface EvaluationResult {
  safetyFlags: SafetyFlag[];
  contradictions: Contradiction[];
  recommendedPriority: ReviewPriority;
  missingInformation: string[];
}

export function evaluatePatientCaseSafety(patientCase: Partial<PatientCase>): EvaluationResult {
  const flags: SafetyFlag[] = [];
  const contradictions: Contradiction[] = [];
  const missing: string[] = [];

  const vitals = patientCase.vitals || {};
  const symptoms = patientCase.symptoms || [];
  const labs = patientCase.extracted_labs || [];
  const patient = patientCase.patient || { syntheticName: '', age: null, sex: null };
  const rawText = `${patientCase.chief_complaint || ''} ${patientCase.originalStatement || ''} ${patientCase.translatedStatement || ''} ${symptoms.map(s => s.name).join(' ')}`.toLowerCase();

  // 1. Vitals Deterministic Checks
  if (vitals.spo2?.value !== undefined && vitals.spo2.value !== null) {
    if (vitals.spo2.value < 90) {
      flags.push({
        id: `FLAG_SPO2_CRITICAL_${Date.now()}`,
        ruleId: 'VITAL_SPO2_CRITICAL',
        flag: 'Severe Hypoxemia Signal (SpO2 < 90%)',
        severity: 'URGENT',
        reason: 'Measured oxygen saturation is critically below standard clinical thresholds (< 90%).',
        evidence: [`SpO2 recorded at ${vitals.spo2.value}% (${vitals.spo2.source || 'vitals report'})`],
        source: vitals.spo2.source || 'Clinical Vitals',
        requires_human_review: true,
      });
    } else if (vitals.spo2.value <= 94) {
      flags.push({
        id: `FLAG_SPO2_LOW_${Date.now()}`,
        ruleId: 'VITAL_SPO2_LOW',
        flag: 'Low Oxygen Saturation Signal (SpO2 90-94%)',
        severity: 'PRIORITY',
        reason: 'Measured oxygen saturation indicates mild-to-moderate desaturation needing prompt human assessment.',
        evidence: [`SpO2 recorded at ${vitals.spo2.value}%`],
        source: vitals.spo2.source || 'Clinical Vitals',
        requires_human_review: true,
      });
    }
  }

  if (vitals.blood_pressure) {
    const { systolic, diastolic } = vitals.blood_pressure;
    if (systolic >= 180 || diastolic >= 120) {
      flags.push({
        id: `FLAG_BP_CRISIS_${Date.now()}`,
        ruleId: 'VITAL_BP_SEVERE_HYPERTENSION',
        flag: 'Potential Hypertensive Urgency Signal (BP ≥ 180/120 mmHg)',
        severity: 'URGENT',
        reason: 'Blood pressure reading indicates acute severe elevation requiring immediate healthcare personnel review.',
        evidence: [`Blood Pressure recorded at ${systolic}/${diastolic} mmHg`],
        source: vitals.blood_pressure.source || 'Clinical Vitals',
        requires_human_review: true,
      });
    } else if (systolic > 0 && systolic < 90) {
      flags.push({
        id: `FLAG_BP_HYPOTENSION_${Date.now()}`,
        ruleId: 'VITAL_BP_HYPOTENSION',
        flag: 'Hypotension Signal (SBP < 90 mmHg)',
        severity: 'URGENT',
        reason: 'Systolic blood pressure below 90 mmHg may indicate hemodynamic instability or shock.',
        evidence: [`Systolic BP recorded at ${systolic} mmHg`],
        source: vitals.blood_pressure.source || 'Clinical Vitals',
        requires_human_review: true,
      });
    }
  }

  if (vitals.temperature?.value !== undefined && vitals.temperature.value !== null) {
    const tempF = vitals.temperature.unit === 'C' ? (vitals.temperature.value * 9) / 5 + 32 : vitals.temperature.value;
    if (tempF >= 104) {
      flags.push({
        id: `FLAG_TEMP_HYPERPYREXIA_${Date.now()}`,
        ruleId: 'VITAL_TEMP_HIGH',
        flag: 'Hyperpyrexia Signal (Temp ≥ 104°F / 40°C)',
        severity: 'URGENT',
        reason: 'Extreme elevated body temperature observed.',
        evidence: [`Temperature recorded at ${vitals.temperature.value}°${vitals.temperature.unit}`],
        source: vitals.temperature.source || 'Reported Vitals',
        requires_human_review: true,
      });
    } else if (tempF >= 101.5) {
      flags.push({
        id: `FLAG_TEMP_FEVER_${Date.now()}`,
        ruleId: 'VITAL_TEMP_FEVER',
        flag: 'Significant Pyrexia Signal',
        severity: 'PRIORITY',
        reason: 'Elevated core temperature noted.',
        evidence: [`Temperature recorded at ${vitals.temperature.value}°${vitals.temperature.unit}`],
        source: vitals.temperature.source || 'Reported Vitals',
        requires_human_review: true,
      });
    }
  }

  // 2. Laboratory Deterministic Checks
  for (const lab of labs) {
    const testName = lab.test.toLowerCase();
    const val = lab.numericValue !== undefined ? lab.numericValue : parseFloat(lab.value.replace(/,/g, ''));
    if (!isNaN(val)) {
      if (testName.includes('platelet')) {
        if (val < 50000) {
          flags.push({
            id: `FLAG_LAB_PLT_CRITICAL_${Date.now()}`,
            ruleId: 'LAB_THROMBOCYTOPENIA_CRITICAL',
            flag: 'Critical Thrombocytopenia Signal (Platelets < 50,000 /µL)',
            severity: 'URGENT',
            reason: 'Platelet count is markedly suppressed, presenting high potential risk for spontaneous bleeding / dengue hemorrhagic warning sign.',
            evidence: [`Platelet count: ${val.toLocaleString()} ${lab.unit || '/µL'} from ${lab.sourceDocument}`],
            source: `${lab.sourceDocument} (Extracted Lab)`,
            requires_human_review: true,
          });
        } else if (val < 100000) {
          flags.push({
            id: `FLAG_LAB_PLT_LOW_${Date.now()}`,
            ruleId: 'LAB_THROMBOCYTOPENIA_MODERATE',
            flag: 'Thrombocytopenia Signal (Platelets < 100,000 /µL)',
            severity: 'PRIORITY',
            reason: 'Platelet count is moderately low, requiring clinical monitoring.',
            evidence: [`Platelet count: ${val.toLocaleString()} ${lab.unit || '/µL'}`],
            source: `${lab.sourceDocument} (Extracted Lab)`,
            requires_human_review: true,
          });
        }
      }

      if (testName.includes('wbc') || testName.includes('white blood') || testName.includes('tlc')) {
        if (val > 20000 || (val > 0 && val < 2500)) {
          flags.push({
            id: `FLAG_LAB_WBC_CRITICAL_${Date.now()}`,
            ruleId: 'LAB_LEUKOCYTE_EXTREME',
            flag: 'Severe Leukocyte Count Abnormality (WBC > 20k or < 2.5k)',
            severity: 'URGENT',
            reason: 'Extreme white blood cell count may reflect severe systemic infection, sepsis, or bone marrow suppression.',
            evidence: [`WBC: ${val.toLocaleString()} ${lab.unit || '/µL'}`],
            source: `${lab.sourceDocument} (Extracted Lab)`,
            requires_human_review: true,
          });
        }
      }

      if (testName.includes('hemoglobin') || testName === 'hb') {
        if (val < 7.0 && val > 0) {
          flags.push({
            id: `FLAG_LAB_HB_SEVERE_ANEMIA_${Date.now()}`,
            ruleId: 'LAB_SEVERE_ANEMIA',
            flag: 'Severe Anemia Signal (Hb < 7.0 g/dL)',
            severity: 'URGENT',
            reason: 'Severe drop in hemoglobin levels requires urgent human clinical evaluation for transfusion or acute blood loss.',
            evidence: [`Hemoglobin: ${val} ${lab.unit || 'g/dL'}`],
            source: `${lab.sourceDocument} (Extracted Lab)`,
            requires_human_review: true,
          });
        }
      }

      if (testName.includes('glucose') || testName.includes('sugar') || testName.includes('rbs')) {
        if (val > 350 || (val > 0 && val < 60)) {
          flags.push({
            id: `FLAG_LAB_GLUCOSE_CRISIS_${Date.now()}`,
            ruleId: 'LAB_GLUCOSE_EXTREME',
            flag: 'Critical Glycemic Reading Signal (> 350 mg/dL or < 60 mg/dL)',
            severity: 'URGENT',
            reason: 'Extreme glucose value flagged for acute hypo/hyperglycemic risk.',
            evidence: [`Glucose: ${val} ${lab.unit || 'mg/dL'}`],
            source: `${lab.sourceDocument} (Extracted Lab)`,
            requires_human_review: true,
          });
        }
      }
    }
  }

  // 3. Clinical Symptom Pattern Combinations
  const hasChestPain = rawText.includes('chest pain') || rawText.includes('chest tightness') || rawText.includes('छाती में दर्द') || rawText.includes('ଛାତିରେ ଯନ୍ତ୍ରଣା');
  const hasShortnessOfBreath = rawText.includes('shortness of breath') || rawText.includes('breathless') || rawText.includes('difficulty breathing') || rawText.includes('सांस लेने में तकलीफ') || rawText.includes('ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ');
  if (hasChestPain && hasShortnessOfBreath) {
    flags.push({
      id: `FLAG_CARDIORESP_${Date.now()}`,
      ruleId: 'SYMPTOM_CARDIORESP_RED_FLAG',
      flag: 'Cardiorespiratory Urgency Signal (Chest Pain + Dyspnea)',
      severity: 'URGENT',
      reason: 'Combination of reported acute chest pain and breathing distress presents high clinical priority.',
      evidence: ['Patient reports concurrent chest pain and shortness of breath.'],
      source: 'Patient Statement / Symptoms',
      requires_human_review: true,
    });
  } else if (hasChestPain) {
    flags.push({
      id: `FLAG_CHEST_PAIN_${Date.now()}`,
      ruleId: 'SYMPTOM_CHEST_PAIN',
      flag: 'Chest Pain Evaluation Signal',
      severity: 'PRIORITY',
      reason: 'Reported chest pain warrants targeted ECG and clinician triage.',
      evidence: ['Patient reported chest discomfort.'],
      source: 'Patient Statement',
      requires_human_review: true,
    });
  }

  const hasHighFever = rawText.includes('high fever') || rawText.includes('fever') || (vitals.temperature && vitals.temperature.value && vitals.temperature.value > 100);
  const hasRepeatedVomiting = rawText.includes('vomit') || rawText.includes('vomiting') || rawText.includes('उल्टी') || rawText.includes('ବାନ୍ତି');
  const hasPetechiaeOrBleeding = rawText.includes('bleed') || rawText.includes('red spots') || rawText.includes('rash') || rawText.includes('petechiae') || rawText.includes('black stool') || rawText.includes('blood in vomit');
  
  if (hasHighFever && (hasRepeatedVomiting || hasPetechiaeOrBleeding)) {
    flags.push({
      id: `FLAG_FEVER_WARNING_SIGNS_${Date.now()}`,
      ruleId: 'FEVER_ACUTE_WARNING_SIGNS',
      flag: 'Acute Febrile Illness with Warning Signs Signal',
      severity: 'URGENT',
      reason: 'Fever accompanied by persistent vomiting, bleeding tendency, or petechial signs (hallmark warning signs in endemic vector-borne illnesses such as Dengue).',
      evidence: [
        'Fever reported along with systemic warning symptoms (persistent vomiting / bleeding risk).'
      ],
      source: 'Patient Statement / Reported History',
      requires_human_review: true,
    });
  }

  const hasAlteredSensorium = rawText.includes('confusion') || rawText.includes('unconscious') || rawText.includes('fainted') || rawText.includes('seizure') || rawText.includes('fit') || rawText.includes('letharg');
  if (hasAlteredSensorium) {
    flags.push({
      id: `FLAG_NEURO_SENSORIUM_${Date.now()}`,
      ruleId: 'NEURO_ALTERED_SENSORIUM',
      flag: 'Neurological / Altered Consciousness Signal',
      severity: 'URGENT',
      reason: 'Reported confusion, syncopal episode, or altered mental status requires rapid physical examination.',
      evidence: ['Statement notes altered consciousness, confusion, or syncope.'],
      source: 'Patient Statement',
      requires_human_review: true,
    });
  }

  // 4. Vulnerable Patient Checks (Pediatric / Geriatric)
  if (patient.age !== null) {
    if (patient.age < 1 && hasHighFever) {
      flags.push({
        id: `FLAG_INFANT_FEVER_${Date.now()}`,
        ruleId: 'PEDIATRIC_INFANT_FEVER',
        flag: 'Pediatric Warning Signal (Infant < 1 yr with Fever)',
        severity: 'URGENT',
        reason: 'Infants under 12 months with acute fever have rapid risk of decompensation.',
        evidence: [`Patient age is ${patient.age} year(s) with reported fever.`],
        source: 'Demographics + Symptoms',
        requires_human_review: true,
      });
    }
  }

  // 5. Contradiction Detection
  // Example: Patient says "fever started yesterday" (1 day), but CBC date or report indicates illness for 5 days or previous history
  const feverSymptom = symptoms.find(s => s.name.toLowerCase().includes('fever'));
  if (feverSymptom && feverSymptom.duration) {
    const durLower = feverSymptom.duration.toLowerCase();
    if (durLower.includes('yesterday') || durLower.includes('1 day') || durLower.includes('today')) {
      // Check if any report text mentions duration > 3 days or dates
      const hasReportDiscrepancy = (patientCase.documents || []).some(d => {
        const text = (d.extractedText || '').toLowerCase();
        return text.includes('5 days') || text.includes('1 week') || text.includes('history of fever x');
      });
      if (hasReportDiscrepancy) {
        contradictions.push({
          id: `CONTRADICTION_FEVER_DUR_${Date.now()}`,
          title: 'Symptom Duration Discrepancy',
          description: 'Symptom duration differs between patient interview and uploaded document record.',
          itemA: { source: 'Patient Statement', statement: `Fever onset reported as: "${feverSymptom.duration}"` },
          itemB: { source: 'Uploaded Medical Record', statement: 'Document mentions symptoms persisting for several days prior.' },
          actionRequired: 'Reviewer verification required: Clarify true onset date during physical consultation.',
        });
      }
    }
  }

  // 6. Missing Information Engine
  if (patient.age === null) {
    missing.push('Patient age not provided');
  }
  if (!patient.sex) {
    missing.push('Patient biological sex not provided');
  }
  if (!vitals.temperature || vitals.temperature.value === null || vitals.temperature.value === undefined) {
    missing.push('Temperature reading not recorded');
  }
  if (!vitals.blood_pressure || vitals.blood_pressure.systolic === null || vitals.blood_pressure.systolic === undefined) {
    missing.push('Blood pressure not measured / provided');
  }
  if (!vitals.heart_rate || vitals.heart_rate.value === null || vitals.heart_rate.value === undefined) {
    missing.push('Heart rate not recorded');
  }
  if (!vitals.spo2 || vitals.spo2.value === null || vitals.spo2.value === undefined) {
    missing.push('Pulse oximetry (SpO2) not recorded');
  }
  if (!vitals.respiratory_rate || vitals.respiratory_rate.value === null || vitals.respiratory_rate.value === undefined) {
    missing.push('Respiratory rate not recorded');
  }
  if (!patientCase.medications || patientCase.medications.length === 0) {
    missing.push('Current medication history not specified');
  }
  if (!patientCase.allergies || patientCase.allergies.length === 0) {
    missing.push('Drug allergy status not documented');
  }
  if (symptoms.some(s => !s.duration)) {
    missing.push('Duration unspecified for one or more reported symptoms');
  }

  // Determine overall review priority
  let recommendedPriority: ReviewPriority = 'ROUTINE';
  if (flags.some(f => f.severity === 'URGENT')) {
    recommendedPriority = 'URGENT';
  } else if (flags.some(f => f.severity === 'PRIORITY')) {
    recommendedPriority = 'PRIORITY';
  }

  return {
    safetyFlags: flags,
    contradictions,
    recommendedPriority,
    missingInformation: missing,
  };
}
