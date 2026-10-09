import assert from 'assert';
import { evaluatePatientCaseSafety } from '../server/safetyEngine.js';
import { PatientCase, Vitals } from '../src/types/index.js';

// Helper to create a base case
const createBaseCase = (vitals: Partial<Vitals> = {}): Partial<PatientCase> => ({
  id: 'test-case-1',
  chief_complaint: 'Fever and headache',
  vitals: vitals as Vitals,
  patient: { syntheticName: 'John Doe', age: 30, sex: 'M' },
});

async function runTests() {
  console.log('Running Vitals Workflow Tests...');

  // 1. All five vitals missing
  let result = evaluatePatientCaseSafety(createBaseCase({}));
  assert(result.missingInformation.includes('Temperature reading not recorded'));
  assert(result.missingInformation.includes('Blood pressure not measured / provided'));
  assert(result.missingInformation.includes('Heart rate not recorded'));
  assert(result.missingInformation.includes('Pulse oximetry (SpO2) not recorded'));
  assert(result.missingInformation.includes('Respiratory rate not recorded'));
  console.log('✓ All five vitals missing properly identified.');

  // 2. Only some vitals missing
  result = evaluatePatientCaseSafety(createBaseCase({
    temperature: { value: 98.6, unit: 'F', source: 'Thermometer' },
    blood_pressure: { systolic: 120, diastolic: 80, source: 'Cuff' }
  }));
  assert(!result.missingInformation.includes('Temperature reading not recorded'));
  assert(!result.missingInformation.includes('Blood pressure not measured / provided'));
  assert(result.missingInformation.includes('Heart rate not recorded'));
  assert(result.missingInformation.includes('Pulse oximetry (SpO2) not recorded'));
  assert(result.missingInformation.includes('Respiratory rate not recorded'));
  console.log('✓ Partial missing vitals properly identified.');

  // 3. Valid actual measurements entered and saved (simulated via safety engine)
  result = evaluatePatientCaseSafety(createBaseCase({
    temperature: { value: 98.6, unit: 'F', source: 'Thermometer' },
    blood_pressure: { systolic: 120, diastolic: 80, source: 'Cuff' },
    heart_rate: { value: 80, unit: 'bpm', source: 'Oximeter' },
    spo2: { value: 98, unit: '%', source: 'Oximeter' },
    respiratory_rate: { value: 16, unit: 'breaths/min', source: 'Count' }
  }));
  assert(!result.missingInformation.some(msg => msg.includes('not recorded') || msg.includes('not measured')));
  console.log('✓ Valid complete vitals properly bypass missing info.');

  // 4. Invalid values / unusual but potentially real values (handled by Safety Engine flags)
  result = evaluatePatientCaseSafety(createBaseCase({
    temperature: { value: 104.5, unit: 'F', source: 'Thermometer' },
    blood_pressure: { systolic: 185, diastolic: 110, source: 'Cuff' },
    heart_rate: { value: 80, unit: 'bpm', source: 'Oximeter' },
    spo2: { value: 88, unit: '%', source: 'Oximeter' },
    respiratory_rate: { value: 16, unit: 'breaths/min', source: 'Count' }
  }));
  
  const hasSpO2Flag = result.safetyFlags.some(f => f.ruleId === 'VITAL_SPO2_CRITICAL');
  const hasBPFlag = result.safetyFlags.some(f => f.ruleId === 'VITAL_BP_SEVERE_HYPERTENSION');
  const hasTempFlag = result.safetyFlags.some(f => f.ruleId === 'VITAL_TEMP_HIGH');
  assert(hasSpO2Flag && hasBPFlag && hasTempFlag);
  console.log('✓ Safety alerts trigger appropriately for severe actual measurements.');

  console.log('\nAll tests passed successfully!');
}

runTests().catch(console.error);
