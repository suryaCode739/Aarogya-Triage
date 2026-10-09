import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { PatientCase } from '../types';

export const firestoreCasesService = {
  async saveCase(patientCase: PatientCase): Promise<void> {
    const caseRef = doc(db, 'cases', patientCase.id);
    try {
      await setDoc(caseRef, {
        ...patientCase,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `cases/${patientCase.id}`);
    }
  },

  async getAllCases(): Promise<PatientCase[]> {
    try {
      const snap = await getDocs(collection(db, 'cases'));
      const list: PatientCase[] = [];
      snap.forEach((d) => {
        list.push(d.data() as PatientCase);
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'cases');
      return [];
    }
  },

  subscribeToCases(onUpdate: (cases: PatientCase[]) => void): () => void {
    const path = 'cases';
    try {
      return onSnapshot(
        collection(db, path),
        (snapshot) => {
          const list: PatientCase[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as PatientCase);
          });
          if (list.length > 0) {
            onUpdate(list);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot listener notice:', error.message);
          if (error.code !== 'permission-denied') {
            try {
              handleFirestoreError(error, OperationType.LIST, path);
            } catch {
              // Ignore re-throw inside async listener
            }
          }
        }
      );
    } catch (e) {
      console.warn('Failed to initialize onSnapshot:', e);
      return () => {};
    }
  },
};
